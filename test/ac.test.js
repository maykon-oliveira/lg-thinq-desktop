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
