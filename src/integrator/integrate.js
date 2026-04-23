/**
 * Integration module — analyzes a target directory, scaffolds a Playwright Test
 * project if needed, and places generated test files.
 */

import { TEMPLATES, applyPlaceholders } from './scaffold-templates.js';

/**
 * Analyze a target directory to determine what exists and what's needed.
 * Smart detection: if the folder already has playwright.config.js, treat it as
 * the tests dir directly; otherwise look for / plan to create a tests/ subdir.
 */
function analyzeTarget(targetDir, fs, path) {
  // Check if selected folder IS already a test setup (has playwright.config.js at root)
  const hasConfigAtRoot = fs.existsSync(path.join(targetDir, 'playwright.config.js'));
  const testsDir = hasConfigAtRoot
    ? targetDir
    : path.join(targetDir, 'tests');

  const hasPlaywrightConfig = fs.existsSync(path.join(testsDir, 'playwright.config.js'));
  const hasPackageJson = fs.existsSync(path.join(testsDir, 'package.json'));
  const hasTestsDir = fs.existsSync(path.join(testsDir, 'tests'));
  const hasHelpersDir = fs.existsSync(path.join(testsDir, 'tests', 'helpers'));
  const hasNodeModules = fs.existsSync(path.join(testsDir, 'node_modules', '@playwright'));

  return {
    testsDir,
    isExistingSetup: hasConfigAtRoot,
    isFullSetup: hasPlaywrightConfig && hasPackageJson && hasTestsDir && hasHelpersDir,
    hasPlaywrightConfig,
    hasPackageJson,
    hasTestsDir,
    hasHelpersDir,
    hasNodeModules,
    needsScaffold: !hasPlaywrightConfig || !hasTestsDir || !hasHelpersDir,
    needsInstall: !hasNodeModules,
    // Legacy compatibility aliases
    hasCypressConfig: hasPlaywrightConfig,
    hasE2eDir: hasTestsDir,
    hasSupportDir: hasHelpersDir,
  };
}

/**
 * Scaffold a full Playwright Test project from templates.
 * Skips any files that already exist (never overwrites).
 * @returns {Array<{path: string, status: 'created'|'skipped', reason?: string}>}
 */
function scaffoldProject(testsDir, placeholders, fs, path) {
  const results = [];

  for (const [relativePath, content] of Object.entries(TEMPLATES)) {
    const fullPath = path.join(testsDir, relativePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
      results.push({ path: relativePath, status: 'skipped', reason: 'already exists' });
      continue;
    }

    const finalContent = applyPlaceholders(content, placeholders);
    fs.writeFileSync(fullPath, finalContent, 'utf-8');
    results.push({ path: relativePath, status: 'created' });
  }

  // Ensure fixtures directory exists with a placeholder file
  const fixturesDir = path.join(testsDir, 'fixtures');
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }
  const exampleJson = path.join(fixturesDir, 'example.json');
  if (!fs.existsSync(exampleJson)) {
    fs.writeFileSync(exampleJson, JSON.stringify({ name: 'test fixture' }, null, 2), 'utf-8');
    results.push({ path: 'fixtures/example.json', status: 'created' });
  }

  return results;
}

/**
 * Place the generated test files into the project's tests/ directory.
 * Creates the .spec.js file directly in the tests folder.
 * @returns {Array<{path: string, status: 'created'|'overwritten'}>}
 */
function placeTestFiles(testsDir, featureName, featureContent, stepContent, fs, path) {
  const testDir = path.join(testsDir, 'tests');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  const results = [];

  // The stepContent (or featureContent) is the full .spec.js content
  const specContent = stepContent || featureContent;
  const specPath = path.join(testDir, featureName + '.spec.js');
  const specExists = fs.existsSync(specPath);
  fs.writeFileSync(specPath, specContent, 'utf-8');
  results.push({
    path: 'tests/' + featureName + '.spec.js',
    status: specExists ? 'overwritten' : 'created',
  });

  return results;
}

export { analyzeTarget, scaffoldProject, placeTestFiles };
