// Aparelhos simulados para `npm run demo`: testa a interface sem token nem ar-condicionado.
// Imitam o formato real da API. "Sala" tem todos os recursos extras; "Quarto" só o básico.

const { ThinQError } = require('./thinq');

const enumProp = (list) => ({ type: 'enum', mode: ['r', 'w'], value: { r: list, w: list } });
const boolProp = () => ({ type: 'boolean', mode: ['r', 'w'], value: { r: [true, false], w: [true, false] } });
const numProp = (min, max) => ({ type: 'range', mode: ['r', 'w'], value: { w: { min, max, step: 1 } } });
const tempProp = (min, max) => ({ type: 'range', mode: ['r', 'w'], value: { w: { min, max, step: 1 } } });
const ro = (type = 'number') => ({ type, mode: ['r'] });
const flag = () => enumProp(['SET', 'UNSET']);

const BASIC_PROFILE = {
  airConJobMode: { currentJobMode: enumProp(['COOL', 'AIR_DRY', 'FAN', 'AUTO', 'HEAT']) },
  operation: { airConOperationMode: enumProp(['POWER_ON', 'POWER_OFF']) },
  airFlow: { windStrength: enumProp(['LOW', 'MID', 'HIGH', 'AUTO']) },
  temperatureInUnits: [
    {
      unit: 'C',
      currentTemperature: ro(),
      targetTemperature: tempProp(18, 30),
    },
  ],
};

const FULL_PROFILE = {
  ...BASIC_PROFILE,
  operation: { ...BASIC_PROFILE.operation, airCleanOperationMode: enumProp(['START', 'STOP']) },
  windDirection: { rotateUpDown: boolProp(), rotateLeftRight: boolProp() },
  powerSave: { powerSaveEnabled: boolProp() },
  display: { light: enumProp(['ON', 'OFF']) },
  sleepTimer: { relativeHourToStop: numProp(0, 12), relativeMinuteToStop: numProp(0, 59), relativeStopTimer: flag() },
  timer: {
    relativeHourToStart: numProp(0, 24), relativeMinuteToStart: numProp(0, 59), relativeStartTimer: flag(),
    relativeHourToStop: numProp(0, 24), relativeMinuteToStop: numProp(0, 59), relativeStopTimer: flag(),
    absoluteHourToStart: numProp(0, 23), absoluteMinuteToStart: numProp(0, 59), absoluteStartTimer: flag(),
    absoluteHourToStop: numProp(0, 23), absoluteMinuteToStop: numProp(0, 59), absoluteStopTimer: flag(),
  },
  filterInfo: { usedTime: ro(), filterLifetime: ro(), filterRemainPercent: ro() },
  airQualitySensor: { PM1: ro(), PM2: ro(), PM10: ro(), humidity: ro(), totalPollutionLevel: ro('enum') },
  twoSetTemperatureInUnits: [
    { unit: 'C', twoSetEnabled: ro('boolean'), heatTargetTemperature: tempProp(16, 26), coolTargetTemperature: tempProp(20, 30) },
  ],
};

function basicState(power, mode, current, target) {
  return {
    operation: { airConOperationMode: power ? 'POWER_ON' : 'POWER_OFF' },
    airConJobMode: { currentJobMode: mode },
    airFlow: { windStrength: 'MID' },
    temperatureInUnits: [
      { currentTemperature: current, targetTemperature: target, unit: 'C' },
      { currentTemperature: Math.round(current * 1.8 + 32), targetTemperature: Math.round(target * 1.8 + 32), unit: 'F' },
    ],
  };
}

function fullState() {
  const s = basicState(true, 'COOL', 26.5, 23);
  return {
    ...s,
    operation: { ...s.operation, airCleanOperationMode: 'STOP' },
    windDirection: { rotateUpDown: false, rotateLeftRight: false },
    powerSave: { powerSaveEnabled: false },
    display: { light: 'ON' },
    filterInfo: { usedTime: 1840, filterLifetime: 2000, filterRemainPercent: 8 },
    airQualitySensor: { PM1: 6, PM2: 11, PM10: 18, humidity: 58, totalPollutionLevel: 'GOOD' },
    twoSetTemperatureInUnits: [{ unit: 'C', twoSetEnabled: false, heatTargetTemperature: 20, coolTargetTemperature: 26 }],
  };
}

const RELATIVE = {
  sleepStop: ['sleepTimer', 'Stop'],
  timerStart: ['timer', 'Start'],
  timerStop: ['timer', 'Stop'],
};

function createDemoClient() {
  const devices = {
    'demo-sala': { profile: FULL_PROFILE, state: fullState(), deadlines: {}, alarms: {} },
    'demo-quarto': { profile: BASIC_PROFILE, state: basicState(false, 'COOL', 27, 24), deadlines: {}, alarms: {} },
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const dev = (id) => {
    if (!devices[id]) throw new ThinQError('1205', 'Aparelho não encontrado.');
    return devices[id];
  };
  const isOn = (d) => d.state.operation.airConOperationMode === 'POWER_ON';

  function setPowerState(d, on) {
    d.state.operation.airConOperationMode = on ? 'POWER_ON' : 'POWER_OFF';
    // Como no aparelho: ligar cancela o timer de ligar; desligar cancela os de desligar.
    if (on) delete d.deadlines.timerStart;
    else {
      delete d.deadlines.sleepStop;
      delete d.deadlines.timerStop;
    }
  }

  // Timers relativos contam de verdade e agem quando terminam.
  function tick(d) {
    const now = Date.now();
    for (const [key, at] of Object.entries(d.deadlines)) {
      if (at <= now) {
        delete d.deadlines[key];
        setPowerState(d, key === 'timerStart');
      }
    }
  }

  function writeTimers(d) {
    if (!d.profile.timer) return;
    const now = Date.now();
    for (const [key, [res, dir]] of Object.entries(RELATIVE)) {
      const left = d.deadlines[key] ? Math.ceil((d.deadlines[key] - now) / 60000) : 0;
      d.state[res] = {
        ...d.state[res],
        [`relative${dir}Timer`]: left > 0 ? 'SET' : 'UNSET',
        [`relativeHourTo${dir}`]: Math.floor(left / 60),
        [`relativeMinuteTo${dir}`]: left % 60,
      };
    }
    for (const dir of ['Start', 'Stop']) {
      const a = d.alarms[dir];
      Object.assign(d.state.timer, {
        [`absolute${dir}Timer`]: a ? 'SET' : 'UNSET',
        [`absoluteHourTo${dir}`]: a ? a[0] : 0,
        [`absoluteMinuteTo${dir}`]: a ? a[1] : 0,
      });
    }
  }

  function controlTimer(d, res, props) {
    for (const [key, [r, dir]] of Object.entries(RELATIVE)) {
      if (r !== res) continue;
      const flagKey = `relative${dir}Timer`;
      const hourKey = `relativeHourTo${dir}`;
      if (!(flagKey in props) && !(hourKey in props)) continue;
      const needOn = dir === 'Stop';
      if (isOn(d) !== needOn) throw new ThinQError(needOn ? '2304' : '2305', 'Comando indisponível agora.');
      const minutes = (props[hourKey] || 0) * 60 + (props[`relativeMinuteTo${dir}`] || 0);
      if (props[flagKey] === 'UNSET' || minutes === 0) delete d.deadlines[key];
      else d.deadlines[key] = Date.now() + minutes * 60000;
    }
    if (res !== 'timer') return;
    for (const dir of ['Start', 'Stop']) {
      if (props[`absolute${dir}Timer`] === 'UNSET') delete d.alarms[dir];
      else if (`absoluteHourTo${dir}` in props) d.alarms[dir] = [props[`absoluteHourTo${dir}`], props[`absoluteMinuteTo${dir}`] || 0];
    }
  }

  return {
    async listDevices() {
      await wait(250);
      return [
        { deviceId: 'demo-sala', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'Sala', modelName: 'S3-Q12JAQAL' } },
        { deviceId: 'demo-quarto', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'Quarto', modelName: 'S4-Q09WA51A' } },
      ];
    },
    async getProfile(id) {
      await wait(200);
      return clone({ property: dev(id).profile });
    },
    async getState(id) {
      await wait(200);
      const d = dev(id);
      tick(d);
      const s = d.state;
      const c = s.temperatureInUnits[0];
      if (isOn(d) && s.airConJobMode.currentJobMode === 'COOL') {
        c.currentTemperature = Math.max(c.targetTemperature, +(c.currentTemperature - 0.1).toFixed(1));
      }
      if (s.twoSetTemperatureInUnits) s.twoSetTemperatureInUnits[0].twoSetEnabled = s.airConJobMode.currentJobMode === 'AUTO';
      writeTimers(d);
      return clone(s);
    },
    async control(id, payload) {
      await wait(300);
      const d = dev(id);
      for (const [res, props] of Object.entries(payload)) {
        if (res === 'temperatureInUnits' || res === 'twoSetTemperatureInUnits') Object.assign(d.state[res][0], props);
        else if (res === 'sleepTimer' || res === 'timer') controlTimer(d, res, props);
        else if (res === 'operation' && 'airConOperationMode' in props) setPowerState(d, props.airConOperationMode === 'POWER_ON');
        else d.state[res] = { ...d.state[res], ...props };
      }
      return {};
    },
    setPower(id, on) {
      return this.control(id, { operation: { airConOperationMode: on ? 'POWER_ON' : 'POWER_OFF' } });
    },
  };
}

module.exports = { createDemoClient };
