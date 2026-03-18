'use strict';

const { WebSocketServer } = require('ws');
const logger = require('../logs/logger');

/**
 * Servidor WebSocket para comunicação com o painel central remoto.
 * Protocolo: ws://[host]:[port]
 *
 * Mensagens enviadas (server → client):
 *   { type: "heartbeat",  status, processName, lastStart, server, ts }
 *   { type: "status",     status, processName, lastStart, server, ts }
 *   { type: "log",        time, date, message }
 *   { type: "pong" }
 *
 * Comandos aceitos (client → server):
 *   { command: "getStatus" }
 *   { command: "pause" }
 *   { command: "resume" }
 *   { command: "restart" }
 *   { command: "kill" }
 *   { command: "ping" }
 */
class WsServer {
  constructor(config, monitor) {
    this.cfg     = config.remotePanel || { enabled: false, port: 9999 };
    this.monitor = monitor;
    this._wss    = null;
    this._hbTimer= null;
  }

  start() {
    if (!this.cfg.enabled) return;
    this._listen(this.cfg.port);
  }

  stop() {
    if (this._hbTimer) { clearInterval(this._hbTimer); this._hbTimer = null; }
    if (this._wss)     { this._wss.close(); this._wss = null; }
  }

  restart(newCfg) {
    this.cfg = newCfg || this.cfg;
    this.stop();
    this.start();
  }

  // Transmite para todos os clientes conectados
  broadcast(payload) {
    if (!this._wss) return;
    const data = JSON.stringify({ ...payload, ts: new Date().toISOString() });
    for (const client of this._wss.clients) {
      if (client.readyState === 1 /* OPEN */) client.send(data);
    }
  }

  // ─── Privados ────────────────────────────────────────────────────────────

  _listen(port) {
    try {
      this._wss = new WebSocketServer({ port });
      logger.info(`Painel remoto: WebSocket escutando na porta ${port}`);

      this._wss.on('connection', (ws, req) => {
        const ip = req.socket.remoteAddress;
        logger.info(`Painel remoto: cliente conectado (${ip})`);

        // Envia status imediatamente ao conectar
        ws.send(JSON.stringify({ type: 'status', ...this._statusPayload() }));

        ws.on('message', (raw) => this._handleMessage(ws, raw));
        ws.on('close',   ()    => logger.info(`Painel remoto: cliente desconectado (${ip})`));
        ws.on('error',   (e)   => logger.error(`WS cliente erro: ${e.message}`));
      });

      this._wss.on('error', (e) => logger.error(`WS server erro: ${e.message}`));

      // Heartbeat a cada 30s
      this._hbTimer = setInterval(() => {
        this.broadcast({ type: 'heartbeat', ...this._statusPayload() });
      }, 30_000);

    } catch (e) {
      logger.error(`Painel remoto: erro ao iniciar WebSocket na porta ${port}: ${e.message}`);
    }
  }

  async _handleMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    const send = (payload) => ws.send(JSON.stringify({ ...payload, ts: new Date().toISOString() }));

    switch (msg.command) {
      case 'getStatus':
        send({ type: 'status', ...this._statusPayload() });
        break;
      case 'pause':
        this.monitor.pause();
        send({ type: 'ack', command: 'pause' });
        break;
      case 'resume':
        this.monitor.resume();
        send({ type: 'ack', command: 'resume' });
        break;
      case 'restart':
        send({ type: 'ack', command: 'restart' });
        await this.monitor.manualRestart();
        break;
      case 'kill':
        send({ type: 'ack', command: 'kill' });
        await this.monitor.kill();
        break;
      case 'ping':
        send({ type: 'pong' });
        break;
      default:
        send({ type: 'error', message: `Comando desconhecido: ${msg.command}` });
    }
  }

  _statusPayload() {
    const s = this.monitor.getStatus();
    return {
      status:      s.status,
      processName: s.processName,
      lastStart:   s.lastStart,
      server:      s.serverName,
    };
  }
}

module.exports = WsServer;
