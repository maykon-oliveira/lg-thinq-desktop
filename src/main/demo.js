// Aparelho simulado para `npm run demo`: testa a interface sem token nem ar-condicionado.

function createDemoClient() {
  const state = {
    operation: { airConOperationMode: 'POWER_ON' },
    airConJobMode: { currentJobMode: 'COOL' },
    airFlow: { windStrength: 'MID' },
    temperatureInUnits: [
      { currentTemperature: 26.5, targetTemperature: 23, unit: 'C' },
      { currentTemperature: 80, targetTemperature: 73, unit: 'F' },
    ],
  };

  const enumProp = (list) => ({ type: 'enum', mode: ['r', 'w'], value: { r: list, w: list } });
  const profile = {
    property: {
      airConJobMode: { currentJobMode: enumProp(['COOL', 'AIR_DRY', 'FAN', 'AUTO', 'HEAT']) },
      operation: { airConOperationMode: enumProp(['POWER_ON', 'POWER_OFF']) },
      airFlow: { windStrength: enumProp(['LOW', 'MID', 'HIGH', 'AUTO']) },
      temperatureInUnits: [
        {
          unit: 'C',
          currentTemperature: { type: 'number', mode: ['r'] },
          targetTemperature: { type: 'range', mode: ['r', 'w'], value: { w: { min: 18, max: 30, step: 1 } } },
        },
      ],
    },
  };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  return {
    async listDevices() {
      await wait(250);
      return [
        { deviceId: 'demo-sala', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'Sala', modelName: 'S3-Q12JAQAL' } },
        { deviceId: 'demo-quarto', deviceInfo: { deviceType: 'DEVICE_AIR_CONDITIONER', alias: 'Quarto', modelName: 'S4-Q09WA51A' } },
      ];
    },
    async getProfile() {
      await wait(200);
      return clone(profile);
    },
    async getState() {
      await wait(200);
      const c = state.temperatureInUnits[0];
      if (state.operation.airConOperationMode === 'POWER_ON' && state.airConJobMode.currentJobMode === 'COOL') {
        c.currentTemperature = Math.max(c.targetTemperature, +(c.currentTemperature - 0.1).toFixed(1));
      }
      return clone(state);
    },
    async control(_id, payload) {
      await wait(300);
      for (const [res, props] of Object.entries(payload)) {
        if (res === 'temperatureInUnits') Object.assign(state.temperatureInUnits[0], props);
        else state[res] = { ...state[res], ...props };
      }
      return {};
    },
    setPower(id, on) {
      return this.control(id, { operation: { airConOperationMode: on ? 'POWER_ON' : 'POWER_OFF' } });
    },
  };
}

module.exports = { createDemoClient };
