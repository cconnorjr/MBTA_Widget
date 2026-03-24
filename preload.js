const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  minimize:    () => ipcRenderer.send('win-minimize'),
  close:       () => ipcRenderer.send('win-close'),
  toggleTop:   () => ipcRenderer.send('win-toggle-top'),
  onTopState:  (cb) => ipcRenderer.on('top-state', (_e, val) => cb(val)),
  logDelay:    (entry) => ipcRenderer.send('log-delay', entry),
});
