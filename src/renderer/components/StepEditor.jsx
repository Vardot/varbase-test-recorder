import React, { useState, useEffect } from 'react';
import { STEP_KEYWORDS, ACTION_TYPES } from '../../shared/action-types.js';

/**
 * StepEditor — right panel for editing a single recorded step.
 * Editable: description text, keyword, selector, value, action type,
 * dynamic variable references, force/wait options.
 */
export default function StepEditor({ action, variables, onUpdate, webviewRef }) {
  const [isPicking, setIsPicking] = useState(false);

  // Listen for element-picked events from the webview
  useEffect(() => {
    const handler = (e) => {
      if (isPicking && action) {
        const update = {
          action: {
            ...action.action,
            selector: e.detail.selector,
            selectorStrategy: e.detail.strategy,
            elementTag: e.detail.elementTag,
            elementText: e.detail.elementText,
            labelText: e.detail.labelText,
          },
        };
        // Propagate iframe frame path if present
        if (e.detail.framePath) {
          update.action.framePath = e.detail.framePath;
        } else {
          delete update.action.framePath;
        }
        onUpdate(update);
        setIsPicking(false);
      }
    };
    window.addEventListener('element-picked', handler);
    return () => window.removeEventListener('element-picked', handler);
  }, [isPicking, action, onUpdate]);

  if (!action) {
    return (
      <div className="step-editor-empty">
        <p>Select a step to edit its properties.</p>
      </div>
    );
  }

  const startPick = () => {
    setIsPicking(true);
    if (webviewRef?.current) {
      webviewRef.current.send('start-pick');
    }
  };

  const cancelPick = () => {
    setIsPicking(false);
    if (webviewRef?.current) {
      webviewRef.current.send('stop-pick');
    }
  };

  const act = action.action || {};

  return (
    <div className="step-editor">
      <h3>Edit Step</h3>

      {/* Step text */}
      <div className="field">
        <label>Step Description</label>
        <input
          type="text"
          value={action.text || ''}
          onChange={e => onUpdate({ text: e.target.value })}
          placeholder="I do something..."
        />
      </div>

      {/* Keyword */}
      <div className="field">
        <label>Keyword</label>
        <select value={action.keyword} onChange={e => onUpdate({ keyword: e.target.value })}>
          {STEP_KEYWORDS.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      {/* Action type */}
      <div className="field">
        <label>Action Type</label>
        <select
          value={act.type || ''}
          onChange={e => onUpdate({ action: { ...act, type: e.target.value } })}
        >
          <option value="">-- select --</option>
          {Object.entries(ACTION_TYPES).map(([key, val]) => (
            <option key={key} value={val}>{val}</option>
          ))}
        </select>
      </div>

      {/* Selector (for most action types) */}
      {act.type && !['navigate', 'capture_url', 'assert_url', 'assert_status_message', 'wait'].includes(act.type) && (
        <div className="field">
          <label>
            Selector
            <span className="strategy-badge">{act.selectorStrategy || 'css'}</span>
          </label>
          {act.framePath && act.framePath.length > 0 && (
            <div className="frame-path-indicator">
              <span className="frame-path-label">Frame:</span>
              {act.framePath.map((idx, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="frame-path-sep">›</span>}
                  <span className="frame-path-index">iframe[{idx}]</span>
                </React.Fragment>
              ))}
              <button
                className="btn btn-sm btn-clear-frame"
                title="Remove frame path (target top-level document)"
                onClick={() => onUpdate({ action: { ...act, framePath: undefined } })}
              >✕</button>
            </div>
          )}
          <div className="selector-row">
            <input
              type="text"
              value={act.selector || ''}
              onChange={e => onUpdate({ action: { ...act, selector: e.target.value } })}
              placeholder="#edit-title-0-value"
            />
            {isPicking ? (
              <button className="btn btn-sm btn-cancel" onClick={cancelPick}>Cancel Pick</button>
            ) : (
              <button className="btn btn-sm btn-pick" onClick={startPick} title="Pick element from page">⊕ Pick</button>
            )}
          </div>
        </div>
      )}

      {/* Value (for type, select) */}
      {['type', 'type_ckeditor', 'select', 'assert_text'].includes(act.type) && (
        <div className="field">
          <label>{act.type === 'assert_text' ? 'Expected Text' : 'Value'}</label>
          <input
            type="text"
            value={act.type === 'assert_text' ? (act.expectedText || '') : (act.value || '')}
            onChange={e => {
              if (act.type === 'assert_text') {
                onUpdate({ action: { ...act, expectedText: e.target.value } });
              } else {
                onUpdate({ action: { ...act, value: e.target.value } });
              }
            }}
          />
        </div>
      )}

      {/* URL (for navigate) */}
      {act.type === 'navigate' && (
        <div className="field">
          <label>URL</label>
          <input
            type="text"
            value={act.url || ''}
            onChange={e => onUpdate({ action: { ...act, url: e.target.value } })}
            placeholder="/node/add/page"
          />
        </div>
      )}

      {/* File name (for upload) */}
      {['upload', 'upload_media'].includes(act.type) && (
        <div className="field">
          <label>File Name</label>
          <input
            type="text"
            value={act.fileName || ''}
            onChange={e => onUpdate({ action: { ...act, fileName: e.target.value } })}
            placeholder="testing.jpg"
          />
        </div>
      )}

      {/* Status message type (for assert_status_message) */}
      {act.type === 'assert_status_message' && (
        <div className="field">
          <label>Message Type</label>
          <select
            value={act.messageType || 'created'}
            onChange={e => onUpdate({ action: { ...act, messageType: e.target.value } })}
          >
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
            <option value="cloned">Cloned</option>
            <option value="saved">Saved</option>
          </select>
        </div>
      )}

      {/* Dynamic variable: capture */}
      {['navigate', 'submit', 'assert_status_message', 'capture_url'].includes(act.type) && (
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={!!act.captureUrl}
              onChange={e => onUpdate({ action: { ...act, captureUrl: e.target.checked } })}
            />
            {' '}Capture URL as variable
          </label>
          {act.captureUrl && (
            <input
              type="text"
              value={act.variableName || 'lastPageUrlforsaved'}
              onChange={e => onUpdate({ action: { ...act, variableName: e.target.value } })}
              placeholder="Variable name"
            />
          )}
        </div>
      )}

      {/* Dynamic variable: use */}
      {['navigate', 'use_captured_url'].includes(act.type) && (
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={!!act.useCapturedUrl}
              onChange={e => onUpdate({ action: { ...act, useCapturedUrl: e.target.checked } })}
            />
            {' '}Use captured variable
          </label>
          {act.useCapturedUrl && (
            <select
              value={act.variableName || ''}
              onChange={e => onUpdate({ action: { ...act, variableName: e.target.value } })}
            >
              <option value="">-- select variable --</option>
              {variables.map(v => (
                <option key={v.id} value={v.name}>{v.name}</option>
              ))}
              <option value="lastPageUrlforsaved">lastPageUrlforsaved</option>
              <option value="lastPageUrlforCloned">lastPageUrlforCloned</option>
            </select>
          )}
        </div>
      )}

      {/* Wait duration */}
      {act.type === 'wait' && (
        <div className="field">
          <label>Duration (ms)</label>
          <input
            type="number"
            value={act.duration || 2000}
            onChange={e => onUpdate({ action: { ...act, duration: parseInt(e.target.value, 10) || 2000 } })}
            min={100}
            step={500}
          />
        </div>
      )}

      {/* Options */}
      <div className="field">
        <label>Options</label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={!!act.useContains}
            onChange={e => onUpdate({ action: { ...act, useContains: e.target.checked } })}
          />
          {' '}Use text matching instead of CSS selector
        </label>
        <label className="option-label">
          <input
            type="checkbox"
            checked={!!act.dismissDialog}
            onChange={e => onUpdate({ action: { ...act, dismissDialog: e.target.checked } })}
          />
          {' '}Dismiss dialog after action
        </label>
      </div>

      {/* Meta info */}
      <div className="step-meta">
        <span>Page: {act.url || '—'}</span>
        <span>Tag: {act.elementTag || '—'}</span>
        {act.labelText && <span>Label: {act.labelText}</span>}
        {act.elementText && <span>Text: {act.elementText}</span>}
      </div>
    </div>
  );
}
