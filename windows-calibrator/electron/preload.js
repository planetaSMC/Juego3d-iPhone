'use strict';

/* Superficie minima entre la UI y el proceso principal. No expone
   require, fs, ipcRenderer crudo ni canales arbitrarios. */
const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED = new Set([
  'app:info',
  'app:openDataFolder',
  'app:quit',
  'cal:set',
  'cal:reset',
  'cal:resetKey',
  'cal:resetGroup',
  'profiles:list',
  'profiles:save',
  'profiles:load',
  'profiles:rename',
  'profiles:duplicate',
  'profiles:delete',
  'profiles:default',
  'security:status',
  'security:expo',
  'security:expoDevice',
  'security:lock',
  'security:pairing:new',
  'security:pairing:cancel',
  'security:revoke',
  'security:closeSessions',
  'security:setPin',
  'security:clearPin',
  'security:verifyPin',
  'security:restore',
  'window:fullscreen',
  'window:capture'
]);

if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('calibrator', {
    info: function () { return ipcRenderer.invoke('app:info'); },
    invoke: function (channel, payload) {
      if (!ALLOWED.has(channel)) return Promise.resolve({ ok: false, code: 'forbidden' });
      return ipcRenderer.invoke(channel, payload);
    },
    onEvent: function (fn) {
      if (typeof fn !== 'function') return function () {};
      const handler = function (_event, ev) { fn(ev); };
      ipcRenderer.on('calibrator:event', handler);
      return function () { ipcRenderer.removeListener('calibrator:event', handler); };
    },
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome
    }
  });
}
