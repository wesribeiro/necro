'use strict';

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, shell, globalShortcut } = require('electron');
const path = require('path');
const fs   = require('fs');

// ─── Garante instância única ───────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// ─── Caminhos globais ──────────────────────────────────────────────────────
const ROOT       = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'config.json');
let CONFIG       = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const IS_DEV     = process.argv.includes('--dev');

// ─── Módulos internos ──────────────────────────────────────────────────────
const logger    = require('../logs/logger');
const ipcSetup  = require('./ipc');
const Monitor   = require('../services/monitor');
const Scheduler = require('../services/scheduler');
const WsServer  = require('../services/wsServer');

let mainWindow;
let monitor;
let scheduler;
let wsServer;
let tray = null;

// ─── Criar janela ──────────────────────────────────────────────────────────
function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  // Tamanho padrão: 380×680 (mais compacto); mínimo e máximo definidos
  const WIN_W = 380;
  const WIN_H = Math.min(680, sh);

  mainWindow = new BrowserWindow({
    width:       WIN_W,
    height:      WIN_H,
    minWidth:    300,
    minHeight:   500,
    maxWidth:    600,
    resizable:   true,
    frame:       false,
    show:        !CONFIG.startHidden,
    icon:        path.join(ROOT, 'assets', 'logo.png'),
    backgroundColor: '#111111',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));

  if (IS_DEV) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App pronto ────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  logger.info(`Monitor iniciado (${CONFIG.server.name})`);
  logger.info(`Processo monitorado: ${CONFIG.monitor.processName}`);

  // ─── Iniciar com Windows via Pasta de Inicialização ───────────────────────
  function updateAutoStart() {
    // Usamos um atalho físico (.lnk) na pasta Startup, muito mais confiável no Windows que o Registro
    const startupDir  = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const startupPath = path.join(startupDir, 'NECRO.lnk');
    
    try {
      if (!fs.existsSync(startupDir)) fs.mkdirSync(startupDir, { recursive: true });

      if (CONFIG.autoStart) {
        shell.writeShortcutLink(startupPath, 'create', {
          target: app.getPath('exe'),
          cwd: path.dirname(app.getPath('exe')),
          description: 'NECRO Monitor Auto-Start'
        });
        logger.info('Auto-Start ativado (Atalho criado na pasta Inicializar)');
      } else {
        if (fs.existsSync(startupPath)) fs.unlinkSync(startupPath);
        logger.info('Auto-Start desativado (Atalho removido)');
      }
    } catch (e) {
      logger.error(`Erro ao configurar auto-start na pasta Inicializar: ${e.message}`);
    }
  }
  
  updateAutoStart();

  createWindow();

  // ─── Tray & Background ────────────────────────────────────────────────────
  const iconPath = path.join(ROOT, 'assets', 'logo.png');
  tray = new Tray(iconPath);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('NECRO');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  global.mainWindow = mainWindow;
  global.config     = CONFIG;
  global.configPath = CONFIG_PATH;

  monitor   = new Monitor(CONFIG, mainWindow);
  scheduler = new Scheduler(CONFIG, monitor);
  wsServer  = new WsServer(CONFIG, monitor);
  monitor.wsServer = wsServer;  // injeta referência para broadcast de logs

  ipcSetup(ipcMain, monitor, mainWindow, CONFIG, CONFIG_PATH, scheduler, wsServer);

  monitor.start();
  scheduler.start();
  wsServer.start();

  // ─ Atalho global de teclado ───────────────────────────────────────────────
  function registerShortcut(accelerator) {
    globalShortcut.unregisterAll();
    if (!accelerator) return;
    try {
      const ok = globalShortcut.register(accelerator, () => {
        logger.info(`Restart via atalho (${accelerator})`);
        monitor.manualRestart();
      });
      if (!ok) logger.error(`Atalho '${accelerator}' não pôde ser registrado`);
      else      logger.info(`Atalho registrado: ${accelerator}`);
    } catch (e) {
      logger.error(`Erro ao registrar atalho: ${e.message}`);
    }
  }
  registerShortcut(CONFIG.shortcuts?.restart || 'Ctrl+Shift+9');
  global.registerShortcut = registerShortcut; // usado pelo ipc ao salvar config

  // ─── Observa mudanças manuais no config.json ────────────────────────────
  let watchDebounce = null;
  fs.watch(CONFIG_PATH, () => {
    clearTimeout(watchDebounce);
    watchDebounce = setTimeout(() => {
      try {
        const newCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        Object.assign(CONFIG, newCfg);

        // Atualiza iniciar com windows
        updateAutoStart();

        monitor.updateConfig(newCfg.monitor);
        monitor.serverName = newCfg.server.name;

        scheduler.stop();
        scheduler.cfg = newCfg.scheduledRestart;
        scheduler.start();

        // Atualiza WebSocket server
        wsServer.restart(newCfg.remotePanel);

        // Atualiza atalho global
        global.registerShortcut(newCfg.shortcuts?.restart || 'Ctrl+Shift+9');

        logger.info(`Config recarregada: monitorando ${newCfg.monitor.processName}`);

        // Notifica renderer para atualizar painel
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('status:changed', monitor.getStatus());
          mainWindow.webContents.send('log:new', {
            time: new Date().toTimeString().slice(0,8),
            message: `Config recarregada: monitorando ${newCfg.monitor.processName}`,
          });
        }
      } catch (e) {
        logger.error(`Erro ao recarregar config: ${e.message}`);
      }
    }, 500);  // debounce 500ms para evitar leituras duplicadas
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  globalShortcut.unregisterAll();
  wsServer?.stop();
  monitor?.stop();
  scheduler?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});
