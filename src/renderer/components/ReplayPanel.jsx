import React, { useRef, useEffect } from 'react';

/**
 * ReplayPanel — scenario replay controls and step status display.
 */
export default function ReplayPanel({ replay, scenarios, actions }) {
  const {
    replayState,
    currentStepIndex,
    stepResults,
    speed,
    setSpeed,
    stopOnFailure,
    setStopOnFailure,
    includeLogin,
    setIncludeLogin,
    replayScenarioId,
    replaySteps,
    startReplay,
    startStepByStep,
    pauseReplay,
    resumeReplay,
    stopReplay,
    stepForward,
  } = replay;

  const stepListRef = useRef(null);
  const [selectedScenarioId, setSelectedScenarioId] = React.useState('');

  // Auto-select first scenario
  React.useEffect(() => {
    if (!selectedScenarioId && scenarios.length > 0) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  // Auto-scroll to current step
  useEffect(() => {
    if (currentStepIndex >= 0 && stepListRef.current) {
      const el = stepListRef.current.querySelector(`[data-step-index="${currentStepIndex}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentStepIndex]);

  const isRunning = replayState === 'running';
  const isPaused = replayState === 'paused';
  const isDone = replayState === 'done';
  const isIdle = replayState === 'idle';

  // Resolve steps for the selected scenario (for preview when idle)
  const previewSteps = React.useMemo(() => {
    const scenario = scenarios.find(s => s.id === selectedScenarioId);
    if (!scenario) return [];
    return scenario.stepIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);
  }, [selectedScenarioId, scenarios, actions]);

  const displaySteps = (isRunning || isPaused || isDone) ? replaySteps : previewSteps;

  // Summary stats
  const passedCount = stepResults.filter(r => r.status === 'passed').length;
  const failedCount = stepResults.filter(r => r.status === 'failed').length;
  const totalCount = stepResults.length;

  const handlePlay = () => {
    if (isPaused) {
      resumeReplay();
    } else if (isIdle || isDone) {
      if (speed <= 0) {
        startStepByStep(selectedScenarioId);
      } else {
        startReplay(selectedScenarioId);
      }
    }
  };

  const speedLabel = speed <= 0 ? 'Step' : speed <= 200 ? 'Fast' : speed <= 700 ? 'Normal' : 'Slow';

  return (
    <div className="replay-panel">
      <h3>Replay Scenario</h3>

      {/* Scenario selector */}
      <div className="field replay-scenario-select">
        <label>Scenario</label>
        <select
          value={selectedScenarioId}
          onChange={e => setSelectedScenarioId(e.target.value)}
          disabled={isRunning || isPaused}
        >
          {scenarios.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.stepIds.length} steps)</option>
          ))}
        </select>
      </div>

      {/* Speed control */}
      <div className="replay-speed">
        <label>Speed: <span className="speed-label">{speedLabel}</span></label>
        <input
          type="range"
          min="0"
          max="2000"
          step="100"
          value={speed}
          onChange={e => setSpeed(Number(e.target.value))}
          disabled={isRunning}
          className="speed-slider"
        />
        <div className="speed-ticks">
          <span>Step</span>
          <span>Fast</span>
          <span>Normal</span>
          <span>Slow</span>
        </div>
      </div>

      {/* Options */}
      <label className="option-label replay-option">
        <input
          type="checkbox"
          checked={stopOnFailure}
          onChange={e => setStopOnFailure(e.target.checked)}
        />
        {' '}Stop on failure
      </label>

      <label className="option-label replay-option">
        <input
          type="checkbox"
          checked={includeLogin}
          onChange={e => setIncludeLogin(e.target.checked)}
          disabled={isRunning || isPaused}
        />
        {' '}Login before replay
      </label>

      {/* Controls */}
      <div className="replay-controls">
        {(isIdle || isDone) && (
          <button className="btn btn-replay-play" onClick={handlePlay} disabled={previewSteps.length === 0}>
            ▶ {speed <= 0 ? 'Start Step-by-Step' : 'Play'}
          </button>
        )}
        {isRunning && (
          <button className="btn btn-pause" onClick={pauseReplay}>
            ❚❚ Pause
          </button>
        )}
        {isPaused && (
          <>
            <button className="btn btn-replay-play" onClick={resumeReplay}>
              ▶ Resume
            </button>
            <button className="btn btn-replay-step" onClick={stepForward}>
              ⏭ Step
            </button>
          </>
        )}
        {(isRunning || isPaused) && (
          <button className="btn btn-stop" onClick={stopReplay}>
            ■ Stop
          </button>
        )}
      </div>

      {/* Summary (when done or in progress) */}
      {(isRunning || isPaused || isDone) && totalCount > 0 && (
        <div className={`replay-summary ${isDone ? (failedCount === 0 ? 'all-passed' : 'has-failures') : ''}`}>
          <span className="summary-passed">{passedCount} passed</span>
          {failedCount > 0 && <span className="summary-failed">{failedCount} failed</span>}
          <span className="summary-total">{passedCount + failedCount} / {totalCount}</span>
        </div>
      )}

      {/* Step list */}
      <div className="replay-step-list" ref={stepListRef}>
        {displaySteps.map((step, index) => {
          const result = stepResults[index];
          const status = result?.status || 'pending';
          const isCurrent = index === currentStepIndex;

          return (
            <div
              key={step.id}
              data-step-index={index}
              className={`replay-step ${status} ${isCurrent ? 'current' : ''}`}
            >
              <span className="replay-step-icon">
                {status === 'pending' && '○'}
                {status === 'running' && '◉'}
                {status === 'passed' && '✓'}
                {status === 'failed' && '✗'}
              </span>
              <span className="replay-step-index">{index + 1}</span>
              <span className="replay-step-text">
                <span className="replay-step-keyword">{step.keyword}</span>
                {' '}{step.text}
              </span>
              {result?.warning && (
                <span className="replay-step-warning" title={result.warning}>⚠</span>
              )}
              {result?.error && (
                <div className="replay-step-error">{result.error}</div>
              )}
            </div>
          );
        })}
        {displaySteps.length === 0 && (
          <div className="replay-empty">
            No steps in selected scenario. Record some steps first.
          </div>
        )}
      </div>
    </div>
  );
}
