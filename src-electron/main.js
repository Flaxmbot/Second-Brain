const { app, Tray, Menu, nativeImage, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

const { startServer } = require('./server.js');
const { initDatabase, closeDatabase } = require('./db.js');

// Global references
let tray = null;
let apiToken = null;

// Generate a secure API token on first launch
function generateApiToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 32; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Load or create API token
function loadApiToken() {
    const fs = require('fs');
    const tokenPath = path.join(app.getPath('userData'), 'api_token.txt');

    if (fs.existsSync(tokenPath)) {
        apiToken = fs.readFileSync(tokenPath, 'utf8').trim();
    } else {
        apiToken = generateApiToken();
        fs.writeFileSync(tokenPath, apiToken);
    }

    return apiToken;
}



function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    const fs = require('fs');

    if (fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
    } else {
        tray = new Tray(nativeImage.createFromDataURL(
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAADfSURBVDiNpZMxDoJAEEXfLhQ2NhYWNpYewMbCyt7SxsrG0t7S0s7S0t7S0s7S0sbSwsLSBhBIvJAsFnbBJDPJJDP/3+zMMBestUYppZBS1gDlvu8TAL7v+wCAiJBS1kSE1lou+76fAMBut1sCsN1ul0SEw+GwAeDj4/0C8Pb29grg5eXlCuD5+fkK4OHh4Qrg4eHhCuDm5uYK4Orq6grg8vLyCuDs7OwK4PT09Arg5OTkCuD4+PgK4ODg4Arg4ODgCuDg4OAK4ODg4Arg4ODgCuDg4OAK4ODg4Arg4ODgCuDg4OAK4ODg4Arg4ODgCuDg4P8HAKyW97wYfnvfAAAAAElFTkSuQmCC'
        ));
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Status: Running',
            enabled: false
        },
        {
            label: 'Copy API Token',
            click: () => {
                clipboard.writeText(apiToken);
            }
        },
        { type: 'separator' },
        {
            label: 'Quit',
            click: () => {
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Internet Memory');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        clipboard.writeText(apiToken);
    });

    console.log('[Internet Memory] System tray created');
}

function setupAutostart() {
    app.setLoginItemSettings({
        openAtLogin: false,
        path: app.getPath('exe'),
        args: ['--autostart']
    });
    console.log('[Internet Memory] Autostart configured');
}

// IPC Handlers
function setupIpcHandlers() {
    ipcMain.handle('getApiToken', () => {
        return apiToken;
    });

    ipcMain.handle('quitApp', () => {
        app.quit();
    });

    ipcMain.handle('getAppVersion', () => {
        return app.getVersion();
    });

    ipcMain.handle('setAutostart', (event, enabled) => {
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: app.getPath('exe'),
            args: ['--autostart']
        });
        return app.getLoginItemSettings().openAtLogin;
    });

    ipcMain.handle('getAutostart', () => {
        return app.getLoginItemSettings().openAtLogin;
    });
}

// App lifecycle
app.whenReady().then(async () => {
    console.log('[Internet Memory] Starting application...');

    // Load API token
    loadApiToken();
    console.log('[Internet Memory] API Token loaded');

    // Initialize database
    await initDatabase();
    console.log('[Internet Memory] Database initialized');

    // Start Express server
    startServer(apiToken);
    console.log('[Internet Memory] Express server started on port 11435');

    // Create system tray
    createTray();

    // Setup autostart
    setupAutostart();

    // Setup IPC handlers
    setupIpcHandlers();
});

app.on('window-all-closed', () => {
    // Don't quit on window close - keep running in tray
});

app.on('before-quit', () => {
    console.log('[Internet Memory] Application quitting...');
    closeDatabase();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('[Internet Memory] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Internet Memory] Unhandled rejection at:', promise, 'reason:', reason);
});
