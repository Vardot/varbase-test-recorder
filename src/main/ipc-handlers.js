import { ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import { Writable } from 'stream';

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
}

export { registerIpcHandlers };
