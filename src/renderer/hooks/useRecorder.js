import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { autoAssignKeyword, needsAutoWait, ACTION_TYPES } from '../../shared/action-types.js';
import { detectPageContext, detectCrudFlow } from '../../shared/drupal-patterns.js';

/**
 * Default site profile for new sites.
 */
const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Default Site',
  baseUrl: 'https://example.ddev.site',
  loginPath: '/user/login',
  usernameSelector: '#edit-name',
  passwordSelector: '#edit-pass',
  submitSelector: '#edit-submit',
};

/**
 * Core recording hook.
 * Manages: recording state, captured actions, scenarios, variables, site profiles.
 */
export function useRecorder() {
  // ── Recording state ──────────────────────────────────────────────────
  const [recordingState, setRecordingState] = useState('idle'); // idle | recording | paused
  const [actions, setActions] = useState([]);
  const webviewRef = useRef(null);

  // ── Feature & scenarios ──────────────────────────────────────────────
  const [featureName, setFeatureName] = useState('');
  const [featureDescription, setFeatureDescription] = useState('');
  const [scenarios, setScenarios] = useState([
    { id: uuidv4(), name: 'New Scenario', stepIds: [] },
  ]);
  const [activeScenarioId, setActiveScenarioId] = useState(null);

  // ── Variables (dynamic value tracking) ───────────────────────────────
  const [variables, setVariables] = useState([]);

  // ── Site profiles ────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState(() => {
    try {
      const saved = localStorage.getItem('vtr-profiles');
      return saved ? JSON.parse(saved) : [DEFAULT_PROFILE];
    } catch { return [DEFAULT_PROFILE]; }
  });
  const [activeProfileId, setActiveProfileId] = useState(() => {
    try {
      return localStorage.getItem('vtr-active-profile') || 'default';
    } catch { return 'default'; }
  });

  // ── Generation options ───────────────────────────────────────────────
  const [genOptions, setGenOptions] = useState({
    includeLogin: true,
    includeUncaughtHandler: true,
    useForceClick: true,
    autoWaits: true,
    importEditContent: false,
    importDeleteContent: false,
    importCloneContent: false,
  });

  // ── Derived values ───────────────────────────────────────────────────
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];

  // ── Recording controls ───────────────────────────────────────────────

  const startRecording = useCallback(() => {
    setRecordingState('recording');
    if (webviewRef.current) {
      webviewRef.current.send('set-recording', true);
    }
  }, []);

  const pauseRecording = useCallback(() => {
    setRecordingState('paused');
    if (webviewRef.current) {
      webviewRef.current.send('set-recording', false);
    }
  }, []);

  const stopRecording = useCallback(() => {
    setRecordingState('idle');
    if (webviewRef.current) {
      webviewRef.current.send('set-recording', false);
    }
  }, []);

  const clearRecording = useCallback(() => {
    setActions([]);
    setVariables([]);
    setScenarios([{ id: uuidv4(), name: 'New Scenario', stepIds: [] }]);
    setActiveScenarioId(null);
  }, []);

  // ── Action handling ──────────────────────────────────────────────────

  const addAction = useCallback((rawAction) => {
    // ── Skip login page actions entirely — Background step handles login ──
    if (rawAction.url) {
      try {
        const pathname = new URL(rawAction.url).pathname;
        if (pathname.match(/\/user\/login/)) return;
      } catch {
        if (rawAction.url.includes('/user/login')) return;
      }
    }

    // ── Skip post-login redirects (e.g. /admin/dashboard after login) ──
    if (rawAction.type === 'navigate') {
      try {
        const pathname = new URL(rawAction.url).pathname;
        if (pathname.match(/\/admin\/dashboard/) || pathname.match(/\/admin$/)) {
          // Check if the immediately previous action was also a navigate to login or from login
          // Just skip common post-login landing pages
          return;
        }
      } catch {}
    }

    const action = {
      ...rawAction,
      id: rawAction.id || uuidv4(),
      keyword: 'When',
      text: rawAction.description || '',
      parentKeyword: 'When',
      action: rawAction,
      timestamp: Date.now(),
    };

    // Auto-assign keyword
    setActions(prev => {
      // ── Same-field TYPE replacement ────────────────────────────────
      // If this is a type/select action and the same selector already has a
      // recorded action, REPLACE it with the new one (user corrected/retyped)
      if ((rawAction.type === 'type' || rawAction.type === 'type_ckeditor') && rawAction.selector) {
        const existingIdx = prev.findIndex(a =>
          (a.action?.type === 'type' || a.action?.type === 'type_ckeditor') &&
          a.action?.selector === rawAction.selector
        );
        if (existingIdx >= 0) {
          // Replace the existing action's value with the new (final) value
          const updated = [...prev];
          const existing = updated[existingIdx];
          updated[existingIdx] = {
            ...existing,
            text: rawAction.description || existing.text,
            action: { ...existing.action, value: rawAction.value, description: rawAction.description },
          };
          return updated;
        }
      }

      // ── Same-field SELECT replacement ──────────────────────────────
      if (rawAction.type === 'select' && rawAction.selector) {
        const existingIdx = prev.findIndex(a =>
          a.action?.type === 'select' && a.action?.selector === rawAction.selector
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          const existing = updated[existingIdx];
          updated[existingIdx] = {
            ...existing,
            text: rawAction.description || existing.text,
            action: { ...existing.action, value: rawAction.value, selectedText: rawAction.selectedText, description: rawAction.description },
          };
          return updated;
        }
      }

      // ── Normal add ─────────────────────────────────────────────────
      const newActions = [...prev, action];
      const idx = newActions.length - 1;
      action.keyword = autoAssignKeyword(rawAction, idx, newActions.length);
      if (action.keyword === 'And') {
        for (let i = idx - 1; i >= 0; i--) {
          if (newActions[i].keyword !== 'And') {
            action.parentKeyword = newActions[i].keyword;
            break;
          }
        }
      }
      return newActions;
    });

    // Auto-add to active scenario (only for new actions, not replacements)
    if ((rawAction.type === 'type' || rawAction.type === 'type_ckeditor' || rawAction.type === 'select') && rawAction.selector) {
      // Check if we already have this in the scenario (it was a replacement)
      setScenarios(prev => {
        const targetId = activeScenarioId || prev[prev.length - 1]?.id;
        return prev.map(s => {
          if (s.id !== targetId) return s;
          // Only add if not already present
          if (s.stepIds.includes(action.id)) return s;
          // For replacements, the old action ID is already there — no need to add
          // Check if any step in this scenario has the same selector
          return s;
        });
      });

      // For type/select replacements, the ID doesn't change so scenario is fine
      // But for genuinely new type/select, we need to add
      setActions(prev => {
        const isAlreadyTracked = prev.some(a =>
          a.id !== action.id &&
          a.action?.type === rawAction.type &&
          a.action?.selector === rawAction.selector
        );
        if (!isAlreadyTracked) {
          // It's genuinely new — add to scenario
          setTimeout(() => {
            setScenarios(p => {
              const targetId = activeScenarioId || p[p.length - 1]?.id;
              return p.map(s =>
                s.id === targetId && !s.stepIds.includes(action.id)
                  ? { ...s, stepIds: [...s.stepIds, action.id] }
                  : s
              );
            });
          }, 0);
        }
        return prev; // Don't modify actions — already handled above
      });
    } else {
      // Non-type/select actions — always add to scenario
      setScenarios(prev => {
        const targetId = activeScenarioId || prev[prev.length - 1]?.id;
        return prev.map(s =>
          s.id === targetId ? { ...s, stepIds: [...s.stepIds, action.id] } : s
        );
      });
    }

    // Auto-detect dynamic values (node URLs)
    const ctx = detectPageContext(rawAction.url);
    if (rawAction.type === 'navigate' && (ctx.context === 'node_view' || ctx.context === 'node_layout')) {
      setVariables(prev => {
        const varData = {
          id: uuidv4(),
          name: 'lastPageUrlforsaved',
          sourceActionId: action.id,
          type: 'url',
          value: rawAction.url,
          nodeId: ctx.nodeId,
        };
        const existing = prev.findIndex(v => v.name === varData.name);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = varData;
          return updated;
        }
        return [...prev, varData];
      });
    }
  }, [activeScenarioId]);

  const removeAction = useCallback((actionId) => {
    setActions(prev => prev.filter(a => a.id !== actionId));
    setScenarios(prev => prev.map(s => ({
      ...s,
      stepIds: s.stepIds.filter(id => id !== actionId),
    })));
  }, []);

  const updateAction = useCallback((actionId, updates) => {
    setActions(prev => prev.map(a =>
      a.id === actionId ? { ...a, ...updates, action: { ...a.action, ...updates.action } } : a
    ));
  }, []);

  const reorderActions = useCallback((scenarioId, fromIndex, toIndex) => {
    setScenarios(prev => prev.map(s => {
      if (s.id !== scenarioId) return s;
      const ids = [...s.stepIds];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      return { ...s, stepIds: ids };
    }));
  }, []);

  const moveActionToScenario = useCallback((actionId, fromScenarioId, toScenarioId) => {
    setScenarios(prev => prev.map(s => {
      if (s.id === fromScenarioId) {
        return { ...s, stepIds: s.stepIds.filter(id => id !== actionId) };
      }
      if (s.id === toScenarioId) {
        return { ...s, stepIds: [...s.stepIds, actionId] };
      }
      return s;
    }));
  }, []);

  // ── Navigation event handler ─────────────────────────────────────────

  const handleNavigation = useCallback((url) => {
    if (recordingState !== 'recording') return;
    const ctx = detectPageContext(url);

    // Skip login page navigations (handled by Background)
    if (ctx.context === 'user_login') return;

    // Skip post-login dashboard redirects
    try {
      const pathname = new URL(url).pathname;
      if (pathname.match(/\/admin\/dashboard/) || pathname.match(/\/admin$/)) return;
    } catch {}

    // Check if the last recorded action was a click that triggered this navigation.
    // If so, skip the navigate event — the click already captured the user intent.
    setActions(prev => {
      if (prev.length > 0) {
        const lastAction = prev[prev.length - 1];
        const timeSinceLast = Date.now() - (lastAction.timestamp || 0);
        // If the last action was a click within 2 seconds, this navigation is likely its result
        if (lastAction.action?.type === 'click' && timeSinceLast < 2000) {
          // BUT still capture the URL if this is a node page (for CRUD tracking)
          if (ctx.context === 'node_view' || ctx.context === 'node_layout') {
            setTimeout(() => {
              setVariables(prev2 => {
                const varData = {
                  id: uuidv4(),
                  name: 'lastPageUrlforsaved',
                  sourceActionId: lastAction.id,
                  type: 'url',
                  value: url,
                  nodeId: ctx.nodeId,
                };
                const existing = prev2.findIndex(v => v.name === varData.name);
                if (existing >= 0) {
                  const updated = [...prev2];
                  updated[existing] = varData;
                  return updated;
                }
                return [...prev2, varData];
              });
            }, 0);
          }
          return prev; // Skip the navigate action itself
        }
      }
      // No recent click — this is a direct navigation (typed URL, redirect, etc.)
      // Build the action inline instead of calling addAction to avoid recursion
      const relativePath = (() => {
        try { return new URL(url).pathname; } catch { return url; }
      })();

      const action = {
        id: uuidv4(),
        type: 'navigate',
        url,
        relativePath,
        description: `I navigate to ${relativePath}`,
        pageContext: ctx,
        keyword: 'When',
        text: `I navigate to ${relativePath}`,
        parentKeyword: 'When',
        timestamp: Date.now(),
      };
      action.action = { type: 'navigate', url, relativePath };

      // Also auto-add to active scenario
      setTimeout(() => {
        setScenarios(p => {
          const targetId = activeScenarioId || p[p.length - 1]?.id;
          return p.map(s =>
            s.id === targetId ? { ...s, stepIds: [...s.stepIds, action.id] } : s
          );
        });

        // Auto-capture URL if this looks like a node was just created
        if (ctx.context === 'node_view' || ctx.context === 'node_layout') {
          setVariables(prev => {
            const varData = {
              id: uuidv4(),
              name: 'lastPageUrlforsaved',
              sourceActionId: action.id,
              type: 'url',
              value: url,
            };
            const existing = prev.findIndex(v => v.name === varData.name);
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = varData;
              return updated;
            }
            return [...prev, varData];
          });
        }
      }, 0);

      return [...prev, action];
    });
  }, [recordingState, activeScenarioId]);

  // ── Scenario management ──────────────────────────────────────────────

  const addScenario = useCallback((name = 'New Scenario') => {
    const scenario = { id: uuidv4(), name, stepIds: [] };
    setScenarios(prev => [...prev, scenario]);
    setActiveScenarioId(scenario.id);
    return scenario.id;
  }, []);

  const removeScenario = useCallback((scenarioId) => {
    setScenarios(prev => {
      const updated = prev.filter(s => s.id !== scenarioId);
      return updated.length === 0
        ? [{ id: uuidv4(), name: 'New Scenario', stepIds: [] }]
        : updated;
    });
  }, []);

  const updateScenario = useCallback((scenarioId, updates) => {
    setScenarios(prev => prev.map(s =>
      s.id === scenarioId ? { ...s, ...updates } : s
    ));
  }, []);

  // ── Variable management ──────────────────────────────────────────────

  const addVariable = useCallback((variable) => {
    setVariables(prev => {
      // Replace if same name exists
      const existing = prev.findIndex(v => v.name === variable.name);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = variable;
        return updated;
      }
      return [...prev, variable];
    });
  }, []);

  const removeVariable = useCallback((variableId) => {
    setVariables(prev => prev.filter(v => v.id !== variableId));
  }, []);

  // ── Profile management ───────────────────────────────────────────────

  const saveProfiles = useCallback((newProfiles) => {
    setProfiles(newProfiles);
    try { localStorage.setItem('vtr-profiles', JSON.stringify(newProfiles)); } catch {}
  }, []);

  const addProfile = useCallback((profile) => {
    const newProfile = { ...DEFAULT_PROFILE, ...profile, id: uuidv4() };
    saveProfiles([...profiles, newProfile]);
    return newProfile.id;
  }, [profiles, saveProfiles]);

  const updateProfile = useCallback((profileId, updates) => {
    saveProfiles(profiles.map(p => p.id === profileId ? { ...p, ...updates } : p));
  }, [profiles, saveProfiles]);

  const removeProfile = useCallback((profileId) => {
    if (profiles.length <= 1) return;
    const updated = profiles.filter(p => p.id !== profileId);
    saveProfiles(updated);
    if (activeProfileId === profileId) {
      setActiveProfileId(updated[0].id);
    }
  }, [profiles, activeProfileId, saveProfiles]);

  const switchProfile = useCallback((profileId) => {
    setActiveProfileId(profileId);
    try { localStorage.setItem('vtr-active-profile', profileId); } catch {}
  }, []);

  // ── Session save/load ────────────────────────────────────────────────

  const getSessionData = useCallback(() => ({
    featureName,
    featureDescription,
    actions,
    scenarios,
    variables,
    genOptions,
    activeProfileId,
    profiles,
    timestamp: Date.now(),
  }), [featureName, featureDescription, actions, scenarios, variables, genOptions, activeProfileId, profiles]);

  const loadSessionData = useCallback((data) => {
    if (data.featureName) setFeatureName(data.featureName);
    if (data.featureDescription) setFeatureDescription(data.featureDescription);
    if (data.actions) setActions(data.actions);
    if (data.scenarios) setScenarios(data.scenarios);
    if (data.variables) setVariables(data.variables);
    if (data.genOptions) setGenOptions(data.genOptions);
    if (data.profiles) saveProfiles(data.profiles);
    if (data.activeProfileId) switchProfile(data.activeProfileId);
  }, [saveProfiles, switchProfile]);

  // ── Add assertion step (manual) ──────────────────────────────────────

  const addAssertionStep = useCallback((assertion) => {
    const action = {
      id: uuidv4(),
      type: assertion.type,
      selector: assertion.selector || '',
      expectedText: assertion.expectedText || '',
      messageType: assertion.messageType || '',
      variableName: assertion.variableName || '',
      description: assertion.description || '',
    };
    addAction({
      ...action,
      description: assertion.description,
    });
  }, [addAction]);

  // ── CRUD flow detection ──────────────────────────────────────────────

  const runCrudDetection = useCallback(() => {
    const annotations = detectCrudFlow(actions.map(a => a.action));
    const updates = [];
    for (const ann of annotations) {
      const action = actions[ann.index];
      if (!action) continue;

      if (ann.type === 'capture_url' || ann.type === 'capture_url_after_assert') {
        addVariable({
          id: uuidv4(),
          name: ann.variableName,
          sourceActionId: action.id,
          type: 'url',
          reason: ann.reason,
        });
      }
      updates.push({ actionId: action.id, annotation: ann });
    }
    return updates;
  }, [actions, addVariable]);

  return {
    // Recording
    recordingState, startRecording, pauseRecording, stopRecording, clearRecording,
    webviewRef,
    // Actions
    actions, addAction, removeAction, updateAction, reorderActions, moveActionToScenario,
    // Navigation
    handleNavigation,
    // Feature
    featureName, setFeatureName, featureDescription, setFeatureDescription,
    // Scenarios
    scenarios, activeScenarioId, setActiveScenarioId,
    addScenario, removeScenario, updateScenario,
    // Variables
    variables, addVariable, removeVariable,
    // Assertions
    addAssertionStep,
    // CRUD detection
    runCrudDetection,
    // Profiles
    profiles, activeProfile, activeProfileId,
    addProfile, updateProfile, removeProfile, switchProfile,
    // Options
    genOptions, setGenOptions,
    // Session
    getSessionData, loadSessionData,
  };
}
