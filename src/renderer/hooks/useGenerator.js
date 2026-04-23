import { useCallback, useMemo } from 'react';
import { generateSpecFile } from '../../generator/step-generator.js';

/**
 * Hook that generates .spec.js files from the recorder state.
 */
export function useGenerator({ featureName, featureDescription, scenarios, actions, variables, genOptions, activeProfile }) {

  /**
   * Slugify the feature name for file/folder naming.
   * "Manage Basic Pages" → "manage-basic-pages"
   */
  const slug = useMemo(() => {
    if (!featureName) return 'untitled-test';
    return featureName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }, [featureName]);

  /**
   * Build the scenario data structure needed by generators.
   */
  const buildScenarioData = useCallback(() => {
    return scenarios.map(scenario => {
      const steps = scenario.stepIds
        .map(id => actions.find(a => a.id === id))
        .filter(Boolean)
        .map(action => ({
          keyword: action.keyword,
          text: action.text,
          parentKeyword: action.parentKeyword,
          action: action.action,
          usesContentSelectors: action.action?.usesContentSelectors || false,
        }));

      return { name: scenario.name, steps };
    });
  }, [scenarios, actions]);

  /**
   * Generate the .spec.js file content (feature files are no longer used).
   */
  const generateFeature = useCallback(() => {
    return null;
  }, []);

  /**
   * Generate the .spec.js Playwright test file content.
   */
  const generateSteps = useCallback(() => {
    const scenarioData = buildScenarioData();
    return generateSpecFile({
      featureName: featureName || 'Untitled Test',
      baseUrl: activeProfile?.baseUrl || '',
      includeLogin: genOptions.includeLogin,
      useForceClick: genOptions.useForceClick,
      autoWaits: genOptions.autoWaits,
      importEditContent: genOptions.importEditContent,
      importDeleteContent: genOptions.importDeleteContent,
      importCloneContent: genOptions.importCloneContent,
      scenarios: scenarioData,
      variables,
    });
  }, [featureName, activeProfile, genOptions, variables, buildScenarioData]);

  /**
   * Export as ZIP via Electron IPC.
   */
  const exportZip = useCallback(async () => {
    const specContent = generateSteps();
    const result = await window.electronAPI.exportZip({
      featureName: slug,
      specContent,
      fixtures: [],
    });
    return result;
  }, [slug, generateSteps]);

  /**
   * Save the current session.
   */
  const saveSession = useCallback(async (sessionData) => {
    return await window.electronAPI.saveSession(sessionData);
  }, []);

  /**
   * Load a saved session.
   */
  const loadSession = useCallback(async () => {
    return await window.electronAPI.loadSession();
  }, []);

  return {
    slug,
    generateFeature,
    generateSteps,
    exportZip,
    saveSession,
    loadSession,
  };
}
