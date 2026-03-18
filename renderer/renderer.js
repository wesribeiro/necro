'use strict';

/* ═══════════════════════════════════════════════════════════════════
   NECRO — Renderer
   ═══════════════════════════════════════════════════════════════════ */

const api = window.necroAPI;

// ─── Limite de entradas no feed (24h estimadas = 2880 línhas a 30s de intervalo) ──
const LOG_MAX = 3000;

// ─── Referências DOM ──────────────────────────────────────────────────────
const panel       = document.getElementById('status-panel');
const valProcess  = document.getElementById('val-process');
const valStatus   = document.getElementById('val-status');
const valLastStart= document.getElementById('val-last-start');
const logFeed     = document.getElementById('log-feed');

const btnPause    = document.getElementById('btn-pause');
const btnRestart  = document.getElementById('btn-restart');
const btnKill     = document.getElementById('btn-kill');
const btnSettings = document.getElementById('btn-settings');
const btnMinimize = document.getElementById('btn-minimize');
const btnExpand   = document.getElementById('btn-expand-height');
const btnClose    = document.getElementById('btn-close');

// Modal
const modalOverlay= document.getElementById('modal-overlay');
const btnModalClose = document.getElementById('modal-close');
const btnSave      = document.getElementById('cfg-save');
const btnBrowse    = document.getElementById('btn-browse');
const btnRefreshProcs = document.getElementById('btn-refresh-procs');
const selectProcessName = document.getElementById('cfg-processName');
const inputExecPath = document.getElementById('cfg-executablePath');
const schedEnabled = document.getElementById('cfg-schedEnabled');
const schedOpts   = document.getElementById('cfg-sched-opts');
const schedType   = document.getElementById('cfg-schedType');
const fixedLabel  = document.getElementById('cfg-fixed-time-label');
const intervalLabel=document.getElementById('cfg-interval-time-label');

// ─── Mapa status PT-BR → classe CSS do indicador de texto ────────────────
const STATUS_CLS = {
  'Em execução': 's-running',
  'Parado':      's-not-found',
  'Recuperando': 's-not-found',
  'Reiniciando': 's-restarting',
  'Pausado':     's-paused',
};

// ─── Estado local ─────────────────────────────────────────────────────────
let currentStatus = '';
let busy = false;

// ─── Inicialização ────────────────────────────────────────────────────────
(async () => {
  try {
    // Carrega logs das últimas 24h antes de exibir o status atual
    const prevLogs = await api.getPreviousLogs();
    if (prevLogs && prevLogs.length > 0) {
      // Separador visual de sessão anterior
      const sep = document.createElement('div');
      sep.className   = 'log-line log-warn';
      sep.textContent = '••• logs das últimas 24h •••';
      logFeed.appendChild(sep);

      for (const entry of prevLogs) {
        let cls = '';
        const msg = entry.message.toLowerCase();
        if (msg.includes('falha') || msg.includes('erro'))          cls = 'log-error';
        else if (msg.includes('concluíd') || msg.includes('concluío')) cls = 'log-ok';
        else if (msg.includes('► necro'))                             cls = 'log-warn';
        else if (msg.includes('⚠'))                                  cls = 'log-error';
        else if (msg.includes('◺'))                                  cls = 'log-count';
        addLogLine(entry.time, entry.message, cls);
      }

      // Separador de sessão atual
      const sep2 = document.createElement('div');
      sep2.className   = 'log-line log-warn';
      sep2.textContent = '••• sessão atual •••';
      logFeed.appendChild(sep2);
    }

    const status = await api.getStatus();
    applyStatus(status);
  } catch (e) {
    addLogLine('--:--:--', 'Erro ao carregar status inicial', 'log-error');
  }
})();

// ─── Eventos do Main ──────────────────────────────────────────────────────
api.onLog((data) => {
  let cls = '';
  const msg = data.message.toLowerCase();
  if (msg.includes('falha') || msg.includes('erro') || msg.includes('não respondeu') || msg.includes('não encontrado') || msg.includes('não foi possível')) cls = 'log-error';
  else if (msg.includes('concluíd') || msg.includes('ativo') || msg.includes('sucesso')) cls = 'log-ok';
  else if (msg.includes('próxima tentativa'))                 cls = 'log-count';
  else if (msg.includes('não iniciou') || msg.includes('recuperação')) cls = 'log-warn';
  addLogLine(data.time, data.message, cls, data.date || '');
});

// Countdown até a próxima verificação
const valNextCheck = document.getElementById('val-next-check');
api.onTick((data) => {
  if (!valNextCheck) return;
  if (data && data.secsLeft > 0) {
    valNextCheck.textContent = `⋅ ${data.secsLeft}s`;
  } else {
    valNextCheck.textContent = '';
  }
});

api.onStatusChanged((data) => {
  applyStatus(data);
});

// Linha de countdown — atualizada no lugar (não cria spam)
let countdownLine = null;
api.onCountdown((data) => {
  if (!data) {
    // null = remover a linha de countdown
    if (countdownLine) { countdownLine.remove(); countdownLine = null; }
    return;
  }
  if (!countdownLine) {
    countdownLine = document.createElement('div');
    countdownLine.className = 'log-line log-count';
    logFeed.appendChild(countdownLine);
  }
  countdownLine.textContent = `${data.time} -- ${data.message}`;
  // Mantém o scroll no countdown
  logFeed.scrollTop = logFeed.scrollHeight;
});

// ─── Atualiza painel de status ────────────────────────────────────────────
function applyStatus(data) {
  if (!data) return;

  valProcess.textContent  = data.processName || '---';
  valStatus.textContent   = data.status      || '---';
  valLastStart.textContent= data.lastStart   || '--:--:--';

  currentStatus = data.status;

  // Atualiza classe de cor APENAS no texto de status
  Object.values(STATUS_CLS).forEach((c) => valStatus.classList.remove(c));
  const cls = STATUS_CLS[data.status];
  if (cls) valStatus.classList.add(cls);

  // PAUSAR ↔ RETOMAR
  if (data.status === 'Pausado') {
    btnPause.textContent = 'RETOMAR';
    btnPause.classList.replace('ctrl-pause', 'ctrl-resume');
  } else {
    btnPause.textContent = 'PAUSAR';
    btnPause.classList.replace('ctrl-resume', 'ctrl-pause');
  }
}

// ─── Feed de log ──────────────────────────────────────────────────────────
function addLogLine(time, message, extraClass = '', date = '') {
  const shortText = `${time} -- ${message}`;
  // Tooltip mostra data completa ao fazer hover
  const fullText  = date ? `${date} ${time} -- ${message}` : shortText;
  const line = document.createElement('div');
  line.className   = `log-line${extraClass ? ' ' + extraClass : ''}`;
  line.textContent = shortText;
  line.title       = fullText;   // data visível apenas no tooltip
  logFeed.appendChild(line);

  // Limita número de entradas para não consumir memória indefinidamente
  while (logFeed.children.length > LOG_MAX) {
    logFeed.removeChild(logFeed.firstChild);
  }

  // Scroll automático para o último evento
  logFeed.scrollTop = logFeed.scrollHeight;
}

// ─── Controles com proteção ───────────────────────────────────────────────
async function withBusy(fn) {
  if (busy) return;
  busy = true;
  setControlsDisabled(true);
  try { await fn(); } finally {
    busy = false;
    setControlsDisabled(false);
  }
}
function setControlsDisabled(d) {
  btnPause.disabled = btnRestart.disabled = btnKill.disabled = d;
}

btnPause.addEventListener('click', async () => {
  await withBusy(async () => {
    if (currentStatus === 'Pausado') await api.resume();
    else await api.pause();
  });
});
btnRestart.addEventListener('click', () => withBusy(() => api.restart()));
btnKill.addEventListener('click',    () => withBusy(() => api.kill()));

// ─── Janela ───────────────────────────────────────────────────────────────
btnMinimize.addEventListener('click', () => api.minimize());
btnExpand.addEventListener('click',   () => api.expandHeight());
btnClose.addEventListener('click',    () => api.close());

// ═══════════════════════════════════════════════════════════════════
// MODAL DE CONFIGURAÇÕES
// ═══════════════════════════════════════════════════════════════════

// Checkboxes de agendamento
const cfgFixedEnabled    = document.getElementById('cfg-fixed-enabled');
const cfgIntervalEnabled = document.getElementById('cfg-interval-enabled');

function updateSchedSubLabels() {
  fixedLabel.style.opacity    = cfgFixedEnabled.checked    ? '1' : '0.4';
  intervalLabel.style.opacity = cfgIntervalEnabled.checked ? '1' : '0.4';
  fixedLabel.querySelector('input').disabled    = !cfgFixedEnabled.checked;
  intervalLabel.querySelector('input').disabled = !cfgIntervalEnabled.checked;
}
cfgFixedEnabled.addEventListener('change',    updateSchedSubLabels);
cfgIntervalEnabled.addEventListener('change', updateSchedSubLabels);

// Popula o select com processos em execução
async function loadProcessList(currentProcess) {
  selectProcessName.innerHTML = '<option value="">-- carregando... --</option>';
  try {
    const procs = await api.getProcessList();
    selectProcessName.innerHTML = '';
    for (const name of procs) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name.toLowerCase() === (currentProcess || '').toLowerCase()) opt.selected = true;
      selectProcessName.appendChild(opt);
    }
    // Se o processo configurado não estiver na lista (não está rodando), adiciona mesmo assim
    if (currentProcess && !procs.some(p => p.toLowerCase() === currentProcess.toLowerCase())) {
      const opt = document.createElement('option');
      opt.value = currentProcess;
      opt.textContent = `${currentProcess} (não encontrado)`;
      opt.selected = true;
      selectProcessName.prepend(opt);
    }
  } catch {
    selectProcessName.innerHTML = '<option value="">-- erro ao listar processos --</option>';
  }
}

// Botão navegar (caminho do executável)
btnBrowse.addEventListener('click', async () => {
  const filePath = await api.openFileDialog();
  if (filePath) inputExecPath.value = filePath;
});

// Botão atualizar lista de processos
btnRefreshProcs.addEventListener('click', () => loadProcessList(selectProcessName.value));

// Carregar configurações no modal
async function openSettings() {
  const cfg = await api.getConfig();
  if (!cfg) return;

  document.getElementById('cfg-processName').value   = cfg.monitor.processName;
  document.getElementById('cfg-executablePath').value= cfg.monitor.executablePath;
  document.getElementById('cfg-checkInterval').value = cfg.monitor.checkIntervalSeconds;
  document.getElementById('cfg-maxRetries').value    = cfg.monitor.maxRetries;
  document.getElementById('cfg-retryDelay').value    = cfg.monitor.retryDelaySeconds;
  document.getElementById('cfg-restartWait').value   = cfg.monitor.restartWaitSeconds;
  document.getElementById('cfg-serverName').value    = cfg.server.name;
  document.getElementById('cfg-autoStart').checked   = !!cfg.autoStart;
  document.getElementById('cfg-startHidden').checked = !!cfg.startHidden;

  // Carrega processos e seleciona o configurado
  await loadProcessList(cfg.monitor.processName);

  // Agendamento — nova estrutura fixedTime / interval
  const ft = cfg.scheduledRestart.fixedTime || {};
  const iv = cfg.scheduledRestart.interval  || {};
  cfgFixedEnabled.checked    = !!ft.enabled;
  cfgIntervalEnabled.checked = !!iv.enabled;
  document.getElementById('cfg-schedTime').value     = ft.time  || '06:00';
  document.getElementById('cfg-schedInterval').value = iv.hours || 3;
  updateSchedSubLabels();

  // Atalho
  document.getElementById('cfg-shortcut-restart').value = (cfg.shortcuts || {}).restart || 'Ctrl+Shift+9';

  // Painel remoto
  const rp = cfg.remotePanel || {};
  document.getElementById('cfg-remote-enabled').checked = !!rp.enabled;
  document.getElementById('cfg-remote-port').value      = rp.port || 9999;
  document.getElementById('cfg-remote-port-label').style.opacity = rp.enabled ? '1' : '0.4';
  document.getElementById('cfg-remote-port').disabled = !rp.enabled;

  modalOverlay.hidden = false;
}

// Salvar configurações
btnSave.addEventListener('click', async () => {
  const newCfg = {
    autoStart:   document.getElementById('cfg-autoStart').checked,
    startHidden: document.getElementById('cfg-startHidden').checked,
    monitor: {
      processName:          selectProcessName.value.trim(),
      executablePath:       document.getElementById('cfg-executablePath').value.trim(),
      checkIntervalSeconds: parseInt(document.getElementById('cfg-checkInterval').value, 10),
      maxRetries:           parseInt(document.getElementById('cfg-maxRetries').value, 10),
      retryDelaySeconds:    parseInt(document.getElementById('cfg-retryDelay').value, 10),
      restartWaitSeconds:   parseInt(document.getElementById('cfg-restartWait').value, 10),
    },
    scheduledRestart: {
      fixedTime: {
        enabled: cfgFixedEnabled.checked,
        time:    document.getElementById('cfg-schedTime').value,
      },
      interval: {
        enabled: cfgIntervalEnabled.checked,
        hours:   parseFloat(document.getElementById('cfg-schedInterval').value),
      },
    },
    shortcuts: {
      restart: document.getElementById('cfg-shortcut-restart').value.trim() || 'Ctrl+Shift+9',
    },
    remotePanel: {
      enabled: document.getElementById('cfg-remote-enabled').checked,
      port:    parseInt(document.getElementById('cfg-remote-port').value, 10) || 9999,
    },
    server: {
      name: document.getElementById('cfg-serverName').value.trim(),
    },
  };

  btnSave.textContent = 'SALVANDO...';
  btnSave.disabled = true;

  const result = await api.saveConfig(newCfg);
  if (result.status === 'ok') {
    addLogLine(now(), 'Configurações salvas e aplicadas', 'log-ok');
    modalOverlay.hidden = true;
  } else {
    addLogLine(now(), `Erro ao salvar: ${result.message}`, 'log-error');
  }

  btnSave.textContent = 'SALVAR';
  btnSave.disabled = false;
});

function now() {
  const d  = new Date();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ss = String(d.getSeconds()).padStart(2,'0');
  return `${hh}:${mm}:${ss}`;
}

btnSettings.addEventListener('click', openSettings);
btnModalClose.addEventListener('click', () => { modalOverlay.hidden = true; });
// Fechar clicando fora do modal
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) modalOverlay.hidden = true;
});

// ─── Captura de atalho de teclado ─────────────────────────────────────────
const shortcutInput = document.getElementById('cfg-shortcut-restart');
if (shortcutInput) {
  shortcutInput.addEventListener('focus', () => {
    shortcutInput.value = 'Pressione a combinação...';
    shortcutInput.style.color = '#f5a623';
  });
  shortcutInput.addEventListener('keydown', (e) => {
    e.preventDefault();
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey)   parts.push('Alt');
    // Adiciona a tecla principal (evita teclas modificadoras sozinhas)
    const key = e.key;
    if (!['Control','Shift','Alt','Meta'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
    }
    if (parts.length > 1) {
      shortcutInput.value = parts.join('+');
      shortcutInput.style.color = '';
    }
  });
  shortcutInput.addEventListener('blur', () => {
    shortcutInput.style.color = '';
    if (shortcutInput.value === 'Pressione a combinação...') {
      shortcutInput.value = 'Ctrl+Shift+9';
    }
  });
}

// ─── Toggle porta do painel remoto ────────────────────────────────────────
const remoteEnabledEl = document.getElementById('cfg-remote-enabled');
if (remoteEnabledEl) {
  remoteEnabledEl.addEventListener('change', () => {
    const portEl  = document.getElementById('cfg-remote-port');
    const labelEl = document.getElementById('cfg-remote-port-label');
    if (portEl)  portEl.disabled = !remoteEnabledEl.checked;
    if (labelEl) labelEl.style.opacity = remoteEnabledEl.checked ? '1' : '0.4';
  });
}
