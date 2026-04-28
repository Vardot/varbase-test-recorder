import React, { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Browser component — wraps an Electron <webview> with URL bar and nav controls.
 * The webview loads the Drupal site and runs the recorder preload script.
 */
export default function Browser({ webviewRef, baseUrl, onNavigation, onRecorderAction, recordingState }) {
  const [url, setUrl] = useState(baseUrl || 'about:blank');
  const [inputUrl, setInputUrl] = useState(baseUrl || '');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [preloadPath, setPreloadPath] = useState('');
  const internalRef = useRef(null);
  const lastNavUrl = useRef('');

  // Use the external ref or a local one
  const wv = webviewRef || internalRef;

  // Fetch the recorder preload path from the main process
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getRecorderPreloadPath) {
      window.electronAPI.getRecorderPreloadPath().then((p) => {
        setPreloadPath(p);
      }).catch(() => {});
    }
  }, []);

  // Set up webview event listeners once mounted
  useEffect(() => {
    const webview = wv.current;
    if (!webview) return;

    const handleDomReady = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };

    const handleDidNavigate = (_e) => {
      const newUrl = webview.getURL();
      setUrl(newUrl);
      setInputUrl(newUrl);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      setIsLoading(false);

      // Notify the replay engine that navigation completed
      window.dispatchEvent(new CustomEvent('replay-navigation-complete', { detail: { url: newUrl } }));

      // Only report navigation if URL actually changed
      if (newUrl !== lastNavUrl.current) {
        lastNavUrl.current = newUrl;
        onNavigation(newUrl);
      }
    };

    const handleDidNavigateInPage = (_e) => {
      const newUrl = webview.getURL();
      setUrl(newUrl);
      setInputUrl(newUrl);
    };

    const handleLoadStart = () => {
      setIsLoading(true);
    };

    const handleFailLoad = (event) => {
      setIsLoading(false);
      const errorCode = event.errorCode;
      const errorDescription = event.errorDescription || 'Unknown error';
      const validatedUrl = event.validatedURL || '';
      // ERR_ABORTED (-3) is normal during redirects — don't treat as failure
      if (errorCode === -3) {
        console.log(`[Browser] did-fail-load: ERR_ABORTED for ${validatedUrl} (redirect in progress)`);
        return;
      }
      console.warn(`[Browser] did-fail-load: ${errorCode} ${errorDescription} for ${validatedUrl}`);
      // Notify replay engine so navigateAndWait doesn't hang
      window.dispatchEvent(new CustomEvent('replay-navigation-complete', { detail: { url: null, error: errorDescription, errorCode } }));
    };

    const handleIpcMessage = (event) => {
      const { channel, args } = event;
      if (channel === 'recorder-action' && args[0]) {
        onRecorderAction(args[0]);
      }
      if (channel === 'element-picked' && args[0]) {
        // Dispatch a custom event that other components can listen to
        window.dispatchEvent(new CustomEvent('element-picked', { detail: args[0] }));
      }
      if (channel === 'replay-result' && args[0]) {
        // Dispatch replay result to the useReplay hook
        window.dispatchEvent(new CustomEvent('replay-result', { detail: args[0] }));
      }
      if (channel === 'recorder-ready') {
        // Send current recording state to the new page
        if (recordingState === 'recording') {
          webview.send('set-recording', true);
        }
        // Notify replay engine that the preload is ready for actions
        window.dispatchEvent(new CustomEvent('preload-ready'));
      }
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage);
    webview.addEventListener('did-start-loading', handleLoadStart);
    webview.addEventListener('did-fail-load', handleFailLoad);
    webview.addEventListener('ipc-message', handleIpcMessage);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage);
      webview.removeEventListener('did-start-loading', handleLoadStart);
      webview.removeEventListener('did-fail-load', handleFailLoad);
      webview.removeEventListener('ipc-message', handleIpcMessage);
    };
  }, [wv, onNavigation, onRecorderAction, recordingState]);

  // When recording state changes, tell the webview
  useEffect(() => {
    const webview = wv.current;
    if (!webview) return;
    try {
      webview.send('set-recording', recordingState === 'recording');
    } catch {}
  }, [recordingState, wv]);

  const navigateTo = useCallback((targetUrl) => {
    const webview = wv.current;
    if (!webview) return;
    let normalized = targetUrl.trim();
    if (normalized && !normalized.match(/^https?:\/\//)) {
      normalized = 'https://' + normalized;
    }
    setInputUrl(normalized);
    webview.loadURL(normalized);
  }, [wv]);

  const handleUrlSubmit = (e) => {
    e.preventDefault();
    navigateTo(inputUrl);
  };

  const goBack = () => wv.current?.goBack();
  const goForward = () => wv.current?.goForward();
  const reload = () => wv.current?.reload();

  return (
    <div className="browser">
      {/* Navigation bar */}
      <div className="browser-nav">
        <button className="nav-btn" onClick={goBack} disabled={!canGoBack} title="Back">←</button>
        <button className="nav-btn" onClick={goForward} disabled={!canGoForward} title="Forward">→</button>
        <button className="nav-btn" onClick={reload} title="Reload">↻</button>
        {isLoading && <span className="loading-spinner" />}

        <form className="url-form" onSubmit={handleUrlSubmit}>
          <input
            className="url-input"
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            placeholder="Enter URL..."
          />
          <button className="btn btn-go" type="submit">Go</button>
        </form>

        {recordingState === 'recording' && (
          <span className="recording-badge">● REC</span>
        )}
      </div>

      {/* Webview */}
      {preloadPath ? (
        <webview
          ref={wv}
          className="browser-webview"
          src={baseUrl}
          preload={`file://${preloadPath}`}
          partition="persist:recorder"
          allowpopups="true"
          webpreferences="contextIsolation=yes"
        />
      ) : (
        <div className="browser-webview" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          Loading browser engine...
        </div>
      )}
    </div>
  );
}
