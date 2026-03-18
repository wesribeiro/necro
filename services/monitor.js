'use strict';

const { spawn }  = require('child_process');
const path       = require('path');
const logger     = require('../logs/logger');

const STATUS = {
  RUNNING:    'Em execução',
  NOT_FOUND:  'Parado',
  RECOVERING: 'Recuperando',
  RESTARTING: 'Reiniciando',
  PAUSED:     'Pausado',
};

class Monitor {
  constructor(config, win) {
    this.config           = config.monitor;
    this.scheduledRestart = config.scheduledRestart || {};
    this.serverName       = config.server.name;
    this.win         = win;
    this.status      = STATUS.RUNNING;
    this.lastStart   = null;
    this.interval    = null;
    this.active      = false;
    this._recovering = false;
    this._aborted    = false;
    this._hourlyTimer= null;
    this._nextCheckAt= null;   // timestamp da próxima verificação
    this.wsServer    = null;   // injetado pelo main.js após criação
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  start() {
    if (this.active) return;
    this.active = true;
    this._scheduleCheck();
  }

  stop() {
    this.active = false;
    if (this.interval)     { clearInterval(this.interval);     this.interval     = null; }
    if (this._hourlyTimer) { clearInterval(this._hourlyTimer); this._hourlyTimer = null; }
  }

  pause() {
    this._abort();
    this.stop();
    this._setStatus(STATUS.PAUSED);
    this._log('Monitor pausado');
  }

  resume() {
    if (this.status !== STATUS.PAUSED) return;
    this._log('Monitor retomado');
    this._setStatus(STATUS.RUNNING);
    this.start();
  }

  async manualRestart() {
    this._abort();
    this._log('Comando manual: restart');
    await this._doRestart('manual');
  }

  async kill() {
    this._abort();
    this.stop();
    this._log('Comando manual: encerrar');

    const running = await this._isRunning();
    if (!running) {
      this._log('Processo não estava em execução');
    } else {
      await this._killProcess();
      await this._sleep(1000);
      const stillRunning = await this._isRunning();
      if (stillRunning) {
        this._log('AVISO: Processo não respondeu ao encerramento');
      } else {
        this._log('Processo encerrado com sucesso');
      }
    }

    // Pausa o monitoramento após encerrar (intenção do usuário é parar)
    this._setStatus(STATUS.PAUSED);
    this._log('Monitor pausado');
  }

  updateConfig(newMonitorConfig) {
    const wasActive = this.active;
    this._abort();
    this.stop();
    this.config = { ...this.config, ...newMonitorConfig };
    if (wasActive) this.start();
  }

  getStatus() {
    return {
      processName: this.config.processName,
      status:      this.status,
      lastStart:   this.lastStart ? this._formatTime(this.lastStart) : '--:--:--',
      lastStartTs: this.lastStart ? this.lastStart.getTime() : null,
      serverName:  this.serverName,
    };
  }

  setWindow(win) { this.win = win; }

  // ─── Abort ────────────────────────────────────────────────────────────────

  _abort() {
    this._aborted    = true;
    this._recovering = false;
  }

  // ─── Loop de verificação ──────────────────────────────────────────────────

  _scheduleCheck() {
    // Log de sessão
    this._log(`► NECRO ${this.serverName} iniciado | monitorando ${this.config.processName}`);

    const ms = this.config.checkIntervalSeconds * 1000;
    this._nextCheckAt = Date.now() + ms;

    this.interval = setInterval(() => {
      this._nextCheckAt = Date.now() + ms;
      this._emitTick();
      this._check();
    }, ms);

    // Emite tick imediatamente e inicia hourly
    this._emitTick();
    this._startHourlyLog();

    // Verificação imediata de startup
    this._checkStartup();
  }

  // Verificação de startup: detecta se já estava rodando e define lastStart
  async _checkStartup() {
    if (!this.active) return;
    const running = await this._isRunning();
    if (running) {
      this.lastStart = new Date();
      this._setStatus(STATUS.RUNNING);
      this._log(`${this.config.processName} está em execução`);
    } else {
      this._log('Processo não encontrado');
      this._log('Iniciando recuperação');
      await this._recover();
    }
  }

  // Verificação horária: loga status sempre, mesmo que tudo esteja OK
  _startHourlyLog() {
    if (this._hourlyTimer) clearInterval(this._hourlyTimer);
    this._hourlyTimer = setInterval(async () => {
      if (!this.active) return;
      const running = await this._isRunning();
      this._log(
        running
          ? `◺ Verificação horária: ${this.config.processName} em execução`
          : `⚠ Verificação horária: ${this.config.processName} PARADO`
      );
    }, 60 * 60 * 1000); // 1 hora
  }

  async _check() {
    if (!this.active || this._recovering) return;
    if (this.status === STATUS.RESTARTING || this.status === STATUS.PAUSED) return;

    const running = await this._isRunning();
    if (running) {
      if (this.status !== STATUS.RUNNING) this._setStatus(STATUS.RUNNING);
    } else {
      this._log('Processo não encontrado');
      this._log('Iniciando recuperação');
      await this._recover();
    }
  }

  // ─── Verificação de processo ──────────────────────────────────────────────

  async _isRunning() {
    return new Promise((resolve) => {
      const proc = spawn('tasklist', [
        '/FI', `IMAGENAME eq ${this.config.processName}`,
        '/FO', 'CSV', '/NH',
      ], { windowsHide: true });
      let out = '';
      proc.stdout.on('data', (d) => { out += d.toString(); });
      proc.on('close', () => {
        resolve(out.toLowerCase().includes(this.config.processName.toLowerCase()));
      });
      proc.on('error', () => resolve(false));
    });
  }

  // ─── Recuperação automática ───────────────────────────────────────────────

  async _recover() {
    if (this._recovering) return;
    this._recovering = true;
    this._aborted    = false;
    this._setStatus(STATUS.RECOVERING);

    try {
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        if (this._aborted) return;

        this._log(`Tentativa start #${attempt}`);
        await this._spawnProcess();
        await this._countdown(this.config.restartWaitSeconds, 'Verificando em');
        if (this._aborted) return;

        this._log('Verificando processo');
        const ok = await this._isRunning();

        if (ok) {
          this.lastStart = new Date();
          this._setStatus(STATUS.RUNNING);
          this._log('Recuperação concluída');
          return;
        }

        this._log('Processo não iniciou');

        if (attempt < this.config.maxRetries) {
          await this._countdown(this.config.retryDelaySeconds, 'Próxima tentativa em');
          if (this._aborted) return;
        }
      }

      if (!this._aborted) {
        this._log('FALHA: Recuperação não concluída — intervenção manual necessária');
        this._setStatus(STATUS.NOT_FOUND);
      }
    } finally {
      this._recovering = false;
    }
  }

  // ─── Restart (manual ou agendado) ─────────────────────────────────────────

  async _doRestart(source = 'auto') {
    // Aguarda liberação do mutex (abort já foi chamado)
    for (let i = 0; i < 30 && this._recovering; i++) {
      await this._sleep(100);
    }

    this._recovering = true;
    this._aborted    = false;
    const wasActive  = this.active;
    this.stop();
    this._setStatus(STATUS.RESTARTING);

    try {
      // Verificar se está rodando antes de encerrar
      const running = await this._isRunning();
      if (running) {
        this._log(`Encerrando ${this.config.processName}`);
        await this._killProcess();
        await this._sleep(2500);
        const stillRunning = await this._isRunning();
        if (stillRunning) {
          this._log('ERRO: Não foi possível encerrar o processo. Restart cancelado.');
          this._setStatus(STATUS.PAUSED);
          return;
        }
        this._log('Processo encerrado com sucesso');
      } else {
        this._log(`${this.config.processName} já estava parado`);
      }
      if (this._aborted) return;

      // Aguardar antes de iniciar (com countdown visível)
      await this._countdown(this.config.restartWaitSeconds, 'Iniciando em');
      if (this._aborted) return;

      this._log(`Iniciando ${this.config.processName}`);
      await this._spawnProcess();

      // Aguardar processo subir (com countdown visível)
      await this._countdown(this.config.restartWaitSeconds, 'Verificando em');
      if (this._aborted) return;

      this._log('Verificando processo');
      const ok = await this._isRunning();

      if (ok) {
        this.lastStart = new Date();
        this._log(`Restart ${source === 'manual' ? 'manual' : 'agendado'} concluído`);
        this._setStatus(STATUS.RUNNING);
      } else {
        this._log(`FALHA: ${this.config.processName} não iniciou após restart ${source}`);
        this._setStatus(STATUS.NOT_FOUND);
      }
    } finally {
      this._recovering = false;
      if (!this._aborted && wasActive) {
        this.active = true;
        this._scheduleCheck();
      }
    }
  }

  // ─── Operações de processo ────────────────────────────────────────────────

  async _killProcess() {
    return new Promise((resolve) => {
      let output = '';
      const proc = spawn('taskkill', ['/F', '/T', '/IM', this.config.processName], {
        windowsHide: true,
      });
      if (proc.stdout) proc.stdout.on('data', d => { output += d.toString(); });
      if (proc.stderr) proc.stderr.on('data', d => { output += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0 && output.trim()) {
           // Pega a primeira linha de erro para não poluir muito
           const errMsg = output.trim().split('\n')[0].replace(/^ERRO:\s*/i, '').trim();
           if (errMsg && !errMsg.toLowerCase().includes('não foi encontrado')) {
             this._log(`taskkill falhou: ${errMsg}`);
           }
        }
        resolve();
      });
      proc.on('error', (err) => {
        this._log(`Erro ao executar taskkill: ${err.message}`);
        resolve();
      });
    });
  }

  // Inicia o processo — usa exec com cwd explícito para que o processo filho
  // opere a partir do seu próprio diretório (caminhos relativos como \Install funcionam).
  _spawnProcess() {
    return new Promise((resolve) => {
      const fs = require('fs');
      if (!this.config.executablePath || !fs.existsSync(this.config.executablePath)) {
        this._log(`ERRO: Executável não encontrado no caminho fornecido`);
        logger.error(`Executável não encontrado: ${this.config.executablePath}`);
        return resolve();
      }

      const { exec } = require('child_process');
      // O CWD CRÍTICO: garante que o processo filho resolva caminhos relativos
      // a partir do seu próprio diretório, não do diretório do NECRO.
      const execDir = path.dirname(this.config.executablePath);
      const cmd     = `start "NECRO" "${this.config.executablePath}"`;

      exec(cmd, { cwd: execDir, windowsHide: false }, (err) => {
        if (err) {
          this._log(`Erro ao iniciar (${err.code || err.message})`);
          logger.error(`Spawn falhou: ${err.message}`);
        }
      });
      resolve();   // resolve imediatamente; verificação vem depois via countdown
    });
  }

  // ─── Countdown (uma linha atualizada no lugar) ────────────────────────────

  async _countdown(seconds, label) {
    for (let s = seconds; s > 0; s--) {
      if (this._aborted) break;
      this._emitToRenderer('log:countdown', {
        time:    this._formatTime(new Date()),
        message: `${label}: ${s}s`,
      });
      await this._sleep(1000);
    }
    this._emitToRenderer('log:countdown', null);
  }

  // Emite o countdown até a próxima verificação para o renderer
  _emitTick() {
    if (!this._nextCheckAt) return;
    const secsLeft = Math.max(0, Math.round((this._nextCheckAt - Date.now()) / 1000));

    // Countdown do reinicio por intervalo (scheduledRestart.interval)
    let intervalSecsLeft = null;
    const iv = this.scheduledRestart.interval;
    if (iv && iv.enabled && this.lastStart) {
      const elapsed     = (Date.now() - this.lastStart.getTime()) / 1000;
      const intervalSec = iv.hours * 3600;
      intervalSecsLeft  = Math.max(0, Math.round(intervalSec - elapsed));
    }

    this._emitToRenderer('monitor:tick', {
      secsLeft,
      intervalSecs:     this.config.checkIntervalSeconds,
      intervalSecsLeft, // null se restart por intervalo não está ativo
    });
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    logger.info(`Status: ${newStatus}`);
    this._emitToRenderer('status:changed', this.getStatus());
    // Repassa ao WebSocket server se ativo
    if (this.wsServer) this.wsServer.broadcast({ type: 'status', ...this.getStatus() });
  }

  _log(message) {
    logger.info(message);
    const now  = new Date();
    const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const time = this._formatTime(now);
    this._emitToRenderer('log:new', { time, date, message });
    // Repassa ao WebSocket server se ativo
    if (this.wsServer) this.wsServer.broadcast({ type: 'log', time, date, message });
  }

  _emitToRenderer(channel, data) {
    const win = this.win || global.mainWindow;
    if (win && !win.isDestroyed()) win.webContents.send(channel, data);
  }

  _formatTime(date) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
}

Monitor.STATUS = STATUS;
module.exports  = Monitor;
