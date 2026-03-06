const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    },
    titleBarStyle: 'hidden', // Modern look
    icon: path.join(__dirname, 'icone.png'),
    titleBarOverlay: {
      color: '#1e1e2e',
      symbolColor: '#cdd6f4'
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  // Prevent immediate quit to allow cleanup
  event.preventDefault();
  await serverManager.stopAllServers();
  app.exit(); // Force exit after cleanup
});

const serverManager = require('./src/serverManager');

// Start stats polling
serverManager.startStatsPolling((stats) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-stats', stats);
  }
});

// IPC Handlers
ipcMain.handle('get-servers', () => {
  return serverManager.getServers();
});

ipcMain.handle('create-server', async (event, { name, loader, version, settings }) => {
  return await serverManager.createServer(name, loader, version, settings, (text) => {
    event.sender.send('create-status', text);
  });
});

// Start a server and broadcast logs
ipcMain.handle('start-server', async (event, id) => {
  try {
    await serverManager.startServer(id, (serverId, log) => {
      // Send logs individually back to all windows (broadcasting)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-log', { id: serverId, log });
      }
    });
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
});

// Stop a server
ipcMain.handle('stop-server', (event, id) => {
  serverManager.stopServer(id);
});

// Get existing logs for a server
ipcMain.handle('get-server-logs', (event, id) => {
  return serverManager.getServerLogs(id);
});

// Send a console command
ipcMain.handle('send-command', (event, { id, command }) => {
  serverManager.sendCommand(id, command);
});

// Open folder
ipcMain.handle('open-folder', (event, id) => {
  const server = serverManager.getServer(id);
  if (server) {
    shell.showItemInFolder(server.path);
  }
});

// File explorer
ipcMain.handle('list-files', async (event, { id, folder }) => {
  return await serverManager.listFiles(id, folder);
});

// Settings management
ipcMain.handle('get-server-settings', async (event, id) => {
  return await serverManager.getServerSettings(id);
});

ipcMain.handle('save-server-settings', async (event, { id, settings }) => {
  return await serverManager.saveServerSettings(id, settings);
});

// Raw file editing
ipcMain.handle('read-server-file', async (event, { id, path }) => {
  return await serverManager.readFile(id, path);
});

ipcMain.handle('save-server-file', async (event, { id, path, content }) => {
  return await serverManager.saveFile(id, path, content);
});

// Delete server
ipcMain.handle('delete-server', async (event, id) => {
  await serverManager.deleteServer(id);
});

// Backup management
ipcMain.handle('list-backups', async (event, id) => {
  return serverManager.listBackups(id);
});

ipcMain.handle('create-backup', async (event, id) => {
  return await serverManager.createBackup(id);
});

ipcMain.handle('restore-backup', async (event, { id, fileName }) => {
  return await serverManager.restoreBackup(id, fileName);
});

ipcMain.handle('delete-backup', async (event, { id, fileName }) => {
  return serverManager.deleteBackup(id, fileName);
});
