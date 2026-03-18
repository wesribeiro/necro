'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('necroAPI', {
  // Controles do monitor
  pause:     ()  => ipcRenderer.invoke('monitor:pause'),
  resume:    ()  => ipcRenderer.invoke('monitor:resume'),
  restart:   ()  => ipcRenderer.invoke('monitor:restart'),
  kill:      ()  => ipcRenderer.invoke('monitor:kill'),
  getStatus: ()  => ipcRenderer.invoke('monitor:getStatus'),

  // Diálogo de arquivo
  openFileDialog:  () => ipcRenderer.invoke('dialog:openFile'),
  getProcessList:  () => ipcRenderer.invoke('process:list'),

  // Configurações
  getConfig:  ()       => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg)    => ipcRenderer.invoke('config:save', cfg),

  // Controles da janela
  minimize:     () => ipcRenderer.send('window:minimize'),
  expandHeight: () => ipcRenderer.send('window:expand-height'),
  close:        () => ipcRenderer.send('window:close'),

  // Eventos Main → Renderer
  onLog:           (cb) => ipcRenderer.on('log:new',        (_e, d) => cb(d)),
  onStatusChanged: (cb) => ipcRenderer.on('status:changed', (_e, d) => cb(d)),
  onCountdown:     (cb) => ipcRenderer.on('log:countdown',  (_e, d) => cb(d)),
  onTick:          (cb) => ipcRenderer.on('monitor:tick',   (_e, d) => cb(d)),
  getPreviousLogs: ()   => ipcRenderer.invoke('logs:getPrevious'),
  getRemoteInfo:   ()   => ipcRenderer.invoke('remote:getInfo'),
});
