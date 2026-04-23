import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Replay engine hook.
 * Orchestrates step-by-step execution of a recorded scenario in the webview.
 */
export function useReplay({ webviewRef, scenarios, actions, activeProfile }) {
  const [replayState, setReplayState] = useState('idle'); // idle | running | paused | done | error
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [stepResults, setStepResults] = useState([]); // { stepId, status, error?, warning? }
  const [speed, setSpeed] = useState(500); // ms delay between steps
  const [stopOnFailure, setStopOnFailure] = useState(true);
  const [includeLogin, setIncludeLogin] = useState(false);
  const [replayScenarioId, setReplayScenarioId] = useState(null);
  const [replaySteps, setReplaySteps] = useState([]);

  // Refs to track the current execution state without stale closures
  const stateRef = useRef('idle');
  const capturedUrls = useRef({});
  const resolveReplayResult = useRef(null);
  const resolveNavigation = useRef(null);
  const resolvePreloadReady = useRef(null);
  const abortRef = useRef(false);
  const pausePromiseRef = useRef(null);
  const resumeRef = useRef(null);
  const speedRef = useRef(speed);
  const stopOnFailureRef = useRef(stopOnFailure);

  // Keep refs in sync
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { stopOnFailureRef.current = stopOnFailure; }, [stopOnFailure]);

  // Listen for replay-result events from Browser.jsx
  useEffect(() => {
    const handler = (e) => {
      if (resolveReplayResult.current) {
        resolveReplayResult.current(e.detail);
        resolveReplayResult.current = null;
      }
    };
    window.addEventListener('replay-result', handler);
    return () => window.removeEventListener('replay-result', handler);
  }, []);

  // Listen for navigation-complete events from Browser.jsx
  useEffect(() => {
    const handler = (e) => {
      if (resolveNavigation.current) {
        resolveNavigation.current(e.detail?.url);
        resolveNavigation.current = null;
      }
    };
    window.addEventListener('replay-navigation-complete', handler);
    return () => window.removeEventListener('replay-navigation-complete', handler);
  }, []);

  // Listen for preload-ready events (preload script initialized after page load)
  useEffect(() => {
    const handler = () => {
      if (resolvePreloadReady.current) {
        resolvePreloadReady.current();
        resolvePreloadReady.current = null;
      }
    };
    window.addEventListener('preload-ready', handler);
    return () => window.removeEventListener('preload-ready', handler);
  }, []);

  /** Send an action to the webview and wait for the result. */
  const sendReplayAction = useCallback((stepId, action) => {
    return new Promise((resolve) => {
      resolveReplayResult.current = resolve;
      const wv = webviewRef?.current;
      if (!wv) {
        resolve({ stepId, status: 'failed', error: 'Webview not available' });
        return;
      }
      // Timeout: if no result in 30s, fail
      const timeout = setTimeout(() => {
        if (resolveReplayResult.current === resolve) {
          resolveReplayResult.current = null;
          resolve({ stepId, status: 'failed', error: 'Step timed out after 30s' });
        }
      }, 30000);
      const origResolve = resolve;
      resolveReplayResult.current = (result) => {
        clearTimeout(timeout);
        origResolve(result);
      };
      wv.send('replay-action', { stepId, action });
    });
  }, [webviewRef]);

  /** Navigate the webview and wait for did-navigate or did-fail-load. */
  const navigateAndWait = useCallback((url) => {
    return new Promise((resolve) => {
      const wv = webviewRef?.current;
      if (!wv) {
        resolve(null);
        return;
      }
      const timeout = setTimeout(() => {
        if (resolveNavigation.current === wrappedResolve) {
          resolveNavigation.current = null;
          resolve(null);
        }
      }, 30000);
      const wrappedResolve = (navUrl) => {
        clearTimeout(timeout);
        resolve(navUrl);
      };
      resolveNavigation.current = wrappedResolve;
      try {
        wv.loadURL(url);
      } catch (err) {
        clearTimeout(timeout);
        resolveNavigation.current = null;
        console.warn('[Replay] loadURL failed:', err.message);
        resolve(null);
      }
    });
  }, [webviewRef]);

  /** Wait for the preload script to signal it's ready after a page navigation. */
  const waitForPreload = useCallback(() => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (resolvePreloadReady.current === wrappedResolve) {
          resolvePreloadReady.current = null;
        }
        resolve(); // resolve anyway after timeout
      }, 5000);
      const wrappedResolve = () => {
        clearTimeout(timeout);
        resolve();
      };
      resolvePreloadReady.current = wrappedResolve;
    });
  }, []);

  /** Get the base URL from the webview's current location, falling back to the profile. */
  const getBaseUrl = useCallback(() => {
    const wv = webviewRef?.current;
    if (wv) {
      try {
        const currentUrl = wv.getURL();
        if (currentUrl && !currentUrl.startsWith('about:')) {
          const u = new URL(currentUrl);
          return u.origin;
        }
      } catch {}
    }
    return (activeProfile?.baseUrl || '').replace(/\/$/, '');
  }, [webviewRef, activeProfile]);

  /** Resolve the URL for a navigate/use_captured_url action. */
  const resolveUrl = useCallback((action) => {
    const baseUrl = getBaseUrl();
    if (action.type === 'use_captured_url') {
      const varName = action.variableName || 'lastPageUrlforsaved';
      return capturedUrls.current[varName] || '';
    }
    if (action.type === 'navigate') {
      if (action.useCapturedUrl && action.variableName) {
        return capturedUrls.current[action.variableName] || '';
      }
      // Check if it looks like a node page and we have a saved URL
      const relPath = action.relativePath || '';
      if (/\/node\/\d+/.test(relPath) && capturedUrls.current.lastPageUrlforsaved) {
        return capturedUrls.current.lastPageUrlforsaved;
      }
      // Prefer the stored full URL — it's the exact URL from recording
      if (action.url && action.url.startsWith('http')) {
        return action.url;
      }
      // Fall back to constructing from relative path + base
      const path = action.relativePath || '';
      if (!path) return '';
      return baseUrl + (path.startsWith('/') ? path : '/' + path);
    }
    return '';
  }, [getBaseUrl]);

  /** Wait for delay, respecting pause. */
  const waitDelay = useCallback(async () => {
    if (speedRef.current <= 0) return; // step-by-step mode has no auto-delay
    await new Promise(r => setTimeout(r, speedRef.current));
  }, []);

  /** Check if paused and wait for resume. */
  const checkPause = useCallback(() => {
    if (stateRef.current === 'paused') {
      return new Promise((resolve) => {
        resumeRef.current = resolve;
        pausePromiseRef.current = resolve;
      });
    }
    return Promise.resolve();
  }, []);

  /** Execute a single step. Returns the result. */
  const executeStep = useCallback(async (step, stepIndex) => {
    const action = step.action || step;
    const stepId = step.id;

    setCurrentStepIndex(stepIndex);
    setStepResults(prev => {
      const updated = [...prev];
      updated[stepIndex] = { stepId, status: 'running' };
      return updated;
    });

    let result;

    try {
      // Handle navigation actions from the renderer side
      if (action.type === 'navigate' || action.type === 'use_captured_url') {
        const url = resolveUrl(action);
        if (!url) {
          result = { stepId, status: 'failed', error: 'Could not resolve URL for navigation' };
        } else {
          const navResult = await navigateAndWait(url);
          if (!navResult) {
            result = { stepId, status: 'failed', error: `Navigation failed for ${url}` };
          } else {
            // Wait for preload to initialize on the new page
            await waitForPreload();
            // After navigation, also ask the webview preload if there's a dismiss-dialog needed
            if (action.dismissDialog) {
              await sendReplayAction(stepId, { type: 'click', selector: '.ui-dialog .ui-dialog-buttonpane button', elementText: '' });
            }
            result = { stepId, status: 'passed' };
          };
        }
      } else {
        // All other actions: send to preload
        result = await sendReplayAction(stepId, action);
      }

      // Handle captured URLs from results
      if (result.capturedUrl && result.variableName) {
        capturedUrls.current[result.variableName] = result.capturedUrl;
      }

    } catch (err) {
      result = { stepId, status: 'failed', error: err.message };
    }

    // Record the result
    setStepResults(prev => {
      const updated = [...prev];
      updated[stepIndex] = { stepId, status: result.status, error: result.error, warning: result.warning };
      return updated;
    });

    return result;
  }, [resolveUrl, navigateAndWait, waitForPreload, sendReplayAction]);

  /** Main replay loop. */
  const runReplay = useCallback(async (steps, doLogin) => {
    stateRef.current = 'running';
    setReplayState('running');
    abortRef.current = false;
    capturedUrls.current = {};

    // Initialize results
    setStepResults(steps.map(s => ({ stepId: s.id, status: 'pending' })));

    // Optionally login before replaying
    if (doLogin && activeProfile) {
      try {
        const baseUrl = getBaseUrl();
        const loginPath = activeProfile.loginPath || '/user/login';
        const loginUrl = baseUrl + (loginPath.startsWith('/') ? loginPath : '/' + loginPath);
        const navResult = await navigateAndWait(loginUrl);
        if (navResult) {
          // Wait for preload to initialize on the login page
          await waitForPreload();
          // Fill credentials
          await sendReplayAction('__login_user', {
            type: 'type',
            selector: activeProfile.usernameSelector || '#edit-name',
            value: 'admin',
          });
          await sendReplayAction('__login_pass', {
            type: 'type',
            selector: activeProfile.passwordSelector || '#edit-pass',
            value: 'admin',
          });
          await sendReplayAction('__login_submit', {
            type: 'click',
            selector: activeProfile.submitSelector || '#edit-submit',
          });
          // Wait for login to complete
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err) {
        console.warn('[Replay] Login failed:', err.message);
      }
    }

    for (let i = 0; i < steps.length; i++) {
      // Check abort
      if (abortRef.current) break;
      // Check pause
      await checkPause();
      if (abortRef.current) break;

      const result = await executeStep(steps[i], i);

      if (result.status === 'failed' && stopOnFailureRef.current) {
        stateRef.current = 'paused';
        setReplayState('paused');
        // Wait for resume or abort
        await checkPause();
        if (abortRef.current) break;
      }

      // Delay between steps (unless last step)
      if (i < steps.length - 1 && !abortRef.current) {
        await waitDelay();
      }
    }

    if (!abortRef.current) {
      stateRef.current = 'done';
      setReplayState('done');
    }
  }, [activeProfile, getBaseUrl, navigateAndWait, sendReplayAction, executeStep, checkPause, waitDelay]);

  // ── Public API ─────────────────────────────────────────────────────

  const startReplay = useCallback((scenarioId) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const steps = scenario.stepIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);

    if (steps.length === 0) return;

    setReplayScenarioId(scenarioId);
    setReplaySteps(steps);
    setCurrentStepIndex(-1);
    runReplay(steps, includeLogin);
  }, [scenarios, actions, runReplay, includeLogin]);

  const pauseReplay = useCallback(() => {
    stateRef.current = 'paused';
    setReplayState('paused');
  }, []);

  const resumeReplay = useCallback(() => {
    stateRef.current = 'running';
    setReplayState('running');
    if (resumeRef.current) {
      resumeRef.current();
      resumeRef.current = null;
      pausePromiseRef.current = null;
    }
  }, []);

  const stopReplay = useCallback(() => {
    abortRef.current = true;
    stateRef.current = 'idle';
    setReplayState('idle');
    setCurrentStepIndex(-1);
    // Unblock any waiting promise
    if (resumeRef.current) {
      resumeRef.current();
      resumeRef.current = null;
    }
    if (resolveReplayResult.current) {
      resolveReplayResult.current({ status: 'failed', error: 'Replay stopped by user' });
      resolveReplayResult.current = null;
    }
    if (resolveNavigation.current) {
      resolveNavigation.current(null);
      resolveNavigation.current = null;
    }
    if (resolvePreloadReady.current) {
      resolvePreloadReady.current();
      resolvePreloadReady.current = null;
    }
  }, []);

  const stepForward = useCallback(async () => {
    if (replayState === 'idle' || replayState === 'done') return;
    if (replayState === 'paused') {
      // Execute just the next step, then pause again
      const nextIndex = currentStepIndex + 1;
      if (nextIndex >= replaySteps.length) {
        stateRef.current = 'done';
        setReplayState('done');
        return;
      }
      stateRef.current = 'running';
      setReplayState('running');
      await executeStep(replaySteps[nextIndex], nextIndex);
      stateRef.current = 'paused';
      setReplayState('paused');
    }
  }, [replayState, currentStepIndex, replaySteps, executeStep]);

  /** Start replay in step-by-step mode (pauses after login). */
  const startStepByStep = useCallback((scenarioId) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    const steps = scenario.stepIds
      .map(id => actions.find(a => a.id === id))
      .filter(Boolean);

    if (steps.length === 0) return;

    setReplayScenarioId(scenarioId);
    setReplaySteps(steps);
    setCurrentStepIndex(-1);
    setStepResults(steps.map(s => ({ stepId: s.id, status: 'pending' })));

    // Start in paused state at step 0, ready for stepForward
    stateRef.current = 'paused';
    setReplayState('paused');

    // Login first if enabled, then pause
    (async () => {
      if (includeLogin && activeProfile) {
        try {
          const baseUrl = getBaseUrl();
          const loginPath = activeProfile.loginPath || '/user/login';
          const loginUrl = baseUrl + (loginPath.startsWith('/') ? loginPath : '/' + loginPath);
          const navResult = await navigateAndWait(loginUrl);
          if (navResult) {
            await waitForPreload();
            await sendReplayAction('__login_user', {
              type: 'type',
              selector: activeProfile.usernameSelector || '#edit-name',
              value: 'admin',
            });
            await sendReplayAction('__login_pass', {
              type: 'type',
              selector: activeProfile.passwordSelector || '#edit-pass',
              value: 'admin',
            });
            await sendReplayAction('__login_submit', {
              type: 'click',
              selector: activeProfile.submitSelector || '#edit-submit',
            });
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (err) {
          console.warn('[Replay] Step-by-step login failed:', err.message);
        }
      }
    })();
  }, [scenarios, actions, activeProfile, includeLogin, getBaseUrl, navigateAndWait, sendReplayAction]);

  return {
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
  };
}
