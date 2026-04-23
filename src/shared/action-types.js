/**
 * Action type constants used throughout the app.
 * Each action corresponds to a distinct Playwright command in the generated code.
 */

export const ACTION_TYPES = {
  NAVIGATE: 'navigate',
  CLICK: 'click',
  TYPE: 'type',
  SELECT: 'select',
  CHECK: 'check',
  UPLOAD: 'upload',
  SUBMIT: 'submit',
  ASSERT_VISIBLE: 'assert_visible',
  ASSERT_TEXT: 'assert_text',
  ASSERT_URL: 'assert_url',
  ASSERT_STATUS_MESSAGE: 'assert_status_message',
  ASSERT_EXISTS: 'assert_exists',
  ASSERT_NOT_EXISTS: 'assert_not_exists',
  CAPTURE_URL: 'capture_url',
  USE_CAPTURED_URL: 'use_captured_url',
  WAIT: 'wait',
  TYPE_CKEDITOR: 'type_ckeditor',
  UPLOAD_MEDIA: 'upload_media',
  DIALOG_CLICK: 'dialog_click',
  DROPBUTTON_CLICK: 'dropbutton_click',
  TABLEDRAG: 'tabledrag',
};

export const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And'];

/**
 * Status message assertion types matching the team's existing commonSteps pattern.
 */
export const STATUS_MESSAGE_TYPES = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  CLONED: 'cloned',
  SAVED: 'saved',
};

/**
 * Auto-assign a step keyword based on position in a scenario.
 *   - First step → Given
 *   - Actions → When / And
 *   - Assertions → Then / And
 */
export function autoAssignKeyword(action, index, totalSteps) {
  if (index === 0) return 'Given';
  const isAssertion = action.type.startsWith('assert_');
  if (isAssertion) {
    // Check if previous was also an assertion
    return index > 0 ? 'Then' : 'Then';
  }
  return index === 1 ? 'When' : 'And';
}

/**
 * Determine whether an action should auto-insert a wait after it.
 */
export function needsAutoWait(action) {
  return [
    ACTION_TYPES.UPLOAD,
    ACTION_TYPES.UPLOAD_MEDIA,
    ACTION_TYPES.DIALOG_CLICK,
    ACTION_TYPES.SUBMIT,
  ].includes(action.type);
}
