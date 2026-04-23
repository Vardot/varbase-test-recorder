import React from 'react';

/**
 * ScenarioBuilder — manage scenario groupings and feature description.
 */
export default function ScenarioBuilder({
  scenarios,
  actions,
  activeScenarioId,
  featureDescription,
  onSetFeatureDescription,
  onSetActiveScenario,
  onAddScenario,
  onRemoveScenario,
  onUpdateScenario,
  onMoveAction,
}) {
  return (
    <div className="scenario-builder">
      <h3>Scenarios</h3>

      {/* Feature description */}
      <div className="field">
        <label>Feature Description</label>
        <textarea
          rows={3}
          value={featureDescription}
          onChange={e => onSetFeatureDescription(e.target.value)}
          placeholder={`As a Site Admin,\nI want to manage content,\nSo that users can view relevant content on the website.`}
        />
      </div>

      {/* Scenario list */}
      <div className="scenario-list">
        {scenarios.map(scenario => {
          const stepCount = scenario.stepIds.length;
          const isActive = scenario.id === activeScenarioId;

          return (
            <div key={scenario.id} className={`scenario-item ${isActive ? 'active' : ''}`}>
              <div className="scenario-item-header">
                <input
                  type="text"
                  className="scenario-name-input"
                  value={scenario.name}
                  onChange={e => onUpdateScenario(scenario.id, { name: e.target.value })}
                />
                <span className="scenario-step-count">{stepCount} steps</span>
              </div>

              <div className="scenario-item-actions">
                <button
                  className={`btn btn-sm ${isActive ? 'btn-active' : ''}`}
                  onClick={() => onSetActiveScenario(isActive ? null : scenario.id)}
                >
                  {isActive ? '✓ Active' : 'Set Active'}
                </button>
                {scenarios.length > 1 && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => onRemoveScenario(scenario.id)}
                  >
                    Delete
                  </button>
                )}
              </div>

              {/* Steps in this scenario */}
              <div className="scenario-steps-mini">
                {scenario.stepIds.map(stepId => {
                  const step = actions.find(a => a.id === stepId);
                  if (!step) return null;
                  return (
                    <div key={stepId} className="scenario-step-mini">
                      <span className="mini-keyword">{step.keyword}</span>
                      <span className="mini-text">{step.text}</span>
                      {/* Move to another scenario */}
                      {scenarios.length > 1 && (
                        <select
                          className="move-select"
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              onMoveAction(stepId, scenario.id, e.target.value);
                            }
                          }}
                        >
                          <option value="">Move to...</option>
                          {scenarios.filter(s => s.id !== scenario.id).map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button className="btn btn-add-scenario" onClick={() => onAddScenario()}>
        + Add Scenario
      </button>
    </div>
  );
}
