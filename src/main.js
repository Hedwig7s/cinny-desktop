'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  shell,
  clipboard,
  globalShortcut,
  Notification,
  ipcMain,
  dialog,
  nativeTheme,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { autoUpdater } = require('electron-updater');
const windowStateKeeper = require('electron-window-state');

// ─── Constants ───────────────────────────────────────────────────────────────

const PORT = 44548;
const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;
const DIST_PATH = IS_DEV
  ? null // dev uses devUrl directly
  : path.join(__dirname, '..', 'cinny', 'dist');
const DEV_URL = 'http://localhost:8080';

// ─── SharedArrayBuffer / crossOriginIsolated ─────────────────────────────────
// Must be done before the app is ready.
// Electron ≥ 22: use the session header override (see injectCOIHeaders).
// The flag below is an additional safety net for older Chromium builds.
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

// ─── Static file server (production only) ────────────────────────────────────

function createStaticServer() {
  if (IS_DEV) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const mimeTypes = {
      '.html': 'text/html',
      '.js':   'application/javascript',
      '.mjs':  'application/javascript',
      '.css':  'text/css',
      '.json': 'application/json',
      '.png':  'image/png',
      '.jpg':  'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif':  'image/gif',
      '.svg':  'image/svg+xml',
      '.ico':  'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf':  'font/ttf',
      '.webp': 'image/webp',
      '.wasm': 'application/wasm',
    };

    const server = http.createServer((req, res) => {
      // Inject COOP/COEP for SharedArrayBuffer support
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

      let urlPath = req.url.split('?')[0];

      // Serve index.html for SPA routes (anything without a file extension)
      const hasExtension = path.extname(urlPath) !== '';
      const filePath = hasExtension
        ? path.join(DIST_PATH, urlPath)
        : path.join(DIST_PATH, 'index.html');

      fs.readFile(filePath, (err, data) => {
        if (err) {
          // Fallback to index.html for unknown paths (SPA routing)
          fs.readFile(path.join(DIST_PATH, 'index.html'), (err2, fallback) => {
            if (err2) {
              res.writeHead(404);
              res.end('Not Found');
              return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fallback);
          });
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(PORT, '127.0.0.1', () => {
      console.log(`Static server running on http://localhost:${PORT}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

// ─── COOP/COEP header injection for dev URL ───────────────────────────────────
// In dev mode the frontend is served by Vite/webpack, so we intercept
// its responses and inject the isolation headers.

function injectCOIHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy':   ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
        'Cross-Origin-Resource-Policy': ['cross-origin'],
      },
    });
  });
}

// ─── Menu (macOS) ─────────────────────────────────────────────────────────────

function buildMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const template = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),

    // Edit
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },

    // View
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },

    // Window
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { role: 'zoom' },
        ] : [
          { role: 'close' },
        ]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Window creation ──────────────────────────────────────────────────────────

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
  });

  const mainWindow = new BrowserWindow({
    x:      mainWindowState.x,
    y:      mainWindowState.y,
    width:  mainWindowState.width,
    height: mainWindowState.height,
    title:  'Cinny',
    icon:   path.join(__dirname, '..', 'icons', 'icon.png'),
    webPreferences: {
      preload:              path.join(__dirname, 'preload.js'),
      contextIsolation:     true,
      nodeIntegration:      false,
      // Required for SharedArrayBuffer
      sandbox:              false,
    },
  });

  mainWindowState.manage(mainWindow);

  // Build menu
  buildMenu(mainWindow);

  // Open external links in the OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`) && !url.startsWith(DEV_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Load the app
  const appUrl = IS_DEV ? DEV_URL : `http://localhost:${PORT}`;
  mainWindow.loadURL(appUrl);

  return mainWindow;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  // ── Clipboard ──
  ipcMain.handle('clipboard:read-text',  ()          => clipboard.readText());
  ipcMain.handle('clipboard:write-text', (_, text)   => { clipboard.writeText(text); });

  // ── Notifications ──
  ipcMain.handle('notification:send', (_, { title, body, icon }) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon }).show();
    }
  });

  // ── Dialog ──
  ipcMain.handle('dialog:open',    (e, opts)  => dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), opts));
  ipcMain.handle('dialog:save',    (e, opts)  => dialog.showSaveDialog(BrowserWindow.fromWebContents(e.sender), opts));
  ipcMain.handle('dialog:message', (e, opts)  => dialog.showMessageBox(BrowserWindow.fromWebContents(e.sender), opts));

  // ── File system ──
  ipcMain.handle('fs:read-file',  (_, filePath, opts) => fs.promises.readFile(filePath, opts ?? 'utf8'));
  ipcMain.handle('fs:write-file', (_, filePath, data) => fs.promises.writeFile(filePath, data));
  ipcMain.handle('fs:read-dir',   (_, dirPath)        => fs.promises.readdir(dirPath, { withFileTypes: true })
    .then(entries => entries.map(e => ({ name: e.name, isDirectory: e.isDirectory() }))));
  ipcMain.handle('fs:copy-file',  (_, src, dest)      => fs.promises.copyFile(src, dest));
  ipcMain.handle('fs:mkdir',      (_, dirPath, opts)  => fs.promises.mkdir(dirPath, { recursive: true, ...opts }));
  ipcMain.handle('fs:remove',     (_, target)         => fs.promises.rm(target, { recursive: true, force: true }));
  ipcMain.handle('fs:rename',     (_, oldPath, newPath) => fs.promises.rename(oldPath, newPath));
  ipcMain.handle('fs:exists',     (_, target)         => fs.promises.access(target).then(() => true).catch(() => false));

  // ── OS info ──
  const os = require('os');
  ipcMain.handle('os:platform',   () => process.platform);
  ipcMain.handle('os:version',    () => process.getSystemVersion?.() ?? os.release());
  ipcMain.handle('os:arch',       () => process.arch);
  ipcMain.handle('os:hostname',   () => os.hostname());
  ipcMain.handle('os:locale',     () => app.getLocale());

  // ── Process ──
  ipcMain.handle('process:restart', () => { app.relaunch(); app.exit(0); });
  ipcMain.handle('process:exit',    (_, code = 0) => app.exit(code));

  // ── Shell ──
  ipcMain.handle('shell:open', (_, url) => shell.openExternal(url));

  // ── App ──
  ipcMain.handle('app:hide', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.hide();
  });
  ipcMain.handle('app:show', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) win.show();
  });

  // ── Window controls ──
  ipcMain.handle('window:minimize',    (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle('window:maximize',    (e) => BrowserWindow.fromWebContents(e.sender)?.maximize());
  ipcMain.handle('window:unmaximize',  (e) => BrowserWindow.fromWebContents(e.sender)?.unmaximize());
  ipcMain.handle('window:close',       (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  ipcMain.handle('window:is-maximized',(e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);
  ipcMain.handle('window:set-title',   (e, title) => BrowserWindow.fromWebContents(e.sender)?.setTitle(title));
  ipcMain.handle('window:set-fullscreen', (e, flag) => BrowserWindow.fromWebContents(e.sender)?.setFullScreen(flag));

  // ── Global shortcut ──
  ipcMain.handle('global-shortcut:register', (_, accelerator) => {
    return globalShortcut.register(accelerator, () => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('global-shortcut:triggered', accelerator);
    });
  });
  ipcMain.handle('global-shortcut:unregister',     (_, accelerator) => globalShortcut.unregister(accelerator));
  ipcMain.handle('global-shortcut:is-registered',  (_, accelerator) => globalShortcut.isRegistered(accelerator));
  ipcMain.handle('global-shortcut:unregister-all', () => globalShortcut.unregisterAll());
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────

function setupAutoUpdater(mainWindow) {
  if (IS_DEV) return;

  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:update-available', info);
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:update-not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:download-progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater:error', err?.message);
  });

  ipcMain.handle('updater:check',    () => autoUpdater.checkForUpdates());
  ipcMain.handle('updater:download', () => autoUpdater.downloadUpdate());
  ipcMain.handle('updater:install',  () => autoUpdater.quitAndInstall());

  // Check on startup (after 3 s to let the window settle)
  setTimeout(() => autoUpdater.checkForUpdates(), 3000);
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Inject COOP/COEP before any window loads
  injectCOIHeaders();

  // Start static file server in production
  await createStaticServer();

  registerIpcHandlers();

  const mainWindow = createWindow();
  setupAutoUpdater(mainWindow);

  app.on('activate', () => {
    // macOS: re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
