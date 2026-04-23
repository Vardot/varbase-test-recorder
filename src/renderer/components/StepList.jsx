import React, { useCallback } from 'react';

const KEYWORD_COLORS = {
  Given: '#3b82f6',
  When: '#22c55e',
  Then: '#f59e0b',
  And: '#8b5cf6',
};

/**
 * StepList — left sidebar showing recorded steps grouped by scenario.
 * Supports selection, deletion, and drag-to-reorder.
 */
export default function StepList({
  actions,
  scenarios,
  activeScenarioId,
  onSelectAction,
  selectedActionId,
  onRemoveAction,
  onReorderActions,
}) {
  const [dragItem, setDragItem] = React.useState(null);

  const handleDragStart = useCallback((e, scenarioId, index) => {
    setDragItem({ scenarioId, index });
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, scenarioId, toIndex) => {
    e.preventDefault();
    if (dragItem && dragItem.scenarioId === scenarioId) {
      onReorderActions(scenarioId, dragItem.index, toIndex);
    }
    setDragItem(null);
  }, [dragItem, onReorderActions]);

  const getActionTypeIcon = (action) => {
    if (!action?.action) return '?';
    switch (action.action.type) {
      case 'navigate': return '🔗';
      case 'click': return '👆';
      case 'type': return '⌨';
      case 'select': return '☰';
      case 'check': return '☑';
      case 'upload': return '📎';
      case 'submit': return '💾';
      case 'assert_visible':
      case 'assert_text':
      case 'assert_url':
      case 'assert_status_message':
      case 'assert_exists':
      case 'assert_not_exists': return '✓';
      case 'capture_url': return '📌';
      case 'use_captured_url': return '↩';
      default: return '•';
    }
  };

  if (actions.length === 0) {
    return (
      <div className="step-list-empty">
        <p>No steps recorded yet.</p>
        <p className="hint">Click <strong>Record</strong> and interact with the site to start capturing steps.</p>
      </div>
    );
  }

  return (
    <div className="step-list">
      {scenarios.map(scenario => {
        const scenarioSteps = scenario.stepIds
          .map(id => actions.find(a => a.id === id))
          .filter(Boolean);

        return (
          <div key={scenario.id} className={`step-list-scenario ${scenario.id === activeScenarioId ? 'active' : ''}`}>
            <div className="scenario-header">
              <span className="scenario-name">{scenario.name}</span>
              <span className="scenario-count">{scenarioSteps.length} steps</span>
            </div>

            {scenarioSteps.map((action, index) => (
              <div
                key={action.id}
                className={`step-card ${action.id === selectedActionId ? 'selected' : ''}`}
                onClick={() => onSelectAction(action.id)}
                draggable
                onDragStart={(e) => handleDragStart(e, scenario.id, index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, scenario.id, index)}
              >
                <div className="step-card-left">
                  <span className="step-drag-handle">⠿</span>
                  <span className="step-icon">{getActionTypeIcon(action)}</span>
                </div>
                <div className="step-card-content">
                  <span
                    className="step-keyword"
                    style={{ color: KEYWORD_COLORS[action.keyword] || '#666' }}
                  >
                    {action.keyword}
                  </span>
                  <span className="step-text">{action.text}</span>
                </div>
                <button
                  className="step-delete-btn"
                  onClick={(e) => { e.stopPropagation(); onRemoveAction(action.id); }}
                  title="Remove step"
                >
                  ×
                </button>
              </div>
            ))}

            {scenarioSteps.length === 0 && (
              <div className="step-card-empty">No steps in this scenario</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
