'use strict';

const logger = require('../logs/logger');

/**
 * Gerencia reinicializações programadas.
 * Ambos os modos podem estar ativos simultaneamente:
 *   - fixedTime:  reinicia em um horário fixo diário (HH:MM)
 *   - interval:   reinicia a cada N horas contados desde o último start
 */
class Scheduler {
  constructor(config, monitor) {
    this.cfg     = config.scheduledRestart;
    this.monitor = monitor;
    this.timers  = [];   // suporta múltiplos timers simultaneamente
  }

  start() {
    const cfg = this.cfg;

    // Modo horário fixo
    if (cfg.fixedTime && cfg.fixedTime.enabled) {
      this._startFixed(cfg.fixedTime.time);
    }

    // Modo intervalo
    if (cfg.interval && cfg.interval.enabled) {
      this._startInterval(cfg.interval.hours);
    }
  }

  stop() {
    this.timers.forEach(t => clearInterval(t));
    this.timers = [];
  }

  // ─── Modo horário fixo ─────────────────────────────────────────────────────
  _startFixed(time) {
    const [targetHH, targetMM] = time.split(':').map(Number);
    let lastTriggeredDate = null;

    const t = setInterval(async () => {
      const now   = new Date();
      const today = now.toDateString();

      if (
        now.getHours()   === targetHH &&
        now.getMinutes() === targetMM &&
        lastTriggeredDate !== today
      ) {
        lastTriggeredDate = today;
        logger.info(`Restart agendado (horário fixo ${time})`);
        await this.monitor.manualRestart();
      }
    }, 30_000); // verifica a cada 30s para não perder o minuto certo

    this.timers.push(t);
  }

  // ─── Modo intervalo ────────────────────────────────────────────────────────
  // Conta a partir do último start registrado no monitor (ou do início do app)
  _startInterval(hours) {
    const msInterval = hours * 60 * 60 * 1000;

    const t = setInterval(async () => {
      // Verifica quanto tempo se passou desde o último start
      const lastStart = this.monitor.lastStart;
      if (!lastStart) return;  // processo nunca iniciou — não faz nada

      const elapsed = Date.now() - lastStart.getTime();
      if (elapsed >= msInterval) {
        logger.info(`Restart agendado (intervalo ${hours}h)`);
        await this.monitor.manualRestart();
      }
    }, 60_000); // verifica a cada minuto

    this.timers.push(t);
  }
}

module.exports = Scheduler;
