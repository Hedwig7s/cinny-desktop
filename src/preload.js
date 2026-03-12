'use strict';

/**
 * preload.js
 *
 * Exposes a typed IPC bridge (window.electronAPI) to the renderer.
 * contextIsolation is ON, so this is the only safe channel between
 * the web content and the main process.
 */

const { contextBridge, ipcRenderer } = require('electron');

// Helper: one-shot invoke
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

// Helper: listen for events from main → renderer
const on = (channel, callback) => {
  const sub = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, sub);
  return () => ipcRenderer.removeListener(channel, sub);
};

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Clipboard ──────────────────────────────────────────────────────────────
  clipboard: {
    readText:  ()     => invoke('clipboard:read-text'),
    writeText: (text) => invoke('clipboard:write-text', text),
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  notification: {
    /** @param {{ title: string, body?: string, icon?: string }} opts */
    send: (opts) => invoke('notification:send', opts),
  },

  // ── Dialog ─────────────────────────────────────────────────────────────────
  dialog: {
    open:    (opts) => invoke('dialog:open',    opts),
    save:    (opts) => invoke('dialog:save',    opts),
    message: (opts) => invoke('dialog:message', opts),
  },

  // ── File system ────────────────────────────────────────────────────────────
  fs: {
    readFile:  (filePath, opts)        => invoke('fs:read-file',  filePath, opts),
    writeFile: (filePath, data)        => invoke('fs:write-file', filePath, data),
    readDir:   (dirPath)               => invoke('fs:read-dir',   dirPath),
    copyFile:  (src, dest)             => invoke('fs:copy-file',  src, dest),
    mkdir:     (dirPath, opts)         => invoke('fs:mkdir',      dirPath, opts),
    remove:    (target)                => invoke('fs:remove',     target),
    rename:    (oldPath, newPath)      => invoke('fs:rename',     oldPath, newPath),
    exists:    (target)                => invoke('fs:exists',     target),
  },

  // ── OS ─────────────────────────────────────────────────────────────────────
  os: {
    platform: () => invoke('os:platform'),
    version:  () => invoke('os:version'),
    arch:     () => invoke('os:arch'),
    hostname: () => invoke('os:hostname'),
    locale:   () => invoke('os:locale'),
  },

  // ── Process ────────────────────────────────────────────────────────────────
  process: {
    restart: ()       => invoke('process:restart'),
    exit:    (code)   => invoke('process:exit', code),
  },

  // ── Shell ──────────────────────────────────────────────────────────────────
  shell: {
    open: (url) => invoke('shell:open', url),
  },

  // ── App ────────────────────────────────────────────────────────────────────
  app: {
    hide: () => invoke('app:hide'),
    show: () => invoke('app:show'),
  },

  // ── Window controls ────────────────────────────────────────────────────────
  window: {
    minimize:      ()      => invoke('window:minimize'),
    maximize:      ()      => invoke('window:maximize'),
    unmaximize:    ()      => invoke('window:unmaximize'),
    close:         ()      => invoke('window:close'),
    isMaximized:   ()      => invoke('window:is-maximized'),
    setTitle:      (title) => invoke('window:set-title', title),
    setFullscreen: (flag)  => invoke('window:set-fullscreen', flag),
  },

  // ── Global shortcuts ───────────────────────────────────────────────────────
  globalShortcut: {
    register:       (accelerator) => invoke('global-shortcut:register',       accelerator),
    unregister:     (accelerator) => invoke('global-shortcut:unregister',     accelerator),
    isRegistered:   (accelerator) => invoke('global-shortcut:is-registered',  accelerator),
    unregisterAll:  ()            => invoke('global-shortcut:unregister-all'),
    /** @param {(accelerator: string) => void} callback - returns an unsubscribe fn */
    onTriggered:    (callback)    => on('global-shortcut:triggered', callback),
  },

  // ── Auto-updater ───────────────────────────────────────────────────────────
  updater: {
    check:    () => invoke('updater:check'),
    download: () => invoke('updater:download'),
    install:  () => invoke('updater:install'),
    onUpdateAvailable:    (cb) => on('updater:update-available',    cb),
    onUpdateNotAvailable: (cb) => on('updater:update-not-available', cb),
    onDownloadProgress:   (cb) => on('updater:download-progress',   cb),
    onUpdateDownloaded:   (cb) => on('updater:update-downloaded',   cb),
    onError:              (cb) => on('updater:error',               cb),
  },
});
