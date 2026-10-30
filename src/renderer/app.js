'use strict';

const api = window.thinq;
const $ = (id) => document.getElementById(id);
const body = document.body;

const ICONS = {
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  drop: '<path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z"/>',
  fan: '<circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c-1-3.4.4-6.4 2.8-6.4 2.1 0 2.6 2.8.2 4.6M13.6 12c3.4-1 6.4.4 6.4 2.8 0 2.1-2.8 2.6-4.6.2M12 13.6c1 3.4-.4 6.4-2.8 6.4-2.1 0-2.6-2.8-.2-4.6M10.4 12c-3.4 1-6.4-.4-6.4-2.8 0-2.1 2.8-2.6 4.6-.2"/>',
  auto: '<path d="M5.5 19 12 5l6.5 14M8.3 13.2h7.4"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19l8-8"/>',
  air: '<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
};

const MODES = {
  COOL: { label: 'Frio', icon: 'snow' },
  HEAT: { label: 'Quente', icon: 'sun' },
  AIR_DRY: { label: 'Seco', icon: 'drop' },
  FAN: { label: 'Ventilar', icon: 'fan' },
  AUTO: { label: 'Auto', icon: 'auto' },
  ENERGY_SAVING: { label: 'Econ.', icon: 'leaf' },
  AIR_CLEAN: { label: 'Purificar', icon: 'air' },
};

const FANS = {
  SLOW: 'Mínimo', SLOW_LOW: 'Mín.+', LOW: 'Baixo', LOW_MID: 'Baixo+', MID: 'Médio',
  MID_HIGH: 'Médio+', HIGH: 'Alto', POWER: 'Turbo', HIGH_POWER: 'Turbo', AUTO: 'Auto', NATURE: 'Natural',
};

const POLL_MS = 30000;
const TEMP_DEBOUNCE_MS = 700;

const S = {
  config: null,
  devices: [],
  deviceId: null,
  caps: null,
  ac: null,
  pendingTemp: null,
  tempTimer: null,
  pollTimer: null,
  refreshTimer: null,
};

/* ---------- utilidades ---------- */

const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function stamp() {
  const t = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  setStatus(`Atualizado às ${t}`);
}

function setView(view) {
  body.dataset.view = view;
  $('empty').hidden = view !== 'empty';
}

const range = () => S.ac?.range || { min: 18, max: 30, step: 1 };
const shownTarget = () => S.pendingTemp ?? S.ac?.target ?? null;
const canTemp = () => !!S.ac && S.ac.power && S.ac.mode !== 'FAN' && !!S.ac.tempKey && S.ac.target !== null;

function snap(v) {
  const { min, max, step } = range();
  const s = Math.round((v - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(s.toFixed(1))));
}

/* ---------- mostrador ---------- */

const CX = 150, CY = 150, R = 118, START = 135, SWEEP = 270;

function polar(deg, r = R) {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
}

function arc(from, to) {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to + 0.001);
  const large = to - from > 180 ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

const angleFor = (v) => {
  const { min, max } = range();
  const f = Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
  return START + f * SWEEP;
};

let ticksFor = '';
function drawTicks() {
  const { min, max, step } = range();
  const key = `${min}-${max}-${step}`;
  if (ticksFor === key) return;
  ticksFor = key;
  const g = $('ticks');
  g.innerHTML = '';
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i++) {
    const v = min + i * step;
    const deg = angleFor(v);
    const major = Number.isInteger(v) && v % 2 === 0;
    const [x1, y1] = polar(deg, 134);
    const [x2, y2] = polar(deg, major ? 142 : 139);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('class', major ? 'tick major' : 'tick');
    g.appendChild(line);
  }
}

function drawDial() {
  drawTicks();
  $('arc-track').setAttribute('d', arc(START, START + SWEEP));
  const target = shownTarget();
  const end = target === null ? START : angleFor(target);
  $('arc-value').setAttribute('d', arc(START, end));
  const [tx, ty] = polar(end);
  $('thumb').setAttribute('cx', tx);
  $('thumb').setAttribute('cy', ty);
  $('thumb').style.display = canTemp() ? '' : 'none';

  const room = S.ac?.current;
  const dot = $('ambient-dot');
  if (typeof room === 'number') {
    const [ax, ay] = polar(angleFor(room), R - 22);
    dot.setAttribute('cx', ax);
    dot.setAttribute('cy', ay);
    dot.style.display = '';
  } else {
    dot.style.display = 'none';
  }
}

/* ---------- renderização ---------- */

function render() {
  const ac = S.ac;
  if (!ac) return;
  body.dataset.mode = ac.mode || 'COOL';
  body.classList.toggle('is-off', !ac.power);
  body.classList.toggle('no-temp', !canTemp());

  const target = shownTarget();
  $('target').textContent = target === null ? '--' : fmt(target);
  $('room').textContent = typeof ac.current === 'number' ? `Ambiente ${fmt(ac.current)}°` : 'Ambiente --';
  $('readout-state').textContent = !ac.power ? 'Desligado' : ac.mode === 'FAN' ? 'Só ventilação' : 'Desejada';

  const dial = $('dial');
  const { min, max } = range();
  dial.setAttribute('aria-valuemin', min);
  dial.setAttribute('aria-valuemax', max);
  dial.setAttribute('aria-valuenow', target ?? min);
  dial.setAttribute('aria-valuetext', target === null ? 'sem leitura' : `${fmt(target)} graus`);
  dial.setAttribute('aria-disabled', String(!canTemp()));

  $('temp-down').disabled = !canTemp() || target <= min;
  $('temp-up').disabled = !canTemp() || target >= max;

  const power = $('power');
  power.disabled = !S.caps?.canPower;
  power.setAttribute('aria-pressed', String(ac.power));
  power.setAttribute('aria-label', ac.power ? 'Desligar' : 'Ligar');
  power.title = ac.power ? 'Desligar' : 'Ligar';

  for (const btn of $('modes').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === ac.mode));
    btn.disabled = !ac.power;
  }
  for (const btn of $('fans').querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === ac.fan));
    btn.disabled = !ac.power;
  }

  drawDial();
}

function buildSegments() {
  const make = (fieldsetId, list, labelFor, iconFor) => {
    const fs = $(fieldsetId);
    fs.querySelector('.options')?.remove();
    fs.hidden = list.length === 0;
    const wrap = document.createElement('div');
    wrap.className = 'options';
    for (const value of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = value;
      const icon = iconFor ? `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[iconFor(value)]}</svg>` : '';
      b.innerHTML = `${icon}<span></span>`;
      b.querySelector('span').textContent = labelFor(value);
      wrap.appendChild(b);
    }
    fs.appendChild(wrap);
  };

  make('modes', S.caps.modes, (m) => MODES[m]?.label || titleCase(m), (m) => MODES[m]?.icon || 'dot');
  make('fans', S.caps.fans, (f) => FANS[f] || titleCase(f));
}

/* ---------- ações ---------- */

function showError(res) {
  setStatus(res.message || 'Algo deu errado.', true);
  if (['1103', '1218', '1302', 'no_token'].includes(res.code)) openSettings({ force: !S.config?.hasToken });
}

function scheduleRefresh(ms = 2500) {
  clearTimeout(S.refreshTimer);
  S.refreshTimer = setTimeout(refresh, ms);
}

async function act(patch, call, doneMessage = 'Comando enviado') {
  const before = { ...S.ac };
  Object.assign(S.ac, patch);
  render();
  setStatus('Enviando…');
  const res = await call();
  if (!res.ok) {
    S.ac = before;
    render();
    showError(res);
    return;
  }
  setStatus(doneMessage);
  scheduleRefresh();
}

function setTarget(value) {
  if (!canTemp()) return;
  const v = snap(value);
  if (v === shownTarget()) return;
  S.pendingTemp = v;
  render();
  clearTimeout(S.tempTimer);
  S.tempTimer = setTimeout(sendTemp, TEMP_DEBOUNCE_MS);
}

async function sendTemp() {
  S.tempTimer = null;
  const v = S.pendingTemp;
  if (v === null) return;
  setStatus('Enviando…');
  const res = await api.setTemp(S.deviceId, S.ac.mode, v, S.ac.unit);
  S.pendingTemp = null;
  if (res.ok) {
    S.ac.target = v;
    setStatus(`Temperatura ajustada para ${fmt(v)}°`);
    scheduleRefresh();
  } else {
    showError(res);
  }
  render();
}

function stepTemp(dir) {
  const t = shownTarget();
  if (t === null) return;
  setTarget(t + dir * range().step);
}

async function refresh() {
  if (!S.deviceId || S.pendingTemp !== null) return;
  const btn = $('refresh');
  btn.classList.add('spinning');
  const res = await api.state(S.deviceId);
  btn.classList.remove('spinning');
  if (!res.ok) return showError(res);
  if (S.pendingTemp !== null) return;
  S.ac = res.data;
  render();
  stamp();
}

function startPolling() {
  clearInterval(S.pollTimer);
  S.pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, POLL_MS);
}

/* ---------- aparelhos ---------- */

function fillDevices(list) {
  S.devices = list;
  const sel = $('device-select');
  sel.innerHTML = '';
  for (const d of list) {
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = d.name;
    sel.appendChild(o);
  }
  sel.disabled = list.length < 2;
  if (list.length === 0) {
    const o = document.createElement('option');
    o.textContent = 'Sem aparelhos';
    sel.appendChild(o);
  }
}

async function loadDevices(list) {
  setView('loading');
  setStatus('Procurando aparelhos…');
  if (!list) {
    const res = await api.listDevices();
    if (!res.ok) {
      showEmpty('Não foi possível conectar', res.message);
      return showError(res);
    }
    list = res.data;
  }
  fillDevices(list);
  if (list.length === 0) {
    showEmpty('Nenhum ar-condicionado encontrado', 'Confira se ele aparece no app LG ThinQ do celular com a mesma conta do token.');
    setStatus('Nenhum aparelho');
    return;
  }
  const saved = list.find((d) => d.id === S.config?.deviceId);
  await openDevice((saved || list[0]).id);
}

function showEmpty(title, text) {
  $('empty-title').textContent = title;
  $('empty-text').textContent = text;
  setView('empty');
}

async function openDevice(id) {
  S.deviceId = id;
  $('device-select').value = id;
  api.selectDevice(id);
  if (S.config) S.config.deviceId = id;
  setView('loading');
  setStatus('Lendo o aparelho…');
  const res = await api.load(id);
  if (!res.ok) {
    showEmpty('O aparelho não respondeu', res.message);
    return showError(res);
  }
  S.caps = res.data.caps;
  S.ac = res.data.state;
  S.pendingTemp = null;
  ticksFor = '';
  buildSegments();
  setView('ready');
  render();
  stamp();
  startPolling();
}

/* ---------- configurações ---------- */

let sheetForced = false;

function openSettings({ force = false } = {}) {
  sheetForced = force;
  $('token').value = '';
  $('token').placeholder = S.config?.hasToken ? 'Deixe em branco para manter o atual' : 'Cole o token aqui';
  $('country').value = S.config?.country || 'BR';
  $('form-error').hidden = true;
  $('close-settings').hidden = force;
  $('remove-token').hidden = !S.config?.hasToken || S.config?.demo;
  $('form-note').textContent = S.config?.encrypted === false
    ? 'O token fica salvo só neste computador. Este sistema não oferece cofre de senhas, então ele não é criptografado.'
    : 'O token fica salvo só neste computador, criptografado pelo sistema.';
  $('sheet').hidden = false;
  setTimeout(() => $('token').focus(), 50);
}

function closeSettings() {
  if (sheetForced) return;
  $('sheet').hidden = true;
}

async function saveSettings(e) {
  e.preventDefault();
  const token = $('token').value.trim();
  const country = $('country').value.trim().toUpperCase();
  const err = $('form-error');
  err.hidden = true;

  if (!token && !S.config?.hasToken) {
    err.textContent = 'Cole o token gerado na página da LG.';
    err.hidden = false;
    return;
  }
  if (!/^[A-Z]{2}$/.test(country)) {
    err.textContent = 'Use o código do país com duas letras, como BR.';
    err.hidden = false;
    return;
  }

  const btn = $('save-settings');
  btn.disabled = true;
  btn.textContent = 'Conectando…';
  const res = await api.saveConfig({ token, country });
  btn.disabled = false;
  btn.textContent = 'Conectar';

  if (!res.ok) {
    err.textContent = res.message;
    err.hidden = false;
    return;
  }
  S.config = { ...S.config, hasToken: true, country };
  sheetForced = false;
  $('sheet').hidden = true;
  await loadDevices(res.data);
}

async function removeToken() {
  await api.clearConfig();
  clearInterval(S.pollTimer);
  S.config = { ...S.config, hasToken: false, deviceId: null };
  S.ac = null;
  fillDevices([]);
  showEmpty('Conecte sua conta LG', 'Salve um token para controlar seu ar-condicionado.');
  setStatus('Sem token');
  openSettings({ force: true });
}

/* ---------- eventos ---------- */

function pointerToValue(e) {
  const rect = $('dial').getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 300 - CX;
  const y = ((e.clientY - rect.top) / rect.height) * 300 - CY;
  let a = (Math.atan2(y, x) * 180) / Math.PI - START;
  while (a < 0) a += 360;
  if (a > SWEEP) a = a > SWEEP + (360 - SWEEP) / 2 ? 0 : SWEEP;
  const { min, max } = range();
  return min + (a / SWEEP) * (max - min);
}

function bindEvents() {
  const dial = $('dial');
  let dragging = false;

  dial.addEventListener('pointerdown', (e) => {
    if (!canTemp()) return;
    dragging = true;
    dial.setPointerCapture(e.pointerId);
    setTarget(pointerToValue(e));
  });
  dial.addEventListener('pointermove', (e) => dragging && setTarget(pointerToValue(e)));
  const stop = () => (dragging = false);
  dial.addEventListener('pointerup', stop);
  dial.addEventListener('pointercancel', stop);

  dial.addEventListener('wheel', (e) => {
    e.preventDefault();
    stepTemp(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });

  dial.addEventListener('keydown', (e) => {
    const map = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
    if (map[e.key]) {
      e.preventDefault();
      stepTemp(map[e.key]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setTarget(range().min);
    } else if (e.key === 'End') {
      e.preventDefault();
      setTarget(range().max);
    }
  });

  $('temp-up').addEventListener('click', () => stepTemp(1));
  $('temp-down').addEventListener('click', () => stepTemp(-1));

  $('power').addEventListener('click', () => {
    const on = !S.ac.power;
    act({ power: on }, () => api.setPower(S.deviceId, on), on ? 'Ligado' : 'Desligado');
  });

  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.value === S.ac.mode) return;
    const mode = b.dataset.value;
    act({ mode }, () => api.setMode(S.deviceId, mode), `Modo ${(MODES[mode]?.label || titleCase(mode)).toLowerCase()}`);
  });

  $('fans').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.value === S.ac.fan) return;
    const fan = b.dataset.value;
    act({ fan }, () => api.setFan(S.deviceId, fan), `Ventilação ${(FANS[fan] || titleCase(fan)).toLowerCase()}`);
  });

  $('device-select').addEventListener('change', (e) => openDevice(e.target.value));
  $('refresh').addEventListener('click', () => (S.deviceId ? refresh() : loadDevices()));
  $('empty-retry').addEventListener('click', () => (S.config?.hasToken ? loadDevices() : openSettings({ force: true })));

  $('open-settings').addEventListener('click', () => openSettings({ force: !S.config?.hasToken }));
  $('close-settings').addEventListener('click', closeSettings);
  $('settings-form').addEventListener('submit', saveSettings);
  $('remove-token').addEventListener('click', removeToken);
  $('open-pat').addEventListener('click', () => api.openTokenPage());
  $('sheet').addEventListener('click', (e) => e.target === e.currentTarget && closeSettings());
  document.addEventListener('keydown', (e) => e.key === 'Escape' && !$('sheet').hidden && closeSettings());

  window.addEventListener('focus', () => S.deviceId && refresh());
}

/* ---------- início ---------- */

async function init() {
  if (api.platform === 'darwin') body.classList.add('mac');
  bindEvents();
  drawDial();
  const res = await api.getConfig();
  S.config = res.ok ? res.data : { hasToken: false };
  if (!S.config.hasToken) {
    fillDevices([]);
    showEmpty('Conecte sua conta LG', 'Salve um token para controlar seu ar-condicionado.');
    setStatus('Sem token');
    openSettings({ force: true });
    return;
  }
  await loadDevices();
}

init();
