import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { execSync } from 'child_process';
import { analyzeTarget, scaffoldProject, placeTestFiles } from '../integrator/integrate.js';

// Handle Squirrel installer events on Windows (production only)
try { if (require('electron-squirrel-startup')) app.quit(); } catch (_) {}

// ── IPC Handlers (inlined to avoid Vite bundling issues) ──

function registerIpcHandlers() {
  // Save session JSON to disk
  ipcMain.handle('save-session', async (_event, sessionJson) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Recording Session',
      defaultPath: 'recording-session.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, JSON.stringify(sessionJson, null, 2), 'utf-8');
    return filePath;
  });

  // Load session JSON from disk
  ipcMain.handle('load-session', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Recording Session',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;
    const raw = fs.readFileSync(filePaths[0], 'utf-8');
    return JSON.parse(raw);
  });

  // Export as ZIP — returns buffer to renderer for download
  ipcMain.handle('export-zip', async (_event, { featureName, specContent, featureContent, stepContent, fixtures }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Test Files',
      defaultPath: `${featureName}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return null;

    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve(filePath));
      archive.on('error', (err) => reject(err));

      archive.pipe(output);

      if (specContent) {
        // Playwright mode: single .spec.js file
        archive.append(specContent, { name: `${featureName}.spec.js` });
      } else {
        // Legacy Cypress+Cucumber: .feature + step definition
        archive.append(featureContent, { name: `${featureName}.feature` });
        archive.append(stepContent, { name: `${featureName}/${featureName}.js` });
      }

      // Add fixture files if any
      if (fixtures && fixtures.length > 0) {
        for (const fix of fixtures) {
          if (fix.buffer && fix.name) {
            archive.append(Buffer.from(fix.buffer), {
              name: `fixtures/${fix.name}`,
            });
          }
        }
      }

      archive.finalize();
    });
  });
  // ── Integration Agent handlers ──

  // Select a project directory via native folder picker
  ipcMain.handle('select-project-dir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Project Directory',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0];
  });

  // Analyze the target directory
  ipcMain.handle('analyze-project', (_event, targetDir) => {
    return analyzeTarget(targetDir, fs, path);
  });

  // Scaffold + place test files into the target project
  ipcMain.handle('integrate-test', async (_event, data) => {
    const { targetDir, featureName, featureContent, stepContent, placeholders, runInstall } = data;
    const analysis = analyzeTarget(targetDir, fs, path);
    const results = { scaffold: [], testFiles: [], install: null };

    // Scaffold if needed
    if (analysis.needsScaffold) {
      results.scaffold = scaffoldProject(analysis.testsDir, placeholders || {}, fs, path);
    }

    // Place test files
    results.testFiles = placeTestFiles(analysis.testsDir, featureName, featureContent, stepContent, fs, path);

    // Optionally run npm install
    if (runInstall) {
      try {
        execSync('npm install', { cwd: analysis.testsDir, timeout: 120000, stdio: 'pipe' });
        results.install = { status: 'success' };
      } catch (err) {
        results.install = { status: 'error', message: err.message };
      }
    }

    results.testsDir = analysis.testsDir;
    return results;
  });
}

let mainWindow;

// Resolve the webview recorder preload path (absolute filesystem path)
// All preloads are built into the same .vite/build/ directory as main
const recorderPreloadPath = path.join(__dirname, 'recorder-preload.js');

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1200,
    minHeight: 700,
    title: 'Varbase Test Recorder',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  // Allow webview to load any site
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    delete headers['x-frame-options'];
    delete headers['X-Frame-Options'];
    // Relax CSP for the webview target pages
    delete headers['content-security-policy'];
    delete headers['Content-Security-Policy'];
    callback({ responseHeaders: headers });
  });

  // Load the renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open DevTools in dev mode to debug renderer issues
  mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
  registerIpcHandlers();

  // Serve the recorder preload path to the renderer
  ipcMain.handle('get-recorder-preload-path', () => recorderPreloadPath);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
