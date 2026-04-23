import React from 'react';

/**
 * VariablePanel — shows all captured dynamic values (URLs, IDs).
 * Allows manual management and running CRUD flow auto-detection.
 */
export default function VariablePanel({ variables, actions, onRemoveVariable, onRunCrudDetection }) {
  const handleDetect = () => {
    const annotations = onRunCrudDetection();
    // Annotations are processed internally by the hook
  };

  return (
    <div className="variable-panel">
      <h3>Dynamic Variables</h3>
      <p className="hint">
        Variables are captured automatically when content is created/cloned.
        They are used to link CRUD steps (create → edit → delete).
      </p>

      <button className="btn btn-detect" onClick={handleDetect}>
        🔍 Auto-detect CRUD Flow
      </button>

      {variables.length === 0 ? (
        <div className="variable-empty">
          <p>No variables captured yet.</p>
          <p className="hint">Create content in the browser and the tool will auto-capture the node URL.</p>
        </div>
      ) : (
        <div className="variable-list">
          {variables.map(v => {
            const sourceAction = actions.find(a => a.id === v.sourceActionId);
            return (
              <div key={v.id} className="variable-card">
                <div className="variable-header">
                  <span className="variable-name">{v.name}</span>
                  <span className="variable-type">{v.type}</span>
                </div>
                {v.value && (
                  <span className="variable-value">{v.value}</span>
                )}
                {v.reason && (
                  <span className="variable-reason">{v.reason}</span>
                )}
                {sourceAction && (
                  <span className="variable-source">From: {sourceAction.text}</span>
                )}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => onRemoveVariable(v.id)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
