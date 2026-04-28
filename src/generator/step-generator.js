/**
 * Spec file generator.
 * Produces .spec.js files using Playwright Test syntax.
 *
 * Output structure:
 *   import { test, expect } from '@playwright/test';
 *   // helpers ...
 *   test.describe('Feature Name', () => { ... });
 */

import { ACTION_TYPES, STATUS_MESSAGE_TYPES } from '../shared/action-types.js';
import { toRelativePath } from '../shared/drupal-patterns.js';

/**
 * @param {object} opts
 * @param {string} opts.featureName            - test suite name
 * @param {string} opts.baseUrl                - site base URL for converting to relative paths
 * @param {boolean} opts.includeLogin          - generate login helper + beforeEach
 * @param {boolean} opts.useForceClick         - add { force: true } to interactions
 * @param {boolean} opts.autoWaits             - insert waitForTimeout after AJAX triggers
 * @param {boolean} opts.importEditContent     - include edit-content test
 * @param {boolean} opts.importDeleteContent   - include delete-content test
 * @param {boolean} opts.importCloneContent    - include clone-content test
 * @param {Array<{name:string, steps:Array}>} opts.scenarios
 * @param {Array} opts.variables               - captured dynamic variables
 * @returns {string} .spec.js file content
 */
export function generateSpecFile(opts) {
  const {
    featureName = 'Untitled Test',
    baseUrl = '',
    includeLogin = true,
    useForceClick = true,
    autoWaits = true,
    importEditContent = false,
    importDeleteContent = false,
    importCloneContent = false,
    scenarios = [],
    variables = [],
  } = opts;

  const lines = [];

  // ── Analyze which helpers are needed ─────────────────────────────────
  const allSteps = scenarios.flatMap(s => s.steps);
  const needsSaveButton = allSteps.some(st => st.action?.type === ACTION_TYPES.SUBMIT)
    || importEditContent || importDeleteContent || importCloneContent;
  const needsDropbutton = allSteps.some(st =>
    st.action?.type === ACTION_TYPES.DROPBUTTON_CLICK ||
    (st.action?.type === ACTION_TYPES.CLICK && st.action?.drupalContext === 'dropbutton')
  ) || importDeleteContent || importCloneContent;
  const needsCKEditor = allSteps.some(st =>
    st.action?.type === ACTION_TYPES.TYPE_CKEDITOR ||
    (st.action?.type === ACTION_TYPES.TYPE && st.action?.drupalContext === 'ckeditor5')
  );
  const needsMediaUpload = allSteps.some(st => st.action?.type === ACTION_TYPES.UPLOAD_MEDIA);
  const needsStatusCheck = allSteps.some(st => st.action?.type === ACTION_TYPES.ASSERT_STATUS_MESSAGE)
    || importEditContent || importDeleteContent || importCloneContent;
  const needsSerial = allSteps.some(st =>
    st.action?.type === ACTION_TYPES.CAPTURE_URL ||
    st.action?.type === ACTION_TYPES.USE_CAPTURED_URL ||
    st.action?.captureUrl ||
    st.action?.useCapturedUrl
  ) || importEditContent || importDeleteContent || importCloneContent;

  // ── Imports ──────────────────────────────────────────────────────────
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push('');

  // ── Module-level shared state ────────────────────────────────────────
  lines.push(`/** Shared state for URLs captured across tests. */`);
  lines.push(`const capturedUrls = {};`);
  lines.push('');

  // ── Helper: Login ────────────────────────────────────────────────────
  if (includeLogin) {
    lines.push(`/** Log in as admin user. */`);
    lines.push(`async function login(page) {`);
    lines.push(`  await page.goto('/user/login');`);
    lines.push(`  await page.locator('#edit-name').fill(process.env.DRUPAL_USER || 'admin');`);
    lines.push(`  await page.locator('#edit-pass').fill(process.env.DRUPAL_PASSWORD || 'admin');`);
    lines.push(`  await page.locator('#edit-submit').click();`);
    lines.push(`  await expect(page).not.toHaveURL(/\\/user\\/login/);`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Helper: Save Button ──────────────────────────────────────────────
  if (needsSaveButton) {
    lines.push(`/** Click the primary save/submit button. */`);
    lines.push(`async function clickSaveButton(page) {`);
    lines.push(`  const selectors = ['#edit-submit', '#edit-gin-sticky-actions > .button--primary', '#gin-sticky-edit-submit'];`);
    lines.push(`  for (const sel of selectors) {`);
    lines.push(`    if (await page.locator(sel).count() > 0) {`);
    lines.push(`      await page.locator(sel).click({ force: true });`);
    lines.push(`      return;`);
    lines.push(`    }`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Helper: CKEditor 5 ──────────────────────────────────────────────
  if (needsCKEditor) {
    lines.push(`/** Type into CKEditor 5. */`);
    lines.push(`async function typeCKEditor5(page, content) {`);
    lines.push(`  await page.waitForSelector('.ck-editor__editable', { timeout: 10000 });`);
    lines.push(`  await page.evaluate((text) => {`);
    lines.push(`    // Primary: Drupal global registry`);
    lines.push(`    if (window.Drupal && window.Drupal.CKEditor5Instances && window.Drupal.CKEditor5Instances.size > 0) {`);
    lines.push(`      window.Drupal.CKEditor5Instances.forEach(editor => editor.setData(text));`);
    lines.push(`      return;`);
    lines.push(`    }`);
    lines.push(`    // Fallback: standard CKEditor5 DOM property`);
    lines.push(`    const editables = document.querySelectorAll('.ck-editor__editable');`);
    lines.push(`    const found = [];`);
    lines.push(`    editables.forEach(el => { if (el.ckeditorInstance) found.push(el.ckeditorInstance); });`);
    lines.push(`    if (found.length > 0) { found.forEach(e => e.setData(text)); return; }`);
    lines.push(`    throw new Error('CKEditor5 instances not found.');`);
    lines.push(`  }, content);`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Helper: Upload Media ─────────────────────────────────────────────
  if (needsMediaUpload) {
    lines.push(`/** Upload media via Drupal media library. */`);
    lines.push(`async function uploadMediaAndFillFields(page, imageName = 'test-image.jpg') {`);
    lines.push(`  await page.locator('button, input[type="submit"]').filter({ hasText: /add media/i }).click();`);
    lines.push(`  await page.locator('input[type="file"]').waitFor({ timeout: 15000 });`);
    lines.push(`  await page.locator('input[type="file"]').setInputFiles('fixtures/' + imageName);`);
    lines.push(`  await page.locator('input[name*="[alt]"]').first().waitFor({ timeout: 20000 });`);
    lines.push(`  const altInputs = page.locator('input[name*="[alt]"]');`);
    lines.push(`  for (let i = 0; i < await altInputs.count(); i++) {`);
    lines.push(`    await altInputs.nth(i).fill('Automated alt text');`);
    lines.push(`  }`);
    lines.push(`  await page.locator('.ui-dialog-buttonpane button.button--primary').click({ force: true });`);
    lines.push(`  await page.locator('.ui-dialog-buttonset > .media-library-select').click({ force: true });`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Helper: Status Messages ──────────────────────────────────────────
  if (needsStatusCheck) {
    lines.push(`/** Check for a Drupal status message and capture the URL. */`);
    lines.push(`async function checkStatusMessage(page, type) {`);
    lines.push(`  const messageEl = page.locator('.messages--status, .messages, .alert, .messages__content').first();`);
    lines.push(`  const patterns = {`);
    lines.push(`    created: /has been created|has been saved/i,`);
    lines.push(`    updated: /has been updated/i,`);
    lines.push(`    deleted: /has been deleted/i,`);
    lines.push(`    cloned: /clone.*has been created|has been cloned|node was cloned/i,`);
    lines.push(`    saved: /has been saved/i,`);
    lines.push(`  };`);
    lines.push(`  await expect(messageEl).toContainText(patterns[type] || patterns.created, { timeout: 10000 });`);
    lines.push(`  if (['created', 'updated', 'saved'].includes(type)) {`);
    lines.push(`    capturedUrls.lastPageUrlforsaved = page.url();`);
    lines.push(`  } else if (type === 'cloned') {`);
    lines.push(`    capturedUrls.lastPageUrlforCloned = page.url();`);
    lines.push(`  }`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Helper: Dropbutton ───────────────────────────────────────────────
  if (needsDropbutton) {
    lines.push(`/** Click a dropbutton action by name. */`);
    lines.push(`async function clickDropbutton(page, actionName) {`);
    lines.push(`  const dots = page.locator('.toolbar-button--icon--dots').first();`);
    lines.push(`  await dots.click();`);
    lines.push(`  await dots.locator('xpath=..').getByText(actionName).click({ force: true });`);
    lines.push(`}`);
    lines.push('');
  }

  // ── Test suite ───────────────────────────────────────────────────────
  const describeMethod = needsSerial ? 'test.describe.serial' : 'test.describe';
  lines.push(`${describeMethod}('${escapeString(featureName)}', () => {`);
  lines.push('');

  // beforeEach with login
  if (includeLogin) {
    lines.push(`  test.beforeEach(async ({ page }) => {`);
    lines.push(`    await login(page);`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── Each scenario becomes a test() ───────────────────────────────────
  for (const scenario of scenarios) {
    lines.push(`  test('${escapeString(scenario.name)}', async ({ page }) => {`);

    for (const step of scenario.steps) {
      const body = generateStepBody(step, { baseUrl, useForceClick, autoWaits, variables });
      lines.push(`    // ${step.keyword} ${step.text}`);
      for (const bodyLine of body) {
        lines.push(`    ${bodyLine}`);
      }
      lines.push('');
    }

    lines.push(`  });`);
    lines.push('');
  }

  // ── CRUD: Edit Content ───────────────────────────────────────────────
  if (importEditContent) {
    lines.push(`  test('Edit existing content', async ({ page }) => {`);
    lines.push(`    await page.goto(capturedUrls.lastPageUrlforsaved);`);
    lines.push(`    if (await page.locator('.ui-dialog .ui-dialog-buttonpane button').count() > 0) {`);
    lines.push(`      await page.locator('.ui-dialog .ui-dialog-buttonpane button').first().click({ force: true });`);
    lines.push(`    }`);
    lines.push(`    await page.locator('a.toolbar-button--primary').filter({ hasText: 'Edit' }).click();`);
    lines.push(`    await page.waitForTimeout(2000);`);
    lines.push(`    if (await page.locator('#edit-title-0-value').count() > 0) {`);
    lines.push(`      await page.locator('#edit-title-0-value').fill('Edit The Content Type');`);
    lines.push(`    } else if (await page.locator('#edit-field-city-0-value').count() > 0) {`);
    lines.push(`      await page.locator('#edit-field-city-0-value').fill('Edit The Content Type');`);
    lines.push(`    }`);
    lines.push(`    await clickSaveButton(page);`);
    lines.push(`    await checkStatusMessage(page, 'updated');`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── CRUD: Delete Content ─────────────────────────────────────────────
  if (importDeleteContent) {
    lines.push(`  test('Delete existing content', async ({ page }) => {`);
    lines.push(`    await page.goto(capturedUrls.lastPageUrlforsaved);`);
    lines.push(`    await clickDropbutton(page, 'Delete');`);
    lines.push(`    await page.waitForTimeout(2000);`);
    lines.push(`    await clickSaveButton(page);`);
    lines.push(`    await checkStatusMessage(page, 'deleted');`);
    lines.push(`  });`);
    lines.push('');
  }

  // ── CRUD: Clone Content ──────────────────────────────────────────────
  if (importCloneContent) {
    lines.push(`  test('Clone existing content', async ({ page }) => {`);
    lines.push(`    await page.goto(capturedUrls.lastPageUrlforsaved);`);
    lines.push(`    await clickDropbutton(page, 'Clone');`);
    lines.push(`    await page.waitForTimeout(2000);`);
    lines.push(`    await clickSaveButton(page);`);
    lines.push(`    await checkStatusMessage(page, 'cloned');`);
    lines.push(`  });`);
    lines.push('');
    lines.push(`  test('Delete cloned content', async ({ page }) => {`);
    lines.push(`    await page.goto(capturedUrls.lastPageUrlforCloned || capturedUrls.lastPageUrlforsaved);`);
    lines.push(`    await clickDropbutton(page, 'Delete');`);
    lines.push(`    await page.waitForTimeout(2000);`);
    lines.push(`    await clickSaveButton(page);`);
    lines.push(`    await checkStatusMessage(page, 'deleted');`);
    lines.push(`  });`);
    lines.push('');
  }

  lines.push(`});`);
  lines.push('');

  return lines.join('\n');
}

// ── Keep legacy export name for backward compatibility ─────────────────
export const generateStepFile = generateSpecFile;

/**
 * Build the Playwright locator prefix for an action.
 * If the action has a framePath, chains frameLocator calls.
 * e.g. framePath [0, 2] → page.frameLocator('iframe').nth(0).frameLocator('iframe').nth(2)
 */
function buildLocatorPrefix(action) {
  if (!action.framePath || action.framePath.length === 0) return 'page';
  let prefix = 'page';
  for (const idx of action.framePath) {
    prefix += `.frameLocator('iframe').nth(${idx})`;
  }
  return prefix;
}

/**
 * Generate the Playwright command body for a single step.
 */
function generateStepBody(step, { baseUrl, useForceClick, autoWaits, variables }) {
  const action = step.action;
  if (!action) return ['// TODO: implement this step'];

  const lines = [];
  const forceArg = useForceClick ? '{ force: true }' : '';
  const forceOpt = useForceClick ? ', { force: true }' : '';
  const loc = buildLocatorPrefix(action);

  switch (action.type) {
    case ACTION_TYPES.NAVIGATE:
    case 'navigate': {
      const relPath = action.relativePath || toRelativePath(action.url, baseUrl);
      const isNodePage = relPath.match(/\/node\/\d+/);
      const hasSavedUrl = variables && variables.some(v => v.name === 'lastPageUrlforsaved');

      if (action.useCapturedUrl && action.variableName) {
        lines.push(`await page.goto(capturedUrls['${escapeString(action.variableName)}']);`);
      } else if (isNodePage && hasSavedUrl) {
        lines.push(`await page.goto(capturedUrls.lastPageUrlforsaved);`);
      } else {
        lines.push(`await page.goto('${escapeString(relPath)}');`);
      }
      break;
    }

    case ACTION_TYPES.CLICK:
    case 'click': {
      const elementText = (action.elementText || '').toLowerCase().trim();
      const hasSavedUrl = variables && variables.some(v => v.name === 'lastPageUrlforsaved');
      const isCrudAction = ['clone', 'delete', 'edit'].some(word => elementText.includes(word));

      if (action.drupalContext === 'dropbutton' && isCrudAction && hasSavedUrl) {
        lines.push(`await page.goto(capturedUrls.lastPageUrlforsaved);`);
        lines.push(`await clickDropbutton(page, '${escapeString(action.elementText)}');`);
      } else if (action.drupalContext === 'dropbutton') {
        lines.push(`await clickDropbutton(page, '${escapeString(action.elementText)}');`);
      } else if (action.drupalContext === 'dialog') {
        lines.push(`await ${loc}.locator('.ui-dialog-buttonpane button', { hasText: '${escapeString(action.elementText)}' }).click(${forceArg});`);
      } else if (action.drupalContext === 'media-library') {
        lines.push(`await ${loc}.locator('button, input[type="submit"]').filter({ hasText: /add media/i }).click(${forceArg});`);
      } else if (action.useContains || action.selectorStrategy === 'contains') {
        const tag = action.elementTag || 'button';
        const text = (action.selector || action.elementText || '').replace(/\s+/g, ' ').trim();
        lines.push(`await ${loc}.locator('${tag}', { hasText: '${escapeString(text)}' }).click(${forceArg});`);
      } else {
        lines.push(`await ${loc}.locator('${escapeString(action.selector)}').click(${forceArg});`);
      }
      break;
    }

    case ACTION_TYPES.TYPE:
    case 'type': {
      if (action.drupalContext === 'ckeditor5') {
        lines.push(`await typeCKEditor5(page, '${escapeString(action.value)}');`);
      } else {
        lines.push(`await ${loc}.locator('${escapeString(action.selector)}').fill('${escapeString(action.value)}'${forceOpt});`);
      }
      break;
    }

    case ACTION_TYPES.TYPE_CKEDITOR:
    case 'type_ckeditor': {
      lines.push(`await typeCKEditor5(page, '${escapeString(action.value)}');`);
      break;
    }

    case ACTION_TYPES.SELECT:
    case 'select': {
      lines.push(`await ${loc}.locator('${escapeString(action.selector)}').selectOption('${escapeString(action.value)}'${forceOpt});`);
      break;
    }

    case ACTION_TYPES.CHECK:
    case 'check': {
      if (action.checked) {
        lines.push(`await ${loc}.locator('${escapeString(action.selector)}').check(${forceArg});`);
      } else {
        lines.push(`await ${loc}.locator('${escapeString(action.selector)}').uncheck(${forceArg});`);
      }
      break;
    }

    case ACTION_TYPES.UPLOAD:
    case 'upload': {
      lines.push(`await ${loc}.locator('${escapeString(action.selector)}').setInputFiles('fixtures/${escapeString(action.fileName)}');`);
      if (autoWaits) lines.push(`await page.waitForTimeout(2000);`);
      break;
    }

    case ACTION_TYPES.UPLOAD_MEDIA:
    case 'upload_media': {
      lines.push(`await uploadMediaAndFillFields(page, '${escapeString(action.fileName || 'testing.jpg')}');`);
      break;
    }

    case ACTION_TYPES.SUBMIT:
    case 'submit': {
      lines.push(`await clickSaveButton(page);`);
      break;
    }

    case ACTION_TYPES.CAPTURE_URL:
    case 'capture_url': {
      const varName = action.variableName || 'lastPageUrlforsaved';
      lines.push(`capturedUrls['${escapeString(varName)}'] = page.url();`);
      break;
    }

    case ACTION_TYPES.USE_CAPTURED_URL:
    case 'use_captured_url': {
      const varName = action.variableName || 'lastPageUrlforsaved';
      lines.push(`await page.goto(capturedUrls['${escapeString(varName)}']);`);
      break;
    }

    case ACTION_TYPES.ASSERT_VISIBLE:
    case 'assert_visible': {
      lines.push(`await expect(${loc}.locator('${escapeString(action.selector)}')).toBeVisible();`);
      break;
    }

    case ACTION_TYPES.ASSERT_TEXT:
    case 'assert_text': {
      lines.push(`await expect(${loc}.locator('${escapeString(action.selector)}')).toContainText('${escapeString(action.expectedText)}');`);
      break;
    }

    case ACTION_TYPES.ASSERT_URL:
    case 'assert_url': {
      lines.push(`await expect(page).toHaveURL(/${toRegexSafe(action.expectedText)}/);`);
      break;
    }

    case ACTION_TYPES.ASSERT_EXISTS:
    case 'assert_exists': {
      lines.push(`await expect(${loc}.locator('${escapeString(action.selector)}')).toBeAttached();`);
      break;
    }

    case ACTION_TYPES.ASSERT_NOT_EXISTS:
    case 'assert_not_exists': {
      lines.push(`await expect(${loc}.locator('${escapeString(action.selector)}')).not.toBeAttached();`);
      break;
    }

    case ACTION_TYPES.ASSERT_STATUS_MESSAGE:
    case 'assert_status_message': {
      const msgType = action.messageType || 'created';
      lines.push(`await checkStatusMessage(page, '${msgType}');`);
      break;
    }

    case ACTION_TYPES.WAIT:
    case 'wait': {
      lines.push(`await page.waitForTimeout(${action.duration || 2000});`);
      break;
    }

    case ACTION_TYPES.DROPBUTTON_CLICK:
    case 'dropbutton_click': {
      lines.push(`await clickDropbutton(page, '${escapeString(action.actionName || action.elementText)}');`);
      break;
    }

    case ACTION_TYPES.TABLEDRAG:
    case 'tabledrag': {
      lines.push(`const dragHandle = ${loc}.locator('${escapeString(action.selector)}');`);
      lines.push(`const box = await dragHandle.boundingBox();`);
      lines.push(`if (box) {`);
      lines.push(`  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);`);
      lines.push(`  await page.mouse.down();`);
      lines.push(`  await page.mouse.move(box.x + box.width / 2 + ${action.deltaX || 0}, box.y + box.height / 2 + ${action.deltaY || 0});`);
      lines.push(`  await page.mouse.up();`);
      lines.push(`}`);
      break;
    }

    default:
      lines.push(`// TODO: implement action type "${action.type}"`);
  }

  // Auto-dismiss dialog after navigation
  if ((action.type === ACTION_TYPES.NAVIGATE || action.type === 'navigate') && action.dismissDialog) {
    lines.push(`if (await ${loc}.locator('.ui-dialog .ui-dialog-buttonpane button').count() > 0) {`);
    lines.push(`  await ${loc}.locator('.ui-dialog .ui-dialog-buttonpane button').first().click({ force: true });`);
    lines.push(`}`);
  }

  return lines;
}

function escapeString(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function toRegexSafe(str) {
  if (!str) return '';
  return str.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
}
