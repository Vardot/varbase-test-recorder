const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveSession: (sessionData) => ipcRenderer.invoke('save-session', sessionData),
  loadSession: () => ipcRenderer.invoke('load-session'),
  exportZip: (data) => ipcRenderer.invoke('export-zip', data),
  getRecorderPreloadPath: () => ipcRenderer.invoke('get-recorder-preload-path'),
  // Integration agent
  selectProjectDir: () => ipcRenderer.invoke('select-project-dir'),
  analyzeProject: (dir) => ipcRenderer.invoke('analyze-project', dir),
  integrateTest: (data) => ipcRenderer.invoke('integrate-test', data),
});
