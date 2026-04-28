/**
 * Recorder preload script — injected into the <webview>.
 * Captures DOM events and sends structured action objects to the host renderer.
 *
 * Communication: window.postMessage → webview 'ipc-message' is NOT available
 * for webview guest pages. Instead, we inject this as a content script and use
 * the webview's executeJavaScript + console.log bridge, or we inject via
 * webview preload (which has access to ipcRenderer via contextBridge).
 *
 * Since this runs in the webview's isolated preload context, we use
 * ipcRenderer.sendToHost() to communicate back to the <webview> tag in the
 * renderer process.
 */
const { ipcRenderer } = require('electron');

let isRecording = false;
let actionCounter = 0;

// ── Dedup/coalesce tracking ──────────────────────────────────────────────────
let lastClickSelector = null;    // Track last click to suppress click-before-type
let lastClickTimestamp = 0;
let lastSelectSelector = null;   // Suppress duplicate select events
let lastSelectValue = null;
let lastNavigateUrl = null;      // Suppress click+navigate dupes
let pendingClickAction = null;   // Hold click actions to check if a type follows
let pendingClickTimer = null;

// Listen for recording state changes from the renderer
ipcRenderer.on('set-recording', (_event, state) => {
  isRecording = state;
});

// Listen for element-pick mode
let isPicking = false;
let pickOverlay = null;

ipcRenderer.on('start-pick', () => {
  isPicking = true;
  injectPickOverlay();
});

ipcRenderer.on('stop-pick', () => {
  isPicking = false;
  removePickOverlay();
});

// ─── Selector Generation ─────────────────────────────────────────────────────

function getStableId(el) {
  if (el.id) {
    // Skip auto-generated IDs that are too dynamic (contain long hashes)
    if (/^[a-f0-9]{20,}$/i.test(el.id)) return null;
    return `#${el.id}`;
  }
  return null;
}

function getDrupalSelector(el) {
  const ds = el.getAttribute('data-drupal-selector');
  if (ds) return `[data-drupal-selector="${ds}"]`;
  return null;
}

function getNameSelector(el) {
  const name = el.getAttribute('name');
  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  return null;
}

function getLabelBasedSelector(el) {
  // For inputs/selects/textareas, find associated <label>
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        const text = label.textContent.trim().replace(/\s*\*$/, '');
        if (text) return { strategy: 'label', labelText: text, tag: el.tagName.toLowerCase() };
      }
    }
  }
  return null;
}

function getCssPath(el) {
  // Try to get a short, unique selector rather than a full chain
  // Strategy: walk up until we find an element with an ID, then build a short path down

  // 1. Try: parent with ID > direct child selector
  let parent = el.parentElement;
  for (let depth = 0; depth < 4 && parent; depth++) {
    if (parent.id && !/^[a-f0-9]{20,}$/i.test(parent.id)) {
      // Found a parent with a stable ID — build a short selector from here
      const tag = el.tagName.toLowerCase();
      const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
      if (siblings.length === 1) {
        return `#${parent.id} > ${tag}`;
      }
      // Try with classes
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\s+/)[0];
        if (cls && cls.length < 50) {
          const matches = parent.querySelectorAll(`:scope ${tag}.${cls}`);
          if (matches.length === 1) return `#${parent.id} ${tag}.${cls}`;
        }
      }
      // Use nth-child
      const idx = Array.from(parent.children).indexOf(el) + 1;
      return `#${parent.id} > :nth-child(${idx})`;
    }
    parent = parent.parentElement;
  }

  // 2. Fallback: build a compact path (max 3 levels deep)
  const parts = [];
  let current = el;
  let maxLevels = 3;
  while (current && current !== document.body && maxLevels-- > 0) {
    let selector = current.tagName.toLowerCase();
    if (current.id && !/^[a-f0-9]{20,}$/i.test(current.id)) {
      parts.unshift(`#${current.id}`);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c =>
        c.length < 40 && !c.startsWith('hover') && !c.startsWith('focus') &&
        !c.startsWith('active') && !c.startsWith('is-') && !c.includes('--open')
      ).slice(0, 2);
      if (classes.length > 0) {
        selector += '.' + classes.join('.');
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function getBestSelector(el) {
  // Priority: #id > [data-drupal-selector] > [name] > label-based > contains text > css path
  const stableId = getStableId(el);
  if (stableId) return { selector: stableId, strategy: 'id' };

  const drupal = getDrupalSelector(el);
  if (drupal) return { selector: drupal, strategy: 'data-drupal-selector' };

  const name = getNameSelector(el);
  if (name) return { selector: name, strategy: 'name' };

  const label = getLabelBasedSelector(el);
  if (label) return { selector: label, strategy: 'label' };

  // For buttons and links with short clean text, use text matching strategy
  if (['A', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button') {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length <= 60) {
      return {
        selector: text,
        strategy: 'contains',
        elementTag: el.tagName.toLowerCase(),
        useContains: true,
      };
    }
  }

  const css = getCssPath(el);
  return { selector: css, strategy: 'css' };
}

function getElementText(el) {
  const text = (el.textContent || el.innerText || '').trim();
  return text.length > 80 ? text.substring(0, 80) + '...' : text;
}

function getFieldLabel(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim().replace(/\s*\*$/, '');
  }
  // Walk up to find a wrapper with a label
  let parent = el.parentElement;
  for (let i = 0; i < 5 && parent; i++) {
    const label = parent.querySelector('label');
    if (label) return label.textContent.trim().replace(/\s*\*$/, '');
    parent = parent.parentElement;
  }
  return '';
}

// ─── Drupal-Specific Detection ───────────────────────────────────────────────

function isCKEditor5Area(el) {
  return el.closest('.ck-editor__editable') !== null ||
    el.closest('.ck-editor') !== null;
}

function isMediaLibraryButton(el) {
  const text = (el.textContent || '').toLowerCase().trim();
  return (el.tagName === 'BUTTON' || el.tagName === 'INPUT') &&
    (text.includes('add media') || text.includes('select media') || text.includes('insert selected'));
}

function isDropbuttonAction(el) {
  return el.closest('.dropbutton-widget') !== null ||
    el.closest('.toolbar-button--icon--dots') !== null;
}

function isTabledragHandle(el) {
  return el.closest('.tabledrag-handle') !== null;
}

function isDialogButton(el) {
  return el.closest('.ui-dialog') !== null;
}

function isAutocompleteResult(el) {
  return el.closest('.ui-autocomplete') !== null;
}

// ─── Action Description Generator ────────────────────────────────────────────

function describeAction(action) {
  switch (action.type) {
    case 'click': {
      if (action.drupalContext === 'media-library') return `I click the media library button`;
      if (action.drupalContext === 'dropbutton') return `I click on the "${action.elementText}" option`;
      if (action.drupalContext === 'dialog') return `I click "${action.elementText}" in the dialog`;
      if (action.drupalContext === 'autocomplete') return `I select "${action.elementText}" from autocomplete`;
      // Use clean text — strip excess whitespace and limit length
      let desc = (action.elementText || '').replace(/\s+/g, ' ').trim();
      if (desc.length > 50) desc = desc.substring(0, 50).trim() + '...';
      if (!desc) desc = action.elementTag || 'element';
      return `I click on "${desc}"`;
    }
    case 'type':
    case 'type_ckeditor': {
      if (action.drupalContext === 'ckeditor5') return `I enter content in the rich text editor`;
      const label = action.labelText || 'the field';
      return `I enter "${action.value}" in the ${label} field`;
    }
    case 'select': {
      const label = action.labelText || 'the dropdown';
      const display = action.selectedText || action.value;
      return `I select "${display}" from the ${label} dropdown`;
    }
    case 'check': {
      const label = action.labelText || 'the checkbox';
      return `I ${action.checked ? 'check' : 'uncheck'} the ${label} checkbox`;
    }
    case 'upload': {
      return `I upload the file "${action.fileName}"`;
    }
    case 'navigate': {
      // Always use the relative path in descriptions
      const path = action.relativePath || action.url;
      return `I navigate to ${path}`;
    }
    case 'submit': {
      return `I submit the form`;
    }
    default:
      return `I perform an action on the page`;
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

function sendAction(action) {
  action.id = `action_${++actionCounter}_${Date.now()}`;
  action.timestamp = Date.now();
  action.url = window.location.href;
  action.pageTitle = document.title;

  // Auto-strip base URL from navigate actions — always store relative paths
  if (action.type === 'navigate' && action.url) {
    try {
      const urlObj = new URL(action.url);
      action.relativePath = urlObj.pathname + urlObj.search + urlObj.hash;
    } catch {
      action.relativePath = action.url;
    }
  }

  action.description = describeAction(action);
  ipcRenderer.sendToHost('recorder-action', action);
}

function handleClick(e) {
  if (!isRecording) return;
  const el = e.target;

  // Skip clicks on our own pick overlay
  if (el.dataset && el.dataset.recorderOverlay) return;

  // ── Skip noise clicks ──────────────────────────────────────────────

  // Skip clicks on status message dismiss buttons (× close buttons)
  if (el.closest('.alert-dismissible') || el.closest('.messages--status') ||
      el.closest('.messages--warning') || el.closest('.messages--error') ||
      el.classList.contains('close') || el.getAttribute('data-dismiss') === 'alert') {
    return;
  }

  // Skip clicks on form input/textarea/select — the subsequent input/change event captures the real action
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
    // Record the click target so we can suppress it if a type event follows
    const { selector } = getBestSelector(el);
    lastClickSelector = selector;
    lastClickTimestamp = Date.now();
    return; // Don't record — the input/change handler will capture the meaningful action
  }

  // Skip clicks on labels for form elements (they just focus the input)
  if (el.tagName === 'LABEL' && el.getAttribute('for')) {
    return;
  }

  // ── Record meaningful clicks ───────────────────────────────────────

  // Flush any pending type before recording this click
  if (pendingTypeAction) {
    clearTimeout(typeDebounceTimer);
    sendAction(pendingTypeAction);
    pendingTypeAction = null;
  }

  const selectorResult = getBestSelector(el);
  const action = {
    type: 'click',
    selector: selectorResult.selector,
    selectorStrategy: selectorResult.strategy,
    useContains: selectorResult.useContains || false,
    elementTag: el.tagName.toLowerCase(),
    elementText: getElementText(el),
    labelText: getFieldLabel(el),
  };

  // Detect Drupal-specific contexts
  if (isMediaLibraryButton(el)) action.drupalContext = 'media-library';
  else if (isDropbuttonAction(el)) action.drupalContext = 'dropbutton';
  else if (isDialogButton(el)) action.drupalContext = 'dialog';
  else if (isAutocompleteResult(el)) action.drupalContext = 'autocomplete';
  else if (isTabledragHandle(el)) action.drupalContext = 'tabledrag';

  // If the click is on a link, track it so we can suppress the redundant navigate event
  if (el.tagName === 'A' || el.closest('a')) {
    const anchor = el.tagName === 'A' ? el : el.closest('a');
    if (anchor && anchor.href) {
      lastNavigateUrl = anchor.href;
    }
  }

  sendAction(action);
}

let typeDebounceTimer = null;
let pendingTypeAction = null;
let pendingTypeSelector = null; // Track which field has pending type

function handleInput(e) {
  if (!isRecording) return;
  const el = e.target;

  // ── SELECT handling with dedup ─────────────────────────────────────
  if (el.tagName === 'SELECT') {
    const { selector, strategy } = getBestSelector(el);
    const value = el.value;

    // Skip duplicate select events (same dropdown, same value)
    if (selector === lastSelectSelector && value === lastSelectValue) return;
    lastSelectSelector = selector;
    lastSelectValue = value;

    sendAction({
      type: 'select',
      selector,
      selectorStrategy: strategy,
      value,
      selectedText: el.options[el.selectedIndex]?.text || value,
      labelText: getFieldLabel(el),
      elementTag: 'select',
    });
    return;
  }

  if (el.type === 'checkbox' || el.type === 'radio') {
    const { selector, strategy } = getBestSelector(el);
    sendAction({
      type: 'check',
      selector,
      selectorStrategy: strategy,
      checked: el.checked,
      value: el.value,
      labelText: getFieldLabel(el),
      elementTag: el.tagName.toLowerCase(),
    });
    return;
  }

  if (el.type === 'file') {
    const files = Array.from(el.files || []);
    if (files.length === 0) return;
    const { selector, strategy } = getBestSelector(el);
    sendAction({
      type: 'upload',
      selector,
      selectorStrategy: strategy,
      fileName: files[0].name,
      fileCount: files.length,
      labelText: getFieldLabel(el),
      elementTag: 'input',
    });
    return;
  }

  // ── TEXT input with per-field coalescing ────────────────────────────
  // Only record the FINAL value when the user stops typing (800ms debounce)
  // If they're still editing the same field, update the pending value
  const { selector, strategy } = getBestSelector(el);
  const isCK = isCKEditor5Area(el);
  const fieldValue = el.value || el.textContent || '';

  // If there's a pending action for a DIFFERENT field, flush it first
  if (pendingTypeAction && pendingTypeSelector !== selector) {
    clearTimeout(typeDebounceTimer);
    sendAction(pendingTypeAction);
    pendingTypeAction = null;
  }

  pendingTypeSelector = selector;
  pendingTypeAction = {
    type: isCK ? 'type_ckeditor' : 'type',
    selector,
    selectorStrategy: strategy,
    value: fieldValue,
    labelText: getFieldLabel(el),
    elementTag: el.tagName.toLowerCase(),
    drupalContext: isCK ? 'ckeditor5' : undefined,
  };

  clearTimeout(typeDebounceTimer);
  typeDebounceTimer = setTimeout(() => {
    if (pendingTypeAction) {
      sendAction(pendingTypeAction);
      pendingTypeAction = null;
      pendingTypeSelector = null;
    }
  }, 800);
}

function handleSubmit(e) {
  if (!isRecording) return;
  // Flush any pending type action
  if (pendingTypeAction) {
    clearTimeout(typeDebounceTimer);
    sendAction(pendingTypeAction);
    pendingTypeAction = null;
    pendingTypeSelector = null;
  }

  const form = e.target;
  const { selector, strategy } = getBestSelector(form);
  sendAction({
    type: 'submit',
    selector,
    selectorStrategy: strategy,
    formAction: form.action || '',
    elementTag: 'form',
  });
}

function handleBlur(e) {
  // Flush pending type when user leaves a field — ensures we capture final value
  if (!isRecording) return;
  if (pendingTypeAction && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    clearTimeout(typeDebounceTimer);
    sendAction(pendingTypeAction);
    pendingTypeAction = null;
    pendingTypeSelector = null;
  }
}

// ─── Pick Mode (for element selection) ───────────────────────────────────────

// Track iframe drill-down state across pick sessions
let pickFramePath = [];      // Array of iframe indices for current depth
let pickFrameStack = [];     // Stack of { doc, overlay, highlight } for each frame level

function injectPickOverlay() {
  pickFramePath = [];
  pickFrameStack = [];
  _injectPickOverlayInDoc(document, true);
}

/**
 * Inject pick overlay into a specific document (top-level or iframe).
 * @param {Document} doc - the document to inject into
 * @param {boolean} isTop - true if this is the top-level document
 */
function _injectPickOverlayInDoc(doc, isTop) {
  // Remove any previous overlay in this document
  _removePickOverlayInDoc(doc);

  const overlay = doc.createElement('div');
  overlay.dataset.recorderOverlay = 'true';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;';
  doc.body.appendChild(overlay);

  const highlight = doc.createElement('div');
  highlight.dataset.recorderOverlay = 'true';
  highlight.style.cssText = 'position:fixed;pointer-events:none;border:2px solid #4f46e5;background:rgba(79,70,229,0.1);z-index:2147483646;display:none;';
  doc.body.appendChild(highlight);

  // Tooltip for iframe hints
  const tooltip = doc.createElement('div');
  tooltip.dataset.recorderOverlay = 'true';
  tooltip.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;display:none;padding:3px 8px;background:#1e1b4b;color:#e0e7ff;font:11px/1.3 sans-serif;border-radius:4px;white-space:nowrap;';
  doc.body.appendChild(tooltip);

  // Breadcrumb for frame depth indicator
  const breadcrumb = doc.createElement('div');
  breadcrumb.dataset.recorderOverlay = 'true';
  breadcrumb.style.cssText = 'position:fixed;top:4px;left:4px;z-index:2147483647;padding:4px 10px;background:#312e81;color:#c7d2fe;font:11px/1.4 sans-serif;border-radius:4px;display:flex;gap:6px;align-items:center;pointer-events:auto;';
  // Build breadcrumb text
  let crumbHtml = '<span style="opacity:.6">Top</span>';
  pickFramePath.forEach((idx, i) => {
    crumbHtml += ` <span style="opacity:.4">›</span> <span>Frame ${idx}</span>`;
  });
  if (pickFramePath.length > 0) {
    crumbHtml += ` <span data-action="back" style="margin-left:6px;cursor:pointer;color:#a5b4fc;text-decoration:underline;">↑ Back</span>`;
  }
  crumbHtml += ` <span data-action="close" style="margin-left:6px;cursor:pointer;color:#fca5a5;">✕</span>`;
  breadcrumb.innerHTML = crumbHtml;
  doc.body.appendChild(breadcrumb);

  // Handle breadcrumb clicks
  breadcrumb.addEventListener('click', (e) => {
    const act = e.target.dataset.action;
    if (act === 'back') {
      _goBackOneFrame();
    } else if (act === 'close') {
      removePickOverlay();
    }
  });

  // Escape key to go back or close
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (pickFramePath.length > 0) {
        _goBackOneFrame();
      } else {
        removePickOverlay();
      }
    }
  };
  doc.addEventListener('keydown', keyHandler, true);

  overlay._highlight = highlight;
  overlay._tooltip = tooltip;
  overlay._breadcrumb = breadcrumb;
  overlay._keyHandler = keyHandler;
  overlay._doc = doc;

  // Save to stack
  pickFrameStack.push({ doc, overlay, highlight, tooltip, breadcrumb, keyHandler });

  // Also set the global pickOverlay to the current top-of-stack for removePickOverlay compat
  pickOverlay = overlay;

  overlay.addEventListener('mousemove', (e) => {
    overlay.style.pointerEvents = 'none';
    const target = doc.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = '';
    if (target && !target.dataset.recorderOverlay) {
      const rect = target.getBoundingClientRect();
      const isIframe = target.tagName === 'IFRAME';
      // Different highlight style for iframes
      if (isIframe) {
        highlight.style.border = '3px dashed #f97316';
        highlight.style.background = 'rgba(249, 115, 22, 0.08)';
        tooltip.textContent = 'Click to enter iframe';
        tooltip.style.display = 'block';
        tooltip.style.top = (rect.top - 24) + 'px';
        tooltip.style.left = rect.left + 'px';
      } else {
        highlight.style.border = '2px solid #4f46e5';
        highlight.style.background = 'rgba(79,70,229,0.1)';
        tooltip.style.display = 'none';
      }
      highlight.style.display = 'block';
      highlight.style.top = rect.top + 'px';
      highlight.style.left = rect.left + 'px';
      highlight.style.width = rect.width + 'px';
      highlight.style.height = rect.height + 'px';
    }
  });

  overlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    overlay.style.pointerEvents = 'none';
    const target = doc.elementFromPoint(e.clientX, e.clientY);
    overlay.style.pointerEvents = '';
    if (!target || target.dataset.recorderOverlay) return;

    // If user clicked an iframe, drill into it
    if (target.tagName === 'IFRAME') {
      _enterIframe(target, doc);
      return;
    }

    // Normal element pick — run getBestSelector in this document context
    const { selector, strategy } = getBestSelectorInDoc(target, doc);
    ipcRenderer.sendToHost('element-picked', {
      selector,
      strategy,
      elementTag: target.tagName.toLowerCase(),
      elementText: getElementText(target),
      labelText: getFieldLabel(target),
      framePath: pickFramePath.length > 0 ? [...pickFramePath] : undefined,
    });
    removePickOverlay();
  });
}

/**
 * Compute the index of an iframe among all <iframe> elements in its parent document.
 */
function _getIframeIndex(iframe, parentDoc) {
  const allIframes = parentDoc.querySelectorAll('iframe');
  for (let i = 0; i < allIframes.length; i++) {
    if (allIframes[i] === iframe) return i;
  }
  return 0;
}

/**
 * Drill into an iframe: compute its index, push to framePath, inject overlay inside.
 */
function _enterIframe(iframe, parentDoc) {
  let iframeDoc;
  try {
    iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  } catch (err) {
    // Cross-origin — show warning
    _showCrossOriginWarning(iframe, parentDoc);
    return;
  }
  if (!iframeDoc || !iframeDoc.body) {
    _showCrossOriginWarning(iframe, parentDoc);
    return;
  }
  const idx = _getIframeIndex(iframe, parentDoc);
  pickFramePath.push(idx);
  _injectPickOverlayInDoc(iframeDoc, false);
}

/**
 * Show a temporary cross-origin warning overlay on the iframe.
 */
function _showCrossOriginWarning(iframe, parentDoc) {
  const rect = iframe.getBoundingClientRect();
  const warn = parentDoc.createElement('div');
  warn.dataset.recorderOverlay = 'true';
  warn.style.cssText = `
    position:fixed;z-index:2147483647;pointer-events:none;
    top:${rect.top + rect.height / 2 - 18}px;left:${rect.left + rect.width / 2 - 120}px;
    padding:8px 16px;background:#7f1d1d;color:#fecaca;font:12px/1.4 sans-serif;border-radius:6px;
    text-align:center;white-space:nowrap;
  `;
  warn.textContent = '⚠ Cannot access cross-origin iframe';
  parentDoc.body.appendChild(warn);
  setTimeout(() => warn.remove(), 2500);
}

/**
 * Go back one frame level: remove overlay from current iframe, pop framePath.
 */
function _goBackOneFrame() {
  if (pickFrameStack.length <= 1) return;
  // Remove overlay from the deepest frame
  const top = pickFrameStack.pop();
  _removePickOverlayInDoc(top.doc, top);
  pickFramePath.pop();
  // Re-inject overlay in the parent doc (refresh breadcrumb)
  const parent = pickFrameStack.pop();
  _removePickOverlayInDoc(parent.doc, parent);
  _injectPickOverlayInDoc(parent.doc, pickFrameStack.length === 0);
}

/**
 * Remove overlay elements from a specific document.
 */
function _removePickOverlayInDoc(doc, frame) {
  try {
    if (frame) {
      if (frame.keyHandler) doc.removeEventListener('keydown', frame.keyHandler, true);
      if (frame.overlay) frame.overlay.remove();
      if (frame.highlight) frame.highlight.remove();
      if (frame.tooltip) frame.tooltip.remove();
      if (frame.breadcrumb) frame.breadcrumb.remove();
    } else {
      // Fallback: remove all overlay elements
      doc.querySelectorAll('[data-recorder-overlay]').forEach(el => el.remove());
    }
  } catch {}
}

/**
 * getBestSelector adapted for a given document context (may be an iframe doc).
 * Re-uses the same selector strategies but scoped to `doc`.
 */
function getBestSelectorInDoc(el, doc) {
  if (doc === document) return getBestSelector(el);

  // #id
  const stableId = getStableId(el);
  if (stableId) return { selector: stableId, strategy: 'id' };

  // [data-drupal-selector]
  const drupal = getDrupalSelector(el);
  if (drupal) return { selector: drupal, strategy: 'data-drupal-selector' };

  // [name]
  const name = getNameSelector(el);
  if (name) return { selector: name, strategy: 'name' };

  // label-based (need to search labels in the iframe's doc)
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
    const id = el.id;
    if (id) {
      const label = doc.querySelector(`label[for="${id}"]`);
      if (label) {
        const text = label.textContent.trim().replace(/\s*\*$/, '');
        if (text) return { selector: { strategy: 'label', labelText: text, tag: el.tagName.toLowerCase() }, strategy: 'label' };
      }
    }
  }

  // contains text
  if (['A', 'BUTTON'].includes(el.tagName) || el.getAttribute('role') === 'button') {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length <= 60) {
      return { selector: text, strategy: 'contains', elementTag: el.tagName.toLowerCase(), useContains: true };
    }
  }

  // CSS path (scoped to iframe doc)
  const css = getCssPath(el);
  return { selector: css, strategy: 'css' };
}

function removePickOverlay() {
  // Remove all overlays in the frame stack, deepest first
  while (pickFrameStack.length > 0) {
    const frame = pickFrameStack.pop();
    _removePickOverlayInDoc(frame.doc, frame);
  }
  pickFramePath = [];
  pickOverlay = null;
  isPicking = false;
}

// ─── Initialize ──────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('click', handleClick, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('change', handleInput, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('blur', handleBlur, true);

  // Observe for CKEditor5 instances and attach input listeners
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const ckEditable = node.querySelector?.('.ck-editor__editable');
        if (ckEditable) {
          ckEditable.addEventListener('input', handleInput, true);
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Notify host that preload is ready
  ipcRenderer.sendToHost('recorder-ready');
});

// ─── Replay Engine ───────────────────────────────────────────────────────────
// Executes actions in the webview on behalf of the replay controller.
// Receives `replay-action` from the renderer, performs the DOM action,
// and sends back `replay-result` with pass/fail status.

/**
 * Traverse a framePath array to get the target document inside nested iframes.
 * @param {number[]} framePath - e.g. [0, 2] means iframes[0].contentDocument → iframes[2].contentDocument
 * @returns {Document|null}
 */
function getTargetDocument(framePath) {
  if (!framePath || framePath.length === 0) return document;
  let doc = document;
  for (const idx of framePath) {
    try {
      const iframes = doc.querySelectorAll('iframe');
      const iframe = iframes[idx];
      if (!iframe) return null;
      doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return null;
    } catch {
      return null;
    }
  }
  return doc;
}

function highlightElement(el, success, targetDoc) {
  if (!el || !el.getBoundingClientRect) return;
  const doc = targetDoc || el.ownerDocument || document;
  const rect = el.getBoundingClientRect();
  const overlay = doc.createElement('div');
  overlay.dataset.recorderOverlay = 'true';
  const color = success ? '34, 197, 94' : '239, 68, 68';
  overlay.style.cssText = `
    position: fixed; z-index: 2147483640; pointer-events: none;
    top: ${rect.top - 2}px; left: ${rect.left - 2}px;
    width: ${rect.width + 4}px; height: ${rect.height + 4}px;
    border: 2px solid rgba(${color}, 0.9);
    background: rgba(${color}, 0.12);
    border-radius: 3px;
    transition: opacity 0.5s ease-out;
  `;
  doc.body.appendChild(overlay);
  setTimeout(() => { overlay.style.opacity = '0'; }, 600);
  setTimeout(() => { overlay.remove(); }, 1200);
}

function findElement(action, targetDoc) {
  const doc = targetDoc || document;
  // Try the primary selector
  if (action.selector) {
    // 'contains' strategy: find by tag + text content
    if (action.selectorStrategy === 'contains' || action.useContains) {
      const tag = action.elementTag || 'button';
      const text = (action.selector || action.elementText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const candidates = doc.querySelectorAll(tag);
      for (const el of candidates) {
        if (el.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(text)) return el;
      }
      // Broaden: try all clickable elements
      const broader = doc.querySelectorAll('a, button, input[type="submit"], input[type="button"]');
      for (const el of broader) {
        if (el.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(text)) return el;
      }
      return null;
    }
    // CSS selector
    try {
      const el = doc.querySelector(action.selector);
      if (el) return el;
    } catch {}
  }
  // Fallback: try elementText on common interactive elements
  if (action.elementText) {
    const text = action.elementText.replace(/\s+/g, ' ').trim().toLowerCase();
    const candidates = doc.querySelectorAll('a, button, input[type="submit"], input[type="button"], [role="button"]');
    for (const el of candidates) {
      if (el.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(text)) return el;
    }
  }
  return null;
}

function waitForElement(action, timeoutMs = 10000, targetDoc) {
  const doc = targetDoc || document;
  return new Promise((resolve) => {
    const el = findElement(action, doc);
    if (el) return resolve(el);
    const start = Date.now();
    const interval = setInterval(() => {
      const el = findElement(action, doc);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null); }
    }, 200);
  });
}

async function executeReplayAction(action) {
  const type = action.type;
  // Resolve the target document (may be inside nested iframes)
  const doc = getTargetDocument(action.framePath) || document;

  switch (type) {
    // ── Click ───────────────────────────────────────────────────────
    case 'click': {
      if (action.drupalContext === 'dropbutton') {
        return await replayDropbutton(action, doc);
      }
      if (action.drupalContext === 'dialog') {
        const btn = await waitForElement({ selector: '.ui-dialog-buttonpane button', elementText: action.elementText }, 10000, doc);
        if (!btn) return { status: 'failed', error: `Dialog button "${action.elementText}" not found` };
        btn.click();
        highlightElement(btn, true, doc);
        return { status: 'passed' };
      }
      if (action.drupalContext === 'media-library') {
        const btn = await waitForElement({ elementText: 'Add media', elementTag: 'button' , selectorStrategy: 'contains', useContains: true, selector: 'Add media' }, 10000, doc);
        if (!btn) return { status: 'failed', error: 'Media library button not found' };
        btn.click();
        highlightElement(btn, true, doc);
        return { status: 'passed' };
      }
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Element not found: ${action.selector || action.elementText}` };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.click();
      highlightElement(el, true, doc);
      return { status: 'passed' };
    }

    // ── Type ────────────────────────────────────────────────────────
    case 'type': {
      if (action.drupalContext === 'ckeditor5') {
        return await replayCKEditor(action);
      }
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Input not found: ${action.selector}` };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.focus();
      // Clear existing value
      if ('value' in el) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Set new value
      const nativeSetter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(el), 'value'
      )?.set || Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) nativeSetter.call(el, action.value || '');
      else el.value = action.value || '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      highlightElement(el, true, doc);
      return { status: 'passed' };
    }

    // ── CKEditor ────────────────────────────────────────────────────
    case 'type_ckeditor': {
      return await replayCKEditor(action);
    }

    // ── Select ──────────────────────────────────────────────────────
    case 'select': {
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Select not found: ${action.selector}` };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      el.value = action.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      highlightElement(el, true, doc);
      return { status: 'passed' };
    }

    // ── Check / Uncheck ─────────────────────────────────────────────
    case 'check': {
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Checkbox not found: ${action.selector}` };
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
      const shouldCheck = action.checked !== false;
      if (el.checked !== shouldCheck) el.click();
      highlightElement(el, true, doc);
      return { status: 'passed' };
    }

    // ── Upload ──────────────────────────────────────────────────────
    case 'upload': {
      // We can't truly set files programmatically for security reasons.
      // Signal back so the engine knows to skip or warn.
      return { status: 'passed', warning: 'File upload must be handled manually or via fixtures.' };
    }

    // ── Upload Media ────────────────────────────────────────────────
    case 'upload_media': {
      return { status: 'passed', warning: 'Media upload must be handled manually or via fixtures.' };
    }

    // ── Submit ──────────────────────────────────────────────────────
    case 'submit': {
      const selectors = ['#edit-submit', '#edit-gin-sticky-actions > .button--primary', '#gin-sticky-edit-submit'];
      let btn = null;
      for (const sel of selectors) {
        btn = doc.querySelector(sel);
        if (btn) break;
      }
      if (!btn) return { status: 'failed', error: 'Save/Submit button not found' };
      btn.scrollIntoView({ block: 'center', behavior: 'instant' });
      btn.click();
      highlightElement(btn, true, doc);
      return { status: 'passed' };
    }

    // ── Capture URL ─────────────────────────────────────────────────
    case 'capture_url': {
      return { status: 'passed', capturedUrl: window.location.href, variableName: action.variableName || 'lastPageUrlforsaved' };
    }

    // ── Use Captured URL ────────────────────────────────────────────
    case 'use_captured_url': {
      // Navigation handled by the renderer engine — just confirm
      return { status: 'passed' };
    }

    // ── Navigate ────────────────────────────────────────────────────
    case 'navigate': {
      // Navigation handled by the renderer engine — just confirm we're on the page
      return { status: 'passed' };
    }

    // ── Assert Visible ──────────────────────────────────────────────
    case 'assert_visible': {
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Element not found: ${action.selector}` };
      const rect = el.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
      highlightElement(el, visible, doc);
      return visible
        ? { status: 'passed' }
        : { status: 'failed', error: `Element exists but is not visible: ${action.selector}` };
    }

    // ── Assert Text ─────────────────────────────────────────────────
    case 'assert_text': {
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Element not found: ${action.selector}` };
      const text = (el.textContent || '').toLowerCase();
      const expected = (action.expectedText || '').toLowerCase();
      const pass = text.includes(expected);
      highlightElement(el, pass, doc);
      return pass
        ? { status: 'passed' }
        : { status: 'failed', error: `Expected text "${action.expectedText}" not found in element` };
    }

    // ── Assert URL ──────────────────────────────────────────────────
    case 'assert_url': {
      const current = window.location.href;
      const pass = current.includes(action.expectedText || '');
      return pass
        ? { status: 'passed' }
        : { status: 'failed', error: `URL "${current}" does not contain "${action.expectedText}"` };
    }

    // ── Assert Exists ───────────────────────────────────────────────
    case 'assert_exists': {
      const el = await waitForElement(action, 5000, doc);
      highlightElement(el, !!el, doc);
      return el
        ? { status: 'passed' }
        : { status: 'failed', error: `Element not found: ${action.selector}` };
    }

    // ── Assert Not Exists ───────────────────────────────────────────
    case 'assert_not_exists': {
      // Wait a short time to confirm it doesn't appear
      await new Promise(r => setTimeout(r, 1000));
      const el = findElement(action, doc);
      if (el) highlightElement(el, false, doc);
      return !el
        ? { status: 'passed' }
        : { status: 'failed', error: `Element unexpectedly exists: ${action.selector}` };
    }

    // ── Assert Status Message ───────────────────────────────────────
    case 'assert_status_message': {
      const patterns = {
        created: /has been created|has been saved/i,
        updated: /has been updated/i,
        deleted: /has been deleted/i,
        cloned: /clone.*has been created|has been cloned|node was cloned/i,
        saved: /has been saved/i,
      };
      const regex = patterns[action.messageType] || patterns.created;
      const selectors = ['.messages--status', '.messages', '.alert', '.messages__content'];
      let found = false;
      for (const sel of selectors) {
        const el = doc.querySelector(sel);
        if (el && regex.test(el.textContent)) {
          highlightElement(el, true, doc);
          found = true;
          break;
        }
      }
      if (!found) {
        // Wait and retry
        await new Promise(r => setTimeout(r, 3000));
        for (const sel of selectors) {
          const el = doc.querySelector(sel);
          if (el && regex.test(el.textContent)) {
            highlightElement(el, true, doc);
            found = true;
            break;
          }
        }
      }
      return found
        ? { status: 'passed', capturedUrl: window.location.href, variableName: action.messageType === 'cloned' ? 'lastPageUrlforCloned' : 'lastPageUrlforsaved' }
        : { status: 'failed', error: `Status message "${action.messageType}" not found on page` };
    }

    // ── Wait ────────────────────────────────────────────────────────
    case 'wait': {
      await new Promise(r => setTimeout(r, action.duration || 2000));
      return { status: 'passed' };
    }

    // ── Dropbutton Click ────────────────────────────────────────────
    case 'dropbutton_click': {
      return await replayDropbutton(action, doc);
    }

    // ── Tabledrag ───────────────────────────────────────────────────
    case 'tabledrag': {
      const el = await waitForElement(action, 10000, doc);
      if (!el) return { status: 'failed', error: `Drag handle not found: ${action.selector}` };
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
      el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx + (action.deltaX || 0), clientY: cy + (action.deltaY || 0) }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      highlightElement(el, true, doc);
      return { status: 'passed' };
    }

    default:
      return { status: 'failed', error: `Unknown action type: ${type}` };
  }
}

async function replayDropbutton(action, targetDoc) {
  const d = targetDoc || document;
  const dots = d.querySelector('.toolbar-button--icon--dots');
  if (!dots) return { status: 'failed', error: 'Dropbutton dots not found' };
  dots.click();
  // Wait for dropdown to appear
  await new Promise(r => setTimeout(r, 300));
  const actionName = (action.actionName || action.elementText || '').toLowerCase();
  const links = dots.parentElement?.querySelectorAll('a, button, li') || [];
  for (const link of links) {
    if (link.textContent.trim().toLowerCase().includes(actionName)) {
      link.click();
      highlightElement(link, true, d);
      return { status: 'passed' };
    }
  }
  return { status: 'failed', error: `Dropbutton action "${action.actionName || action.elementText}" not found` };
}

async function replayCKEditor(action) {
  const value = action.value || '';

  // Fast-fail: if there's no CKEditor markup at all on the page, don't poll
  const hasCKMarkup = document.querySelector('.ck-editor, .ck-editor__editable');
  const hasDrupalCK = window.Drupal && window.Drupal.CKEditor5Instances;
  if (!hasCKMarkup && !hasDrupalCK) {
    return { status: 'failed', error: 'No CKEditor5 found on this page' };
  }

  // Poll until at least one CKEditor5 instance is initialized (up to 5s)
  const editors = await new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      // Primary: Drupal global registry
      if (window.Drupal && window.Drupal.CKEditor5Instances && window.Drupal.CKEditor5Instances.size > 0) {
        return resolve([...window.Drupal.CKEditor5Instances.values()]);
      }
      // Fallback: standard CKEditor5 DOM property
      const editables = document.querySelectorAll('.ck-editor__editable');
      const found = [];
      editables.forEach(el => { if (el.ckeditorInstance) found.push(el.ckeditorInstance); });
      if (found.length > 0) return resolve(found);

      if (Date.now() - start > 5000) return resolve(null);
      setTimeout(check, 200);
    };
    check();
  });

  if (!editors || editors.length === 0) {
    return { status: 'failed', error: 'CKEditor5 instances not found (timed out waiting for editor)' };
  }

  try {
    // If we have a selector, try to target the specific editor
    if (action.selector) {
      const targetEl = document.querySelector(action.selector);
      if (targetEl) {
        const editable = targetEl.closest('.ck-editor__editable') || targetEl.querySelector('.ck-editor__editable');
        if (editable && editable.ckeditorInstance) {
          editable.ckeditorInstance.setData(value);
          highlightElement(editable, true);
          return { status: 'passed' };
        }
      }
    }
    // Fallback: set data on all editors
    editors.forEach(editor => editor.setData(value));
    return { status: 'passed' };
  } catch (err) {
    return { status: 'failed', error: `CKEditor error: ${err.message}` };
  }
}

// Listen for replay commands from the renderer
ipcRenderer.on('replay-action', async (_event, payload) => {
  const { stepId, action } = payload;
  try {
    const result = await executeReplayAction(action);
    ipcRenderer.sendToHost('replay-result', { stepId, ...result });
  } catch (err) {
    ipcRenderer.sendToHost('replay-result', { stepId, status: 'failed', error: err.message });
  }
});
