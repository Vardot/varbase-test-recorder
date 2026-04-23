import React, { useState } from 'react';
import { useRecorder } from './hooks/useRecorder';
import { useGenerator } from './hooks/useGenerator';
import { useReplay } from './hooks/useReplay';
import Browser from './components/Browser';
import StepList from './components/StepList';
import StepEditor from './components/StepEditor';
import ScenarioBuilder from './components/ScenarioBuilder';
import AssertionBuilder from './components/AssertionBuilder';
import ExportPanel from './components/ExportPanel';
import ConfigPanel from './components/ConfigPanel';
import VariablePanel from './components/VariablePanel';
import ReplayPanel from './components/ReplayPanel';

export default function App() {
  const recorder = useRecorder();
  const generator = useGenerator({
    featureName: recorder.featureName,
    featureDescription: recorder.featureDescription,
    scenarios: recorder.scenarios,
    actions: recorder.actions,
    variables: recorder.variables,
    genOptions: recorder.genOptions,
    activeProfile: recorder.activeProfile,
  });

  const replay = useReplay({
    webviewRef: recorder.webviewRef,
    scenarios: recorder.scenarios,
    actions: recorder.actions,
    activeProfile: recorder.activeProfile,
  });

  const [selectedActionId, setSelectedActionId] = useState(null);
  const [rightPanel, setRightPanel] = useState('editor'); // editor | scenarios | assertions | replay | export | config | variables

  const selectedAction = recorder.actions.find(a => a.id === selectedActionId);

  return (
    <div className="app">
      {/* ── Top Toolbar ──────────────────────────────────────────────── */}
      <div className="toolbar">
        <div className="toolbar-left">
          <span className="app-title">Varbase Test Recorder</span>

          <select
            className="profile-select"
            value={recorder.activeProfileId}
            onChange={e => recorder.switchProfile(e.target.value)}
          >
            {recorder.profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="toolbar-center">
          <input
            className="feature-name-input"
            type="text"
            placeholder="Feature name (e.g. Manage Basic Pages)"
            value={recorder.featureName}
            onChange={e => recorder.setFeatureName(e.target.value)}
          />
        </div>

        <div className="toolbar-right">
          {recorder.recordingState === 'idle' && (
            <button className="btn btn-record" onClick={recorder.startRecording}>
              ● Record
            </button>
          )}
          {recorder.recordingState === 'recording' && (
            <>
              <span className="recording-indicator">● Recording</span>
              <button className="btn btn-pause" onClick={recorder.pauseRecording}>
                ❚❚ Pause
              </button>
              <button className="btn btn-stop" onClick={recorder.stopRecording}>
                ■ Stop
              </button>
            </>
          )}
          {recorder.recordingState === 'paused' && (
            <>
              <span className="paused-indicator">❚❚ Paused</span>
              <button className="btn btn-record" onClick={recorder.startRecording}>
                ● Resume
              </button>
              <button className="btn btn-stop" onClick={recorder.stopRecording}>
                ■ Stop
              </button>
            </>
          )}
          <button className="btn btn-clear" onClick={recorder.clearRecording} title="Clear all">
            ✕ Clear
          </button>
          {replay.replayState === 'running' && (
            <span className="replay-indicator">▶ Replaying</span>
          )}
          {replay.replayState === 'paused' && (
            <span className="replay-paused-indicator">❚❚ Replay Paused</span>
          )}
        </div>
      </div>

      {/* ── Main Panels ──────────────────────────────────────────────── */}
      <div className="panels">
        {/* Left Panel: Steps List */}
        <div className="panel panel-left">
          <div className="panel-tabs">
            <button
              className={`panel-tab ${rightPanel === 'editor' ? 'active' : ''}`}
              onClick={() => setRightPanel('editor')}
            >Steps</button>
            <button
              className={`panel-tab ${rightPanel === 'scenarios' ? 'active' : ''}`}
              onClick={() => setRightPanel('scenarios')}
            >Scenarios</button>
          </div>
          <StepList
            actions={recorder.actions}
            scenarios={recorder.scenarios}
            activeScenarioId={recorder.activeScenarioId}
            onSelectAction={setSelectedActionId}
            selectedActionId={selectedActionId}
            onRemoveAction={recorder.removeAction}
            onReorderActions={recorder.reorderActions}
          />
        </div>

        {/* Center Panel: Browser */}
        <div className="panel panel-center">
          <Browser
            webviewRef={recorder.webviewRef}
            baseUrl={recorder.activeProfile?.baseUrl || 'https://example.com'}
            onNavigation={recorder.handleNavigation}
            onRecorderAction={recorder.addAction}
            recordingState={recorder.recordingState}
          />
        </div>

        {/* Right Panel: Context-dependent editor */}
        <div className="panel panel-right">
          <div className="panel-tabs">
            <button className={`panel-tab ${rightPanel === 'editor' ? 'active' : ''}`} onClick={() => setRightPanel('editor')}>Edit</button>
            <button className={`panel-tab ${rightPanel === 'scenarios' ? 'active' : ''}`} onClick={() => setRightPanel('scenarios')}>Scenarios</button>
            <button className={`panel-tab ${rightPanel === 'assertions' ? 'active' : ''}`} onClick={() => setRightPanel('assertions')}>Assert</button>
            <button className={`panel-tab ${rightPanel === 'variables' ? 'active' : ''}`} onClick={() => setRightPanel('variables')}>Vars</button>
            <button className={`panel-tab ${rightPanel === 'replay' ? 'active' : ''}`} onClick={() => setRightPanel('replay')}>Replay</button>
            <button className={`panel-tab ${rightPanel === 'export' ? 'active' : ''}`} onClick={() => setRightPanel('export')}>Export</button>
            <button className={`panel-tab ${rightPanel === 'config' ? 'active' : ''}`} onClick={() => setRightPanel('config')}>Config</button>
          </div>

          <div className="panel-content">
            {rightPanel === 'editor' && (
              <StepEditor
                action={selectedAction}
                variables={recorder.variables}
                onUpdate={(updates) => selectedActionId && recorder.updateAction(selectedActionId, updates)}
                webviewRef={recorder.webviewRef}
              />
            )}
            {rightPanel === 'scenarios' && (
              <ScenarioBuilder
                scenarios={recorder.scenarios}
                actions={recorder.actions}
                activeScenarioId={recorder.activeScenarioId}
                featureDescription={recorder.featureDescription}
                onSetFeatureDescription={recorder.setFeatureDescription}
                onSetActiveScenario={recorder.setActiveScenarioId}
                onAddScenario={recorder.addScenario}
                onRemoveScenario={recorder.removeScenario}
                onUpdateScenario={recorder.updateScenario}
                onMoveAction={recorder.moveActionToScenario}
              />
            )}
            {rightPanel === 'assertions' && (
              <AssertionBuilder
                onAddAssertion={recorder.addAssertionStep}
                webviewRef={recorder.webviewRef}
              />
            )}
            {rightPanel === 'replay' && (
              <ReplayPanel
                replay={replay}
                scenarios={recorder.scenarios}
                actions={recorder.actions}
              />
            )}
            {rightPanel === 'variables' && (
              <VariablePanel
                variables={recorder.variables}
                actions={recorder.actions}
                onRemoveVariable={recorder.removeVariable}
                onRunCrudDetection={recorder.runCrudDetection}
              />
            )}
            {rightPanel === 'export' && (
              <ExportPanel
                generator={generator}
                recorder={recorder}
              />
            )}
            {rightPanel === 'config' && (
              <ConfigPanel
                profiles={recorder.profiles}
                activeProfileId={recorder.activeProfileId}
                genOptions={recorder.genOptions}
                onAddProfile={recorder.addProfile}
                onUpdateProfile={recorder.updateProfile}
                onRemoveProfile={recorder.removeProfile}
                onSwitchProfile={recorder.switchProfile}
                onSetGenOptions={recorder.setGenOptions}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
