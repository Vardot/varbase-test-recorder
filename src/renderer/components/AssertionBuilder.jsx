import React, { useState, useEffect } from 'react';
import { STATUS_MESSAGE_TYPES } from '../../shared/action-types.js';

/**
 * AssertionBuilder — add manual assertion steps.
 * Pre-built Drupal assertion templates + custom assertion builder.
 */
export default function AssertionBuilder({ onAddAssertion, webviewRef }) {
  const [assertType, setAssertType] = useState('assert_visible');
  const [selector, setSelector] = useState('');
  const [expectedText, setExpectedText] = useState('');
  const [messageType, setMessageType] = useState('created');
  const [isPicking, setIsPicking] = useState(false);
  const [pickedFramePath, setPickedFramePath] = useState(null);

  // Listen for element-picked
  useEffect(() => {
    const handler = (e) => {
      if (isPicking) {
        setSelector(e.detail.selector);
        // Store frame path for assertions inside iframes
        if (e.detail.framePath) {
          setPickedFramePath(e.detail.framePath);
        } else {
          setPickedFramePath(null);
        }
        setIsPicking(false);
      }
    };
    window.addEventListener('element-picked', handler);
    return () => window.removeEventListener('element-picked', handler);
  }, [isPicking]);

  const startPick = () => {
    setIsPicking(true);
    if (webviewRef?.current) {
      webviewRef.current.send('start-pick');
    }
  };

  const addAssertion = () => {
    const descriptions = {
      assert_visible: `I should see the element "${selector}"`,
      assert_text: `I should see "${expectedText}" in "${selector}"`,
      assert_url: `the URL should contain "${expectedText}"`,
      assert_exists: `the element "${selector}" should exist`,
      assert_not_exists: `the element "${selector}" should not exist`,
      assert_status_message: getStatusDescription(messageType),
    };

    const assertion = {
      type: assertType,
      selector,
      expectedText,
      messageType,
      description: descriptions[assertType] || 'I verify the assertion',
    };
    if (pickedFramePath) {
      assertion.framePath = pickedFramePath;
    }
    onAddAssertion(assertion);

    // Reset
    setSelector('');
    setExpectedText('');
    setPickedFramePath(null);
  };

  const getStatusDescription = (type) => {
    const map = {
      created: 'I should see a confirmation message indicating the content was created successfully',
      updated: 'I should see a confirmation message indicating the content was updated successfully',
      deleted: 'I should see a confirmation message indicating the content was deleted successfully',
      cloned: 'I should see a confirmation message indicating the content was cloned successfully',
      saved: 'I should see a confirmation message indicating the content was saved successfully',
    };
    return map[type] || 'I should see a status message';
  };

  return (
    <div className="assertion-builder">
      <h3>Add Assertion</h3>

      {/* Quick templates */}
      <div className="assertion-templates">
        <h4>Quick Drupal Assertions</h4>
        {Object.entries(STATUS_MESSAGE_TYPES).map(([key, val]) => (
          <button
            key={key}
            className="btn btn-template"
            onClick={() => {
              onAddAssertion({
                type: 'assert_status_message',
                messageType: val,
                description: getStatusDescription(val),
              });
            }}
          >
            ✓ Content {val}
          </button>
        ))}
      </div>

      <hr />

      {/* Custom assertion */}
      <h4>Custom Assertion</h4>

      <div className="field">
        <label>Assertion Type</label>
        <select value={assertType} onChange={e => setAssertType(e.target.value)}>
          <option value="assert_visible">Element is visible</option>
          <option value="assert_text">Element contains text</option>
          <option value="assert_url">URL contains</option>
          <option value="assert_exists">Element exists</option>
          <option value="assert_not_exists">Element does not exist</option>
          <option value="assert_status_message">Status message</option>
        </select>
      </div>

      {/* Selector field (for element assertions) */}
      {!['assert_url', 'assert_status_message'].includes(assertType) && (
        <div className="field">
          <label>Selector</label>
          <div className="selector-row">
            <input
              type="text"
              value={selector}
              onChange={e => setSelector(e.target.value)}
              placeholder="#element-id or .class"
            />
            {isPicking ? (
              <button className="btn btn-sm btn-cancel" onClick={() => setIsPicking(false)}>Cancel</button>
            ) : (
              <button className="btn btn-sm btn-pick" onClick={startPick}>⊕ Pick</button>
            )}
          </div>
          {pickedFramePath && pickedFramePath.length > 0 && (
            <div className="frame-path-indicator">
              <span className="frame-path-label">Frame:</span>
              {pickedFramePath.map((idx, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="frame-path-sep">›</span>}
                  <span className="frame-path-index">iframe[{idx}]</span>
                </React.Fragment>
              ))}
              <button
                className="btn btn-sm btn-clear-frame"
                title="Remove frame path"
                onClick={() => setPickedFramePath(null)}
              >✕</button>
            </div>
          )}
        </div>
      )}

      {/* Expected text (for text/url assertions) */}
      {['assert_text', 'assert_url'].includes(assertType) && (
        <div className="field">
          <label>{assertType === 'assert_url' ? 'URL should contain' : 'Expected text'}</label>
          <input
            type="text"
            value={expectedText}
            onChange={e => setExpectedText(e.target.value)}
            placeholder="expected text..."
          />
        </div>
      )}

      {/* Message type (for status message) */}
      {assertType === 'assert_status_message' && (
        <div className="field">
          <label>Message Type</label>
          <select value={messageType} onChange={e => setMessageType(e.target.value)}>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="cloned">Cloned</option>
            <option value="saved">Saved</option>
          </select>
        </div>
      )}

      <button className="btn btn-add" onClick={addAssertion}>
        + Add Assertion
      </button>
    </div>
  );
}
