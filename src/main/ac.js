// Traduz o "profile" e o "state" do ar-condicionado (formato ThinQ Connect)
// em um modelo simples para a interface, e monta os payloads de controle.
// Funções puras: sem rede, fáceis de testar.

const AC_TYPES = new Set(['DEVICE_AIR_CONDITIONER']);
const TEMP_KEYS = ['targetTemperature', 'coolTargetTemperature', 'heatTargetTemperature', 'autoTargetTemperature'];
const MODE_TEMP_KEY = { COOL: 'coolTargetTemperature', HEAT: 'heatTargetTemperature', AUTO: 'autoTargetTemperature' };
const DEFAULT_RANGE = { min: 18, max: 30, step: 1 };

const isWritable = (p) => !!p && typeof p === 'object' && Array.isArray(p.mode) && p.mode.includes('w');

function values(p) {
  if (!p || typeof p !== 'object' || !p.value) return [];
  const v = isWritable(p) ? p.value.w : p.value.r;
  return Array.isArray(v) ? v : [];
}

// Valores aceitos por uma propriedade; booleanos às vezes vêm sem a lista.
function options(p) {
  const list = values(p);
  return list.length === 0 && p?.type === 'boolean' ? [true, false] : list;
}

function pickUnitEntry(list, unit = 'C') {
  if (!Array.isArray(list)) return list && typeof list === 'object' ? list : null;
  return list.find((t) => t && t.unit === unit) || list[0] || null;
}

function rangeOf(p) {
  const r = p?.value?.w || p?.value?.r || {};
  return {
    min: Number.isFinite(r.min) ? r.min : DEFAULT_RANGE.min,
    max: Number.isFinite(r.max) ? r.max : DEFAULT_RANGE.max,
    step: Number.isFinite(r.step) && r.step > 0 ? r.step : DEFAULT_RANGE.step,
  };
}

// Timers relativos: [recurso, sufixo das propriedades]. Ex.: relativeHourToStop.
const RELATIVE_TIMERS = {
  sleepTimer: ['sleepTimer', 'Stop'],
  timerStart: ['timer', 'Start'],
  timerStop: ['timer', 'Stop'],
};
const ABSOLUTE_TIMERS = { alarmStart: 'Start', alarmStop: 'Stop' };
const MAX_TIMER_MIN = 24 * 60;

// PM2 na API é o PM2.5.
const AIR_KEYS = { PM1: 'pm1', PM2: 'pm25', PM10: 'pm10', humidity: 'humidity', odorLevel: 'odor', totalPollutionLevel: 'total' };

// Recursos além de liga/modo/temperatura/ventilação. Só entra o que o profile tem.
function parseExtras(prop) {
  const wd = prop.windDirection || {};
  const timer = prop.timer || {};
  const sleep = prop.sleepTimer || {};
  const filter = prop.filterInfo || {};
  const air = prop.airQualitySensor || {};
  const twoSetResource = ['twoSetTemperatureInUnits', 'twoSetTemperature'].find((k) => prop[k]) || null;
  const two = (twoSetResource && pickUnitEntry(prop[twoSetResource])) || {};

  const x = {
    swingV: isWritable(wd.rotateUpDown),
    swingH: isWritable(wd.rotateLeftRight),
    powerSave: isWritable(prop.powerSave?.powerSaveEnabled),
    airClean: isWritable(prop.operation?.airCleanOperationMode),
    light: isWritable(prop.display?.light) ? options(prop.display.light) : [],
    sleepTimer: isWritable(sleep.relativeHourToStop),
    timerStart: isWritable(timer.relativeHourToStart),
    timerStop: isWritable(timer.relativeHourToStop),
    alarmStart: isWritable(timer.absoluteHourToStart),
    alarmStop: isWritable(timer.absoluteHourToStop),
    // Cancelar com SET/UNSET quando o profile permite; senão, hora e minuto em 0.
    cancel: {
      sleepTimer: isWritable(sleep.relativeStopTimer),
      timerStart: isWritable(timer.relativeStartTimer),
      timerStop: isWritable(timer.relativeStopTimer),
      alarmStart: isWritable(timer.absoluteStartTimer),
      alarmStop: isWritable(timer.absoluteStopTimer),
    },
    filter: !!(filter.filterRemainPercent || (filter.usedTime && filter.filterLifetime)),
    air: Object.keys(AIR_KEYS).filter((k) => air[k]).map((k) => AIR_KEYS[k]),
    twoSet:
      twoSetResource && (isWritable(two.heatTargetTemperature) || isWritable(two.coolTargetTemperature))
        ? {
            resource: twoSetResource,
            heat: isWritable(two.heatTargetTemperature) ? rangeOf(two.heatTargetTemperature) : null,
            cool: isWritable(two.coolTargetTemperature) ? rangeOf(two.coolTargetTemperature) : null,
          }
        : null,
  };
  x.any = Object.entries(x).some(([k, v]) => k !== 'cancel' && (Array.isArray(v) ? v.length > 0 : !!v));
  return x;
}

function airConditioners(deviceList) {
  return (Array.isArray(deviceList) ? deviceList : [])
    .filter((d) => AC_TYPES.has(d?.deviceInfo?.deviceType))
    .map((d) => ({
      id: d.deviceId,
      name: d.deviceInfo.alias || d.deviceInfo.modelName || 'Ar-condicionado',
      model: d.deviceInfo.modelName || '',
    }));
}

function parseProfile(profile) {
  const prop = profile?.property ?? profile ?? {};
  const tempResource = prop.temperatureInUnits ? 'temperatureInUnits' : 'temperature';
  const tempProfile = pickUnitEntry(prop[tempResource]) || {};

  const temps = {};
  for (const key of TEMP_KEYS) {
    const p = tempProfile[key];
    if (isWritable(p)) temps[key] = rangeOf(p);
  }

  const airFlow = prop.airFlow || {};
  const fanKey = airFlow.windStrengthDetail ? 'windStrengthDetail' : 'windStrength';

  return {
    tempResource,
    temps,
    modes: values(prop.airConJobMode?.currentJobMode),
    canPower: isWritable(prop.operation?.airConOperationMode),
    fanKey,
    fans: values(airFlow[fanKey]),
    extras: parseExtras(prop),
  };
}

// Qual propriedade de temperatura usar em cada modo.
function tempKeyFor(caps, mode) {
  if (caps.temps.targetTemperature) return 'targetTemperature';
  const specific = MODE_TEMP_KEY[mode];
  if (specific && caps.temps[specific]) return specific;
  return Object.keys(caps.temps)[0] || null;
}

function parseState(state, caps) {
  const s = state || {};
  const mode = s.airConJobMode?.currentJobMode ?? null;
  const t = pickUnitEntry(s[caps.tempResource] ?? s.temperatureInUnits ?? s.temperature) || {};
  const key = tempKeyFor(caps, mode);
  const target = t[key] ?? t.targetTemperature ?? t.coolTargetTemperature ?? null;

  return {
    power: s.operation?.airConOperationMode === 'POWER_ON',
    mode,
    fan: s.airFlow?.[caps.fanKey] ?? s.airFlow?.windStrength ?? null,
    current: typeof t.currentTemperature === 'number' ? t.currentTemperature : null,
    target: typeof target === 'number' ? target : null,
    unit: t.unit || 'C',
    tempKey: key,
    range: (key && caps.temps[key]) || DEFAULT_RANGE,
    extras: parseExtrasState(s, caps.extras || {}),
  };
}

const pad2 = (n) => String(n).padStart(2, '0');

// Minutos restantes de um timer relativo, ou null se inativo.
function relativeMinutes(res, dir) {
  if (!res || res[`relative${dir}Timer`] === 'UNSET') return null;
  const total = (Number(res[`relativeHourTo${dir}`]) || 0) * 60 + (Number(res[`relativeMinuteTo${dir}`]) || 0);
  return total > 0 ? total : null;
}

// Horário "HH:MM" de um timer absoluto, ou null se inativo.
function absoluteTime(res, dir) {
  if (!res || res[`absolute${dir}Timer`] === 'UNSET') return null;
  const h = res[`absoluteHourTo${dir}`];
  const m = res[`absoluteMinuteTo${dir}`] ?? 0;
  if (!Number.isInteger(h) || h < 0 || h > 23 || !Number.isInteger(m) || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

function parseFilter(f) {
  if (!f) return null;
  let percent = typeof f.filterRemainPercent === 'number' ? f.filterRemainPercent : null;
  if (percent === null && f.filterLifetime > 0 && typeof f.usedTime === 'number') {
    percent = Math.round(100 - (f.usedTime / f.filterLifetime) * 100);
  }
  if (percent === null) return null;
  return {
    percent: Math.min(100, Math.max(0, percent)),
    used: typeof f.usedTime === 'number' ? f.usedTime : null,
    lifetime: typeof f.filterLifetime === 'number' ? f.filterLifetime : null,
  };
}

function parseAir(a) {
  if (!a) return null;
  const out = {};
  for (const [key, name] of Object.entries(AIR_KEYS)) {
    if (typeof a[key] === 'number' || typeof a[key] === 'string') out[name] = a[key];
  }
  return Object.keys(out).length ? out : null;
}

function parseExtrasState(s, x) {
  const two = x.twoSet ? pickUnitEntry(s[x.twoSet.resource]) || {} : null;
  return {
    swingV: s.windDirection?.rotateUpDown === true,
    swingH: s.windDirection?.rotateLeftRight === true,
    powerSave: s.powerSave?.powerSaveEnabled === true,
    airClean: s.operation?.airCleanOperationMode === 'START',
    light: s.display?.light ?? null,
    sleepTimer: relativeMinutes(s.sleepTimer, 'Stop'),
    timerStart: relativeMinutes(s.timer, 'Start'),
    timerStop: relativeMinutes(s.timer, 'Stop'),
    alarmStart: absoluteTime(s.timer, 'Start'),
    alarmStop: absoluteTime(s.timer, 'Stop'),
    filter: parseFilter(s.filterInfo),
    air: parseAir(s.airQualitySensor),
    twoSet: two
      ? {
          enabled: two.twoSetEnabled === true,
          heat: typeof two.heatTargetTemperature === 'number' ? two.heatTargetTemperature : null,
          cool: typeof two.coolTargetTemperature === 'number' ? two.coolTargetTemperature : null,
        }
      : null,
  };
}

function snapTemp(value, range = DEFAULT_RANGE) {
  const { min, max, step } = range;
  const snapped = Math.round((value - min) / step) * step + min;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(1))));
}

const powerPayload = (on) => ({ operation: { airConOperationMode: on ? 'POWER_ON' : 'POWER_OFF' } });
const modePayload = (mode) => ({ airConJobMode: { currentJobMode: mode } });
const fanPayload = (caps, fan) => ({ airFlow: { [caps.fanKey]: fan } });

function tempPayload(caps, mode, value, unit = 'C') {
  const key = tempKeyFor(caps, mode);
  if (!key) throw new Error('Este aparelho não permite ajustar a temperatura.');
  const v = snapTemp(value, caps.temps[key]);
  return { [caps.tempResource]: { [key]: v, unit } };
}

// Monta o payload de um recurso extra. `feature` vem da tela, então tudo é
// validado contra as capacidades: a tela nunca manda um payload cru.
function extraPayload(caps, feature, value, unit = 'C') {
  const x = caps?.extras || {};
  const unavailable = () => new Error('Este aparelho não tem esse ajuste.');

  switch (feature) {
    case 'swingV':
    case 'swingH': {
      if (!x[feature]) throw unavailable();
      const key = feature === 'swingV' ? 'rotateUpDown' : 'rotateLeftRight';
      return { windDirection: { [key]: !!value } };
    }
    case 'powerSave':
      if (!x.powerSave) throw unavailable();
      return { powerSave: { powerSaveEnabled: !!value } };
    case 'airClean':
      if (!x.airClean) throw unavailable();
      return { operation: { airCleanOperationMode: value ? 'START' : 'STOP' } };
    case 'light':
      if (!x.light?.includes(value)) throw unavailable();
      return { display: { light: value } };
    case 'sleepTimer':
    case 'timerStart':
    case 'timerStop': {
      if (!x[feature]) throw unavailable();
      if (!Number.isInteger(value) || value < 0 || value > MAX_TIMER_MIN) throw new Error('Tempo inválido.');
      const [res, dir] = RELATIVE_TIMERS[feature];
      if (value === 0 && x.cancel?.[feature]) return { [res]: { [`relative${dir}Timer`]: 'UNSET' } };
      return { [res]: { [`relativeHourTo${dir}`]: Math.floor(value / 60), [`relativeMinuteTo${dir}`]: value % 60 } };
    }
    case 'alarmStart':
    case 'alarmStop': {
      if (!x[feature]) throw unavailable();
      const dir = ABSOLUTE_TIMERS[feature];
      if (value === null) {
        if (!x.cancel?.[feature]) throw unavailable();
        return { timer: { [`absolute${dir}Timer`]: 'UNSET' } };
      }
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value));
      if (!m) throw new Error('Horário inválido.');
      return { timer: { [`absoluteHourTo${dir}`]: Number(m[1]), [`absoluteMinuteTo${dir}`]: Number(m[2]) } };
    }
    case 'twoSetHeat':
    case 'twoSetCool': {
      const side = feature === 'twoSetHeat' ? 'heat' : 'cool';
      const range = x.twoSet?.[side];
      if (!range) throw unavailable();
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Temperatura inválida.');
      return { [x.twoSet.resource]: { [`${side}TargetTemperature`]: snapTemp(value, range), unit } };
    }
    default:
      throw unavailable();
  }
}

module.exports = {
  airConditioners,
  parseProfile,
  parseState,
  tempKeyFor,
  snapTemp,
  powerPayload,
  modePayload,
  fanPayload,
  tempPayload,
  extraPayload,
  DEFAULT_RANGE,
};
