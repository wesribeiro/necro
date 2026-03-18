'use strict';

const { BrowserWindow, screen, dialog } = require('electron');
const fs   = require('fs');
const path = require('path');

/**
 * @param {Electron.IpcMain} ipcMain
 * @param {Monitor}          monitor
 * @param {BrowserWindow}    win
 * @param {object}           config
 * @param {string}           configPath
 * @param {Scheduler}        scheduler
 */
function ipcSetup(ipcMain, monitor, win, config, configPath, scheduler, wsServer) {

  // ─── Controles do monitor ────────────────────────────────────────────────
  ipcMain.handle('monitor:pause',     async () => { monitor.pause();              return { status: 'ok' }; });
  ipcMain.handle('monitor:resume',    async () => { monitor.resume();             return { status: 'ok' }; });
  ipcMain.handle('monitor:restart',   async () => { await monitor.manualRestart(); return { status: 'ok' }; });
  ipcMain.handle('monitor:kill',      async () => { await monitor.kill();          return { status: 'ok' }; });
  ipcMain.handle('monitor:getStatus', async () => monitor.getStatus());

  // ─── Configurações ───────────────────────────────────────────────────────
  ipcMain.handle('config:get', async () => {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch { return null; }
  });

  ipcMain.handle('config:save', async (_e, newConfig) => {
    try {
      fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
      // Atualiza monitor e scheduler em tempo real
      monitor.updateConfig(newConfig.monitor);
      monitor.serverName = newConfig.server.name;
      scheduler.stop();
      scheduler.cfg = newConfig.scheduledRestart;
      scheduler.start();
      Object.assign(config, newConfig);
      return { status: 'ok' };
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  });

  // ─── Diálogo de arquivo ──────────────────────────────────────────────────
  ipcMain.handle('dialog:openFile', async () => {
    const focused = BrowserWindow.getFocusedWindow();
    const result  = await dialog.showOpenDialog(focused, {
      title:      'Selecionar executável',
      properties: ['openFile'],
      filters:    [{ name: 'Executáveis', extensions: ['exe'] }, { name: 'Todos', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // ─── Lista de processos em execução ───────────────────────────────────────
  ipcMain.handle('process:list', async () => {
    const { executeCommand } = require('../main/executor');
    const { output } = await executeCommand('tasklist', ['/FO', 'CSV', '/NH']);
    const names = new Set();
    for (const line of output.split('\n')) {
      const match = line.match(/^"([^"]+)"/);
      if (match) names.add(match[1].trim());
    }
    return [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  });

  // ─── Logs persistidos (últimas 24h) ──────────────────────────────────────
  ipcMain.handle('logs:getPrevious', () => {
    const logPath = path.join(__dirname, '..', 'logs', 'necro.log');
    if (!fs.existsSync(logPath)) return [];

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const lines  = fs.readFileSync(logPath, 'utf8').split(/\r?\n/);
    const result = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      // Formato: [INFO] 2026-03-08 22:36:14 -- message
      const m = line.match(/^\[(\w+)\] (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) -- (.+)$/);
      if (!m) continue;
      const [, level, date, time, message] = m;
      if (new Date(`${date}T${time}`) >= cutoff) {
        result.push({ time, message, level: level.toLowerCase() });
      }
    }
    return result;
  });

  // ─── Controles da janela ─────────────────────────────────────────────────
  ipcMain.on('window:minimize', () => {
    BrowserWindow.getFocusedWindow()?.minimize();
  });

  // "Maximizar por altura": expande para a altura total da área de trabalho
  ipcMain.on('window:expand-height', () => {
    const focused = BrowserWindow.getFocusedWindow();
    if (!focused) return;
    const { workArea } = screen.getDisplayMatching(focused.getBounds());
    const [curW] = focused.getSize();
    focused.setPosition(focused.getPosition()[0], workArea.y);
    focused.setSize(curW, workArea.height);
  });

  ipcMain.on('window:close', () => {
    BrowserWindow.getFocusedWindow()?.close();
  });
}

module.exports = ipcSetup;
