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

function pickUnitEntry(list, unit = 'C') {
  if (!Array.isArray(list)) return list && typeof list === 'object' ? list : null;
  return list.find((t) => t && t.unit === unit) || list[0] || null;
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
    if (isWritable(p)) {
      const r = p.value?.w || p.value?.r || {};
      temps[key] = {
        min: Number.isFinite(r.min) ? r.min : DEFAULT_RANGE.min,
        max: Number.isFinite(r.max) ? r.max : DEFAULT_RANGE.max,
        step: Number.isFinite(r.step) && r.step > 0 ? r.step : DEFAULT_RANGE.step,
      };
    }
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
  DEFAULT_RANGE,
};
