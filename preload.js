const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    getServers: () => ipcRenderer.invoke('get-servers'),
    getServerLogs: (id) => ipcRenderer.invoke('get-server-logs', id),
    createServer: (data) => ipcRenderer.invoke('create-server', data),
    startServer: (id) => ipcRenderer.invoke('start-server', id),
    stopServer: (id) => ipcRenderer.invoke('stop-server', id),
    sendCommand: (data) => ipcRenderer.invoke('send-command', data),
    openFolder: (id) => ipcRenderer.invoke('open-folder', id),
    deleteServer: (id) => ipcRenderer.invoke('delete-server', id),
    listFiles: (id, folder) => ipcRenderer.invoke('list-files', { id, folder }),
    getServerSettings: (id) => ipcRenderer.invoke('get-server-settings', id),
    saveServerSettings: (id, settings) => ipcRenderer.invoke('save-server-settings', { id, settings }),
    readServerFile: (id, path) => ipcRenderer.invoke('read-server-file', { id, path }),
    saveServerFile: (id, path, content) => ipcRenderer.invoke('save-server-file', { id, path, content }),
    listBackups: (id) => ipcRenderer.invoke('list-backups', id),
    createBackup: (id) => ipcRenderer.invoke('create-backup', id),
    restoreBackup: (id, fileName) => ipcRenderer.invoke('restore-backup', { id, fileName }),
    deleteBackup: (id, fileName) => ipcRenderer.invoke('delete-backup', { id, fileName }),
    onServerLog: (callback) => ipcRenderer.on('server-log', callback),
    onServerStats: (callback) => ipcRenderer.on('server-stats', (event, stats) => callback(stats)),
    onCreateStatus: (callback) => ipcRenderer.on('create-status', callback)
});
