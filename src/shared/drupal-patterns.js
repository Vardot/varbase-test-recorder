/**
 * Drupal/Varbase URL pattern detection.
 * Used to auto-detect page context and CRUD operations.
 */

export const DRUPAL_URL_PATTERNS = {
  NODE_ADD: /\/node\/add\/([a-z_-]+)/,
  NODE_VIEW: /\/node\/(\d+)$/,
  NODE_EDIT: /\/node\/(\d+)\/edit/,
  NODE_DELETE: /\/node\/(\d+)\/delete/,
  NODE_CLONE: /\/entity_clone\/node\/(\d+)/,
  NODE_LAYOUT: /\/node\/(\d+)\/layout/,
  ADMIN_CONTENT: /\/admin\/content/,
  ADMIN_MENU: /\/admin\/structure\/menu\/manage\/([a-z_-]+)/,
  ADMIN_BLOCK: /\/admin\/structure\/block/,
  ADMIN_TAXONOMY: /\/admin\/structure\/taxonomy\/manage\/([a-z_-]+)/,
  USER_LOGIN: /\/user\/login/,
  LAYOUT_BUILDER: /\/layout_builder\//,
  MEDIA_LIBRARY: /\/admin\/content\/media/,
};

/**
 * Detect the page context from a URL.
 * Returns { context, contentType?, nodeId?, menuName?, vocabName? }
 */
export function detectPageContext(url) {
  if (!url) return { context: 'unknown' };

  // Strip base URL, work with path only
  let path;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }

  for (const [key, pattern] of Object.entries(DRUPAL_URL_PATTERNS)) {
    const match = path.match(pattern);
    if (match) {
      switch (key) {
        case 'NODE_ADD':
          return { context: 'node_add', contentType: match[1] };
        case 'NODE_VIEW':
          return { context: 'node_view', nodeId: match[1] };
        case 'NODE_EDIT':
          return { context: 'node_edit', nodeId: match[1] };
        case 'NODE_DELETE':
          return { context: 'node_delete', nodeId: match[1] };
        case 'NODE_CLONE':
          return { context: 'node_clone', nodeId: match[1] };
        case 'NODE_LAYOUT':
          return { context: 'node_layout', nodeId: match[1] };
        case 'ADMIN_CONTENT':
          return { context: 'admin_content' };
        case 'ADMIN_MENU':
          return { context: 'admin_menu', menuName: match[1] };
        case 'ADMIN_BLOCK':
          return { context: 'admin_block' };
        case 'ADMIN_TAXONOMY':
          return { context: 'admin_taxonomy', vocabName: match[1] };
        case 'USER_LOGIN':
          return { context: 'user_login' };
        case 'LAYOUT_BUILDER':
          return { context: 'layout_builder' };
        case 'MEDIA_LIBRARY':
          return { context: 'media_library' };
      }
    }
  }

  return { context: 'other', path };
}

/**
 * Given a full URL and a base URL, return the relative path.
 * e.g., "https://site.com/node/add/page" with base "https://site.com" → "/node/add/page"
 */
export function toRelativePath(fullUrl, baseUrl) {
  if (!fullUrl) return '/';
  if (!baseUrl) return fullUrl;

  try {
    const full = new URL(fullUrl);
    const base = new URL(baseUrl);
    if (full.origin === base.origin) {
      return full.pathname + full.search + full.hash;
    }
  } catch {
    // If URL parsing fails, try string replacement
    if (fullUrl.startsWith(baseUrl)) {
      return fullUrl.substring(baseUrl.length) || '/';
    }
  }
  return fullUrl;
}

/**
 * Detect CRUD flow patterns in a sequence of actions.
 * Returns annotations for which steps should capture/use URLs.
 */
export function detectCrudFlow(actions) {
  const annotations = [];
  let lastCreateIndex = -1;
  let lastCloneIndex = -1;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const ctx = detectPageContext(action.url);

    // After a form submission on a node/add page, the next navigation to node/view
    // means content was created — mark for URL capture
    if (action.type === 'navigate') {
      if (ctx.context === 'node_view' && lastCreateIndex >= 0) {
        annotations.push({
          index: i,
          type: 'capture_url',
          variableName: 'lastPageUrlforsaved',
          reason: 'Content created — capturing node URL',
        });
        lastCreateIndex = -1;
      }
      if (ctx.context === 'node_view' && lastCloneIndex >= 0) {
        annotations.push({
          index: i,
          type: 'capture_url',
          variableName: 'lastPageUrlforCloned',
          reason: 'Content cloned — capturing cloned node URL',
        });
        lastCloneIndex = -1;
      }
      if (ctx.context === 'node_edit') {
        annotations.push({
          index: i,
          type: 'use_captured_url',
          variableName: 'lastPageUrlforsaved',
          reason: 'Editing previously created content',
        });
      }
      if (ctx.context === 'node_delete') {
        annotations.push({
          index: i,
          type: 'use_captured_url',
          variableName: 'lastPageUrlforsaved',
          reason: 'Deleting previously created content',
        });
      }
      if (ctx.context === 'node_clone') {
        annotations.push({
          index: i,
          type: 'use_captured_url',
          variableName: 'lastPageUrlforsaved',
          reason: 'Cloning previously created content',
        });
        lastCloneIndex = i;
      }
    }

    if (action.type === 'submit') {
      const submitCtx = detectPageContext(action.url);
      if (submitCtx.context === 'node_add') {
        lastCreateIndex = i;
      }
    }

    // Detect status message assertions that should capture URLs
    if (action.type === 'assert_status_message') {
      if (action.messageType === 'created' || action.messageType === 'saved') {
        annotations.push({
          index: i,
          type: 'capture_url_after_assert',
          variableName: 'lastPageUrlforsaved',
          reason: 'Capture URL after creation confirmation',
        });
      }
      if (action.messageType === 'cloned') {
        annotations.push({
          index: i,
          type: 'capture_url_after_assert',
          variableName: 'lastPageUrlforCloned',
          reason: 'Capture URL after clone confirmation',
        });
      }
    }
  }

  return annotations;
}
