const test = require('node:test');
const assert = require('node:assert/strict');
const ac = require('../src/main/ac');

const enumProp = (list, mode = ['r', 'w']) => ({ type: 'enum', mode, value: { r: list, w: mode.includes('w') ? list : [] } });

const profile = {
  property: {
    airConJobMode: { currentJobMode: enumProp(['COOL', 'AIR_DRY', 'FAN']) },
    operation: { airConOperationMode: enumProp(['POWER_ON', 'POWER_OFF']) },
    airFlow: { windStrength: enumProp(['LOW', 'MID', 'HIGH']) },
    temperatureInUnits: [
      { unit: 'F', targetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 64, max: 86, step: 1 } } } },
      { unit: 'C', targetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 16, max: 30, step: 0.5 } } } },
    ],
  },
};

const state = {
  operation: { airConOperationMode: 'POWER_ON' },
  airConJobMode: { currentJobMode: 'COOL' },
  airFlow: { windStrength: 'HIGH' },
  temperatureInUnits: [
    { unit: 'F', currentTemperature: 79, targetTemperature: 72 },
    { unit: 'C', currentTemperature: 26, targetTemperature: 22.5 },
  ],
};

test('filtra só ares-condicionados da lista de aparelhos', () => {
  const list = ac.airConditioners([
    { deviceId: 'a', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'Sala', modelName: 'X' } },
    { deviceId: 'b', deviceInfo: { deviceType: 'DEVICE_WASHER', alias: 'Lavadora' } },
  ]);
  assert.deepEqual(list, [{ id: 'a', name: 'Sala', model: 'X' }]);
});

test('lê capacidades do profile (modos, ventilação, faixa em °C)', () => {
  const caps = ac.parseProfile(profile);
  assert.deepEqual(caps.modes, ['COOL', 'AIR_DRY', 'FAN']);
  assert.deepEqual(caps.fans, ['LOW', 'MID', 'HIGH']);
  assert.equal(caps.canPower, true);
  assert.equal(caps.tempResource, 'temperatureInUnits');
  assert.deepEqual(caps.temps.targetTemperature, { min: 16, max: 30, step: 0.5 });
});

test('lê o estado em °C', () => {
  const s = ac.parseState(state, ac.parseProfile(profile));
  assert.equal(s.power, true);
  assert.equal(s.mode, 'COOL');
  assert.equal(s.fan, 'HIGH');
  assert.equal(s.current, 26);
  assert.equal(s.target, 22.5);
  assert.equal(s.unit, 'C');
});

test('aceita o formato antigo com o recurso "temperature"', () => {
  const oldProfile = {
    property: {
      temperature: { unit: 'C', targetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 18, max: 30, step: 1 } } } },
    },
  };
  const caps = ac.parseProfile(oldProfile);
  assert.equal(caps.tempResource, 'temperature');
  const s = ac.parseState({ temperature: { currentTemperature: 27, targetTemperature: 24, unit: 'C' } }, caps);
  assert.equal(s.target, 24);
  assert.deepEqual(ac.tempPayload(caps, 'COOL', 24), { temperature: { targetTemperature: 24, unit: 'C' } });
});

test('usa coolTargetTemperature quando só ela é gravável', () => {
  const p = {
    property: {
      temperatureInUnits: [
        {
          unit: 'C',
          targetTemperature: { type: 'range', mode: ['r'] },
          coolTargetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 18, max: 30, step: 1 } } },
        },
      ],
    },
  };
  const caps = ac.parseProfile(p);
  assert.equal(ac.tempKeyFor(caps, 'COOL'), 'coolTargetTemperature');
  assert.deepEqual(ac.tempPayload(caps, 'COOL', 21), { temperatureInUnits: { coolTargetTemperature: 21, unit: 'C' } });
});

test('ajusta a temperatura ao passo e aos limites', () => {
  const r = { min: 16, max: 30, step: 0.5 };
  assert.equal(ac.snapTemp(22.3, r), 22.5);
  assert.equal(ac.snapTemp(40, r), 30);
  assert.equal(ac.snapTemp(3, r), 16);
});

test('monta os payloads de controle', () => {
  const caps = ac.parseProfile(profile);
  assert.deepEqual(ac.powerPayload(true), { operation: { airConOperationMode: 'POWER_ON' } });
  assert.deepEqual(ac.modePayload('AIR_DRY'), { airConJobMode: { currentJobMode: 'AIR_DRY' } });
  assert.deepEqual(ac.fanPayload(caps, 'LOW'), { airFlow: { windStrength: 'LOW' } });
  assert.deepEqual(ac.tempPayload(caps, 'COOL', 23.2), { temperatureInUnits: { targetTemperature: 23, unit: 'C' } });
});

test('profile vazio não quebra', () => {
  const caps = ac.parseProfile({});
  const s = ac.parseState({}, caps);
  assert.equal(s.power, false);
  assert.equal(s.target, null);
  assert.throws(() => ac.tempPayload(caps, 'COOL', 22));
});

/* ---------- recursos extras ---------- */

const bool = (mode = ['r', 'w']) => ({ type: 'boolean', mode, value: { r: [true, false], w: [true, false] } });
const num = (mode = ['r', 'w']) => ({ type: 'range', mode, value: { w: { min: 0, max: 23, step: 1 } } });
const ro = { type: 'number', mode: ['r'] };

const fullProfile = {
  property: {
    ...profile.property,
    operation: { ...profile.property.operation, airCleanOperationMode: enumProp(['START', 'STOP']) },
    windDirection: { rotateUpDown: bool(), rotateLeftRight: bool(['r']) },
    powerSave: { powerSaveEnabled: bool() },
    display: { light: enumProp(['ON', 'OFF']) },
    sleepTimer: { relativeHourToStop: num(), relativeMinuteToStop: num(), relativeStopTimer: enumProp(['SET', 'UNSET']) },
    timer: {
      relativeHourToStart: num(), relativeMinuteToStart: num(),
      relativeHourToStop: num(), relativeMinuteToStop: num(),
      absoluteHourToStop: num(), absoluteMinuteToStop: num(),
      absoluteStopTimer: enumProp(['SET', 'UNSET']),
    },
    filterInfo: { usedTime: ro, filterLifetime: ro },
    airQualitySensor: { PM2: ro, humidity: ro, totalPollutionLevel: { type: 'enum', mode: ['r'] } },
    twoSetTemperatureInUnits: [
      {
        unit: 'C',
        twoSetEnabled: bool(['r']),
        heatTargetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 16, max: 26, step: 1 } } },
        coolTargetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 20, max: 30, step: 1 } } },
      },
    ],
  },
};

test('lê os recursos extras do profile', () => {
  const x = ac.parseProfile(fullProfile).extras;
  assert.equal(x.any, true);
  assert.equal(x.swingV, true);
  assert.equal(x.swingH, false, 'só leitura não vira controle');
  assert.equal(x.powerSave, true);
  assert.equal(x.airClean, true);
  assert.deepEqual(x.light, ['ON', 'OFF']);
  assert.equal(x.sleepTimer, true);
  assert.equal(x.timerStart, true);
  assert.equal(x.timerStop, true);
  assert.equal(x.alarmStart, false);
  assert.equal(x.alarmStop, true);
  assert.deepEqual(x.cancel, { sleepTimer: true, timerStart: false, timerStop: false, alarmStart: false, alarmStop: true });
  assert.equal(x.filter, true);
  assert.deepEqual(x.air, ['pm25', 'humidity', 'total']);
  assert.deepEqual(x.twoSet, {
    resource: 'twoSetTemperatureInUnits',
    heat: { min: 16, max: 26, step: 1 },
    cool: { min: 20, max: 30, step: 1 },
  });
});

test('sem recursos extras no profile, nada aparece', () => {
  const x = ac.parseProfile(profile).extras;
  assert.equal(x.any, false);
  assert.deepEqual(x.light, []);
  assert.deepEqual(x.air, []);
  assert.equal(x.twoSet, null);
  const s = ac.parseState(state, ac.parseProfile(profile)).extras;
  assert.equal(s.sleepTimer, null);
  assert.equal(s.filter, null);
  assert.equal(s.air, null);
  assert.equal(s.twoSet, null);
});

test('lê o estado dos recursos extras', () => {
  const caps = ac.parseProfile(fullProfile);
  const s = ac.parseState(
    {
      ...state,
      operation: { airConOperationMode: 'POWER_ON', airCleanOperationMode: 'START' },
      windDirection: { rotateUpDown: true, rotateLeftRight: false },
      powerSave: { powerSaveEnabled: true },
      display: { light: 'OFF' },
      sleepTimer: { relativeStopTimer: 'SET', relativeHourToStop: 1, relativeMinuteToStop: 30 },
      timer: {
        relativeStartTimer: 'UNSET', relativeHourToStart: 2, relativeMinuteToStart: 0,
        relativeHourToStop: 0, relativeMinuteToStop: 0,
        absoluteStopTimer: 'SET', absoluteHourToStop: 7, absoluteMinuteToStop: 5,
      },
      filterInfo: { usedTime: 1500, filterLifetime: 2000 },
      airQualitySensor: { PM2: 12, humidity: 55, totalPollutionLevel: 'GOOD' },
      twoSetTemperatureInUnits: [{ unit: 'C', twoSetEnabled: true, heatTargetTemperature: 20, coolTargetTemperature: 26 }],
    },
    caps,
  ).extras;
  assert.equal(s.swingV, true);
  assert.equal(s.swingH, false);
  assert.equal(s.powerSave, true);
  assert.equal(s.airClean, true);
  assert.equal(s.light, 'OFF');
  assert.equal(s.sleepTimer, 90);
  assert.equal(s.timerStart, null, 'UNSET ganha das horas');
  assert.equal(s.timerStop, null, 'zero é inativo');
  assert.equal(s.alarmStop, '07:05');
  assert.equal(s.alarmStart, null);
  assert.deepEqual(s.filter, { percent: 25, used: 1500, lifetime: 2000 });
  assert.deepEqual(s.air, { pm25: 12, humidity: 55, total: 'GOOD' });
  assert.deepEqual(s.twoSet, { enabled: true, heat: 20, cool: 26 });
});

test('monta os payloads dos recursos extras', () => {
  const caps = ac.parseProfile(fullProfile);
  const p = (f, v) => ac.extraPayload(caps, f, v);
  assert.deepEqual(p('swingV', true), { windDirection: { rotateUpDown: true } });
  assert.deepEqual(p('powerSave', false), { powerSave: { powerSaveEnabled: false } });
  assert.deepEqual(p('airClean', true), { operation: { airCleanOperationMode: 'START' } });
  assert.deepEqual(p('light', 'OFF'), { display: { light: 'OFF' } });
  assert.deepEqual(p('sleepTimer', 90), { sleepTimer: { relativeHourToStop: 1, relativeMinuteToStop: 30 } });
  assert.deepEqual(p('sleepTimer', 0), { sleepTimer: { relativeStopTimer: 'UNSET' } });
  assert.deepEqual(p('timerStart', 0), { timer: { relativeHourToStart: 0, relativeMinuteToStart: 0 } }, 'sem flag, cancela com zero');
  assert.deepEqual(p('timerStop', 120), { timer: { relativeHourToStop: 2, relativeMinuteToStop: 0 } });
  assert.deepEqual(p('alarmStop', '23:45'), { timer: { absoluteHourToStop: 23, absoluteMinuteToStop: 45 } });
  assert.deepEqual(p('alarmStop', null), { timer: { absoluteStopTimer: 'UNSET' } });
  assert.deepEqual(p('twoSetHeat', 30), { twoSetTemperatureInUnits: { heatTargetTemperature: 26, unit: 'C' } });
  assert.deepEqual(p('twoSetCool', 24.4), { twoSetTemperatureInUnits: { coolTargetTemperature: 24, unit: 'C' } });
});

test('recusa recursos e valores que o aparelho não aceita', () => {
  const full = ac.parseProfile(fullProfile);
  const basic = ac.parseProfile(profile);
  assert.throws(() => ac.extraPayload(full, 'swingH', true), /não tem esse ajuste/);
  assert.throws(() => ac.extraPayload(full, 'light', 'LEVEL_9'));
  assert.throws(() => ac.extraPayload(full, 'alarmStart', '08:00'));
  assert.throws(() => ac.extraPayload(full, 'alarmStop', '25:00'), /Horário inválido/);
  assert.throws(() => ac.extraPayload(full, 'sleepTimer', -5), /Tempo inválido/);
  assert.throws(() => ac.extraPayload(full, 'sleepTimer', 1.5));
  assert.throws(() => ac.extraPayload(full, 'operation', {}));
  assert.throws(() => ac.extraPayload(basic, 'powerSave', true));
  assert.throws(() => ac.extraPayload(basic, 'twoSetHeat', 20));
});
