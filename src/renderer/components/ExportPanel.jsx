import React, { useState, useMemo } from 'react';

/**
 * ExportPanel — preview generated files, export as ZIP,
 * and integrate directly into a Playwright project.
 */
export default function ExportPanel({ generator, recorder }) {
  const [previewTab, setPreviewTab] = useState('spec'); // spec
  const [exportStatus, setExportStatus] = useState('');

  // Integration agent state
  const [intState, setIntState] = useState('idle');
  // idle | analyzing | confirming | integrating | done | error
  const [selectedDir, setSelectedDir] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [intResults, setIntResults] = useState(null);
  const [intError, setIntError] = useState('');
  const [runInstall, setRunInstall] = useState(true);
  const [placeholders, setPlaceholders] = useState({
    '{{BASE_URL}}': '',
    '{{USERNAME}}': '',
    '{{PASSWORD}}': '',
  });

  const specContent = useMemo(() => {
    try { return generator.generateSteps(); }
    catch (e) { return `// Error generating spec: ${e.message}`; }
  }, [generator.generateSteps]);

  const handleExport = async () => {
    setExportStatus('Exporting...');
    try {
      const result = await generator.exportZip();
      if (result) {
        setExportStatus(`Exported to: ${result}`);
      } else {
        setExportStatus('Export cancelled.');
      }
    } catch (e) {
      setExportStatus(`Export failed: ${e.message}`);
    }
  };

  const handleSaveSession = async () => {
    const data = recorder.getSessionData();
    const result = await generator.saveSession(data);
    if (result) {
      setExportStatus(`Session saved to: ${result}`);
    }
  };

  const handleLoadSession = async () => {
    const data = await generator.loadSession();
    if (data) {
      recorder.loadSessionData(data);
      setExportStatus('Session loaded successfully.');
    }
  };

  // ── Integration Agent flow ──

  const handleSelectFolder = async () => {
    if (!window.electronAPI?.selectProjectDir) return;
    setIntError('');
    const dir = await window.electronAPI.selectProjectDir();
    if (!dir) return;
    setSelectedDir(dir);
    setIntState('analyzing');
    try {
      const result = await window.electronAPI.analyzeProject(dir);
      setAnalysis(result);
      // Pre-fill base URL from active profile
      const baseUrl = recorder.activeProfile?.baseUrl || '';
      setPlaceholders(prev => ({ ...prev, '{{BASE_URL}}': baseUrl }));
      setIntState('confirming');
    } catch (e) {
      setIntError(`Analysis failed: ${e.message}`);
      setIntState('error');
    }
  };

  const handleIntegrate = async () => {
    setIntState('integrating');
    setIntError('');
    try {
      const result = await window.electronAPI.integrateTest({
        targetDir: selectedDir,
        featureName: generator.slug,
        featureContent: specContent,
        stepContent: specContent,
        placeholders,
        runInstall,
      });
      setIntResults(result);
      setIntState('done');
    } catch (e) {
      setIntError(`Integration failed: ${e.message}`);
      setIntState('error');
    }
  };

  const handleIntReset = () => {
    setIntState('idle');
    setSelectedDir('');
    setAnalysis(null);
    setIntResults(null);
    setIntError('');
  };

  return (
    <div className="export-panel">
      <h3>Export</h3>

      {/* File info */}
      <div className="export-info">
        <div className="export-file">
          <span className="file-icon">📄</span>
          <span>{generator.slug}.spec.js</span>
        </div>
      </div>

      {/* Code preview */}
      <pre className="code-preview">
        <code>{specContent}</code>
      </pre>

      {/* Actions */}
      <div className="export-actions">
        <button className="btn btn-export" onClick={handleExport}>
          📦 Export as ZIP
        </button>
        <button className="btn btn-save-session" onClick={handleSaveSession}>
          💾 Save Session
        </button>
        <button className="btn btn-load-session" onClick={handleLoadSession}>
          📂 Load Session
        </button>
      </div>

      {exportStatus && <div className="export-status">{exportStatus}</div>}

      {/* ── Integration Agent Section ── */}
      <div className="integration-section">
        <h3>Integrate into Project</h3>
        <p className="integration-desc">
          Scaffold a full Playwright project or add test files to an existing one.
        </p>

        {intState === 'idle' && (
          <button className="btn btn-integrate" onClick={handleSelectFolder}>
            🚀 Select Project Folder
          </button>
        )}

        {intState === 'analyzing' && (
          <div className="integration-status">Analyzing project...</div>
        )}

        {intState === 'confirming' && analysis && (
          <div className="integration-confirm">
            <div className="int-path">📂 {selectedDir}</div>
            <div className="int-analysis">
              <div className="analysis-badge-row">
                <span className={`analysis-badge ${analysis.hasPlaywrightConfig ? 'ok' : 'missing'}`}>
                  {analysis.hasPlaywrightConfig ? '✓' : '✗'} playwright.config.js
                </span>
                <span className={`analysis-badge ${analysis.hasPackageJson ? 'ok' : 'missing'}`}>
                  {analysis.hasPackageJson ? '✓' : '✗'} package.json
                </span>
                <span className={`analysis-badge ${analysis.hasHelpersDir ? 'ok' : 'missing'}`}>
                  {analysis.hasHelpersDir ? '✓' : '✗'} helpers/
                </span>
                <span className={`analysis-badge ${analysis.hasTestsDir ? 'ok' : 'missing'}`}>
                  {analysis.hasTestsDir ? '✓' : '✗'} tests/
                </span>
              </div>
              {analysis.needsScaffold && (
                <div className="int-scaffold-notice">
                  Will scaffold missing project files into: <code>{analysis.testsDir}</code>
                </div>
              )}
              {!analysis.needsScaffold && (
                <div className="int-scaffold-notice ok">
                  Existing setup detected — only test files will be added.
                </div>
              )}
            </div>

            {/* Placeholder inputs — only shown when scaffolding is needed */}
            {analysis.needsScaffold && (
              <div className="int-placeholders">
                <label>
                  Base URL
                  <input
                    type="text"
                    value={placeholders['{{BASE_URL}}']}
                    onChange={e => setPlaceholders(p => ({ ...p, '{{BASE_URL}}': e.target.value }))}
                    placeholder="https://example.com"
                  />
                </label>
                <label>
                  Username
                  <input
                    type="text"
                    value={placeholders['{{USERNAME}}']}
                    onChange={e => setPlaceholders(p => ({ ...p, '{{USERNAME}}': e.target.value }))}
                    placeholder="admin"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={placeholders['{{PASSWORD}}']}
                    onChange={e => setPlaceholders(p => ({ ...p, '{{PASSWORD}}': e.target.value }))}
                    placeholder="password"
                  />
                </label>
              </div>
            )}

            <label className="int-checkbox">
              <input
                type="checkbox"
                checked={runInstall}
                onChange={e => setRunInstall(e.target.checked)}
              />
              Run <code>npm install</code> after integration
            </label>

            <div className="int-actions">
              <button className="btn btn-integrate" onClick={handleIntegrate}>
                ✅ Integrate
              </button>
              <button className="btn btn-cancel" onClick={handleIntReset}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {intState === 'integrating' && (
          <div className="integration-status">
            Integrating... {runInstall ? '(npm install may take a moment)' : ''}
          </div>
        )}

        {intState === 'done' && intResults && (
          <div className="integration-results">
            <div className="int-success">Integration complete!</div>
            <div className="int-path">📂 {intResults.testsDir}</div>

            {intResults.scaffold.length > 0 && (
              <div className="int-file-list">
                <strong>Scaffold files:</strong>
                {intResults.scaffold.map((f, i) => (
                  <div key={i} className={`file-result ${f.status}`}>
                    <span className="file-status">{f.status === 'created' ? '✓' : '–'}</span>
                    <span>{f.path}</span>
                    {f.reason && <span className="file-reason">({f.reason})</span>}
                  </div>
                ))}
              </div>
            )}

            <div className="int-file-list">
              <strong>Test files:</strong>
              {intResults.testFiles.map((f, i) => (
                <div key={i} className={`file-result ${f.status}`}>
                  <span className="file-status">✓</span>
                  <span>{f.path}</span>
                </div>
              ))}
            </div>

            {intResults.install && (
              <div className={`int-install-result ${intResults.install.status}`}>
                npm install: {intResults.install.status === 'success' ? '✓ Done' : `✗ ${intResults.install.message}`}
              </div>
            )}

            <div className="int-run-hint">
              Run: <code>cd {intResults.testsDir} && npx playwright test --ui</code>
            </div>

            <button className="btn btn-cancel" onClick={handleIntReset}>
              Done
            </button>
          </div>
        )}

        {intState === 'error' && (
          <div className="integration-error">
            <div className="int-error-msg">{intError}</div>
            <button className="btn btn-cancel" onClick={handleIntReset}>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
