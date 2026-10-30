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

const LIGHT = { ON: 'Ligada', OFF: 'Desligada', true: 'Ligada', false: 'Desligada' };
const LEVELS = {
  GOOD: 'Bom', NORMAL: 'Normal', BAD: 'Ruim', VERY_BAD: 'Muito ruim',
  WEAK: 'Fraco', STRONG: 'Forte', VERY_STRONG: 'Muito forte', INVALID: '--',
};
const AIR_LABELS = { total: 'Qualidade do ar', pm25: 'PM2,5', pm10: 'PM10', pm1: 'PM1', humidity: 'Umidade', odor: 'Odor' };

// Timers mostrados na folha Ajustes. `when: 'on'` só com o ar ligado; `'off'` só desligado.
const TIMERS = [
  { feature: 'sleepTimer', label: 'Dormir', active: 'Dormir até', when: 'on', kind: 'relative' },
  { feature: 'timerStop', label: 'Desligar em', active: 'Desliga às', when: 'on', kind: 'relative' },
  { feature: 'alarmStop', label: 'Desligar às', active: 'Desliga às', when: 'on', kind: 'absolute' },
  { feature: 'timerStart', label: 'Ligar em', active: 'Liga às', when: 'off', kind: 'relative' },
  { feature: 'alarmStart', label: 'Ligar às', active: 'Liga às', when: 'off', kind: 'absolute' },
];
const TIMER_STEPS = [30, 60, 120, 240, 360, 480];
const FILTER_WARN = 10;

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
const pad = (n) => String(n).padStart(2, '0');
const duration = (min) => (min < 60 ? `${min} min` : `${fmt(min / 60)} h`);

// Horário daqui a `min` minutos, para mostrar "desliga às 23:40".
function clockIn(min) {
  const d = new Date(Date.now() + min * 60000);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
  renderChips();
  renderExtras();
}

/* ---------- recursos extras ---------- */

const extras = () => S.ac?.extras || {};
const xcaps = () => S.caps?.extras || {};

function timerText(t, value) {
  return `${t.active} ${t.kind === 'relative' ? clockIn(value) : value}`;
}

// Linha na tela principal com o que está ativo ou pede atenção.
function renderChips() {
  const e = extras();
  const list = [];
  for (const t of TIMERS) if (e[t.feature] != null) list.push([timerText(t, e[t.feature])]);
  if (e.swingV || e.swingH) list.push(['Oscilando']);
  if (e.powerSave) list.push(['Econômico']);
  if (e.airClean) list.push(['Purificando']);
  if (e.filter && e.filter.percent <= FILTER_WARN) list.push([`Filtro ${e.filter.percent}%`, 'warn']);

  const box = $('chips');
  box.replaceChildren(
    ...list.map(([text, cls]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `chip${cls ? ` ${cls}` : ''}`;
      b.textContent = text;
      b.title = 'Abrir ajustes';
      return b;
    }),
  );
  box.hidden = list.length === 0;
}

// Monta a folha Ajustes para o aparelho atual (uma vez por aparelho).
function buildExtras() {
  const x = xcaps();
  $('open-extras').hidden = !x.any;
  if (!x.any) closeExtras();

  $('x-air').hidden = !x.filter && !(x.air?.length > 0);
  $('x-wind').hidden = !x.swingV && !x.swingH;
  $('x-options').hidden = !x.powerSave && !x.airClean && !(x.light?.length > 0);
  for (const b of $('extras').querySelectorAll('.toggle')) b.hidden = !x[b.dataset.feature];

  const light = $('x-light');
  light.querySelector('.options')?.remove();
  light.hidden = !(x.light?.length > 0);
  if (!light.hidden) {
    const wrap = document.createElement('div');
    wrap.className = 'options';
    for (const v of x.light) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = String(v);
      b.textContent = LIGHT[v] || titleCase(String(v));
      wrap.appendChild(b);
    }
    light.appendChild(wrap);
  }

  for (const row of $('x-twoset').querySelectorAll('.range-row')) row.hidden = !x.twoSet?.[row.dataset.side];

  const list = $('x-timer-list');
  list.replaceChildren();
  const timers = TIMERS.filter((t) => x[t.feature]);
  $('x-timers').hidden = timers.length === 0;
  for (const t of timers) {
    const row = document.createElement('div');
    row.className = 'timer-row';
    row.dataset.feature = t.feature;
    const label = document.createElement('p');
    label.className = 'timer-label';
    label.textContent = t.label;

    const pick = document.createElement('div');
    pick.className = 'timer-pick';
    if (t.kind === 'relative') {
      for (const m of TIMER_STEPS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.minutes = m;
        b.textContent = duration(m);
        pick.appendChild(b);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'time';
      input.required = true;
      input.setAttribute('aria-label', t.label);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.alarm = '';
      b.textContent = 'Definir';
      pick.append(input, b);
    }

    const active = document.createElement('div');
    active.className = 'timer-active';
    const text = document.createElement('span');
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'link';
    cancel.dataset.cancel = '';
    cancel.textContent = 'Cancelar';
    // Timer absoluto só cancela se o profile permitir.
    cancel.hidden = t.kind === 'absolute' && !x.cancel?.[t.feature];
    active.append(text, cancel);

    row.append(label, pick, active);
    list.appendChild(row);
  }
}

function renderExtras() {
  if ($('extras').hidden || !S.ac) return;
  const x = xcaps();
  const e = extras();
  const on = S.ac.power;

  for (const b of $('extras').querySelectorAll('.toggle')) {
    b.setAttribute('aria-pressed', String(!!e[b.dataset.feature]));
    b.disabled = !on;
  }
  for (const b of $('x-light').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.value === String(e.light)));
    b.disabled = !on;
  }

  renderStats(e);

  const two = e.twoSet;
  $('x-twoset').hidden = !x.twoSet || !two?.enabled;
  for (const row of $('x-twoset').querySelectorAll('.range-row')) {
    const side = row.dataset.side;
    const v = two?.[side];
    const r = x.twoSet?.[side];
    row.querySelector('output').textContent = typeof v === 'number' ? `${fmt(v)}°` : '--';
    const [down, up] = row.querySelectorAll('button');
    down.disabled = !on || typeof v !== 'number' || v <= r?.min;
    up.disabled = !on || typeof v !== 'number' || v >= r?.max;
  }

  let visible = 0;
  for (const row of $('x-timer-list').children) {
    const t = TIMERS.find((tt) => tt.feature === row.dataset.feature);
    row.hidden = (t.when === 'on') !== on;
    if (!row.hidden) visible++;
    const value = e[t.feature];
    const isActive = value != null;
    row.querySelector('.timer-pick').hidden = isActive;
    row.querySelector('.timer-active').hidden = !isActive;
    if (isActive) row.querySelector('.timer-active span').textContent = timerText(t, value);
  }
  const note = $('x-timer-note');
  note.hidden = visible > 0;
  note.textContent = on ? 'Desligue o ar para programar quando ele liga.' : 'Ligue o ar para programar quando ele desliga.';
}

function renderStats(e) {
  const dl = $('x-stats');
  const items = [];
  if (e.air) {
    for (const key of ['total', 'pm25', 'pm10', 'pm1', 'humidity', 'odor']) {
      const v = e.air[key];
      if (v == null) continue;
      const text = typeof v === 'number' ? (key === 'humidity' ? `${v}%` : `${v} µg/m³`) : LEVELS[v] || titleCase(String(v));
      items.push([AIR_LABELS[key], text]);
    }
  }
  if (e.filter) items.push(['Filtro', `${e.filter.percent}%`, e.filter.percent]);

  dl.replaceChildren(
    ...items.map(([label, text, percent]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = text;
      div.append(dt, dd);
      if (percent !== undefined) {
        div.className = `stat-filter${percent <= FILTER_WARN ? ' warn' : ''}`;
        const meter = document.createElement('span');
        meter.className = 'meter';
        const fill = document.createElement('i');
        fill.style.width = `${percent}%`;
        meter.appendChild(fill);
        div.appendChild(meter);
        if (percent <= FILTER_WARN) {
          const tip = document.createElement('p');
          tip.className = 'x-note';
          tip.textContent = 'Hora de limpar ou trocar o filtro.';
          div.appendChild(tip);
        }
      }
      return div;
    }),
  );
  if (items.length === 0 && !$('x-air').hidden) {
    const p = document.createElement('p');
    p.className = 'x-note';
    p.textContent = 'Sem leitura no momento.';
    dl.appendChild(p);
  }
}

function extraMessage(feature, value) {
  const onOff = value ? 'ligada' : 'desligada';
  switch (feature) {
    case 'swingV': return `Oscilação vertical ${onOff}`;
    case 'swingH': return `Oscilação horizontal ${onOff}`;
    case 'powerSave': return `Modo econômico ${value ? 'ligado' : 'desligado'}`;
    case 'airClean': return `Purificação ${onOff}`;
    case 'light': return `Luz do painel: ${(LIGHT[value] || titleCase(String(value))).toLowerCase()}`;
    case 'twoSetHeat': return `Aquece abaixo de ${fmt(value)}°`;
    case 'twoSetCool': return `Resfria acima de ${fmt(value)}°`;
    default: {
      const t = TIMERS.find((tt) => tt.feature === feature);
      if (!t) return 'Comando enviado';
      if (value === 0 || value === null) return 'Timer cancelado';
      return `${timerText(t, value)}`;
    }
  }
}

function setExtra(feature, value) {
  let patch;
  if (feature === 'twoSetHeat' || feature === 'twoSetCool') {
    const side = feature === 'twoSetHeat' ? 'heat' : 'cool';
    patch = { twoSet: { ...extras().twoSet, [side]: value } };
  } else {
    // Timer relativo em 0 significa cancelar.
    patch = { [feature]: value === 0 ? null : value };
  }
  act({ extras: { ...extras(), ...patch } }, () => api.set(S.deviceId, feature, value, S.ac.unit), extraMessage(feature, value));
}

function openExtras() {
  if (!xcaps().any) return;
  $('extras').hidden = false;
  renderExtras();
  setTimeout(() => $('close-extras').focus(), 50);
}

function closeExtras() {
  $('extras').hidden = true;
}

function bindExtras() {
  $('open-extras').addEventListener('click', openExtras);
  $('close-extras').addEventListener('click', closeExtras);
  $('chips').addEventListener('click', (e) => e.target.closest('.chip') && openExtras());
  $('extras').addEventListener('click', (e) => e.target === e.currentTarget && closeExtras());

  $('extras').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !S.ac) return;

    if (b.classList.contains('toggle')) return setExtra(b.dataset.feature, !extras()[b.dataset.feature]);

    if (b.closest('#x-light')) {
      const v = xcaps().light.find((l) => String(l) === b.dataset.value);
      if (v !== undefined && v !== extras().light) setExtra('light', v);
      return;
    }

    const range = b.closest('.range-row');
    if (range) {
      const side = range.dataset.side;
      const r = xcaps().twoSet[side];
      const cur = extras().twoSet?.[side];
      if (typeof cur !== 'number') return;
      const next = Math.min(r.max, Math.max(r.min, cur + Number(b.dataset.dir) * r.step));
      if (next !== cur) setExtra(side === 'heat' ? 'twoSetHeat' : 'twoSetCool', next);
      return;
    }

    const row = b.closest('.timer-row');
    if (!row) return;
    const t = TIMERS.find((tt) => tt.feature === row.dataset.feature);
    if (b.dataset.minutes) return setExtra(t.feature, Number(b.dataset.minutes));
    if ('cancel' in b.dataset) return setExtra(t.feature, t.kind === 'relative' ? 0 : null);
    if ('alarm' in b.dataset) {
      const input = row.querySelector('input');
      if (!input.value) {
        input.focus();
        return setStatus('Escolha um horário.', true);
      }
      setExtra(t.feature, input.value);
    }
  });
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
  buildExtras();
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
  $('open-extras').hidden = true;
  $('chips').hidden = true;
  closeExtras();
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
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('sheet').hidden) closeSettings();
    else if (!$('extras').hidden) closeExtras();
  });
  bindExtras();

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
