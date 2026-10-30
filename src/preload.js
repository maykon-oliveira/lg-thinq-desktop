// Ponte segura entre a interface e o processo principal.
// A interface nunca vê o token: só chama estas funções.
const { contextBridge, ipcRenderer } = require('electron');

const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('brisa', {
  platform: process.platform,
  getConfig: () => call('config:get'),
  saveConfig: (cfg) => call('config:save', cfg),
  clearConfig: () => call('config:clear'),
  listDevices: () => call('devices:list'),
  selectDevice: (id) => call('device:select', id),
  load: (id) => call('ac:load', id),
  state: (id) => call('ac:state', id),
  setPower: (id, on) => call('ac:power', id, on),
  setMode: (id, mode) => call('ac:mode', id, mode),
  setFan: (id, fan) => call('ac:fan', id, fan),
  setTemp: (id, mode, value, unit) => call('ac:temp', id, mode, value, unit),
  openTokenPage: () => call('open:pat'),
});
