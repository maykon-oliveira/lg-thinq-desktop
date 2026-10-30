const path = require('node:path');
const { app, BrowserWindow, ipcMain, nativeTheme, safeStorage, shell } = require('electron');
const { ThinQClient, ThinQError, friendlyMessage } = require('./thinq');
const { Store } = require('./store');
const { createDemoClient } = require('./demo');
const ac = require('./ac');

const DEMO = process.argv.includes('--demo');
const DEV = process.argv.includes('--dev');
const PAT_URL = 'https://connect-pat.lgthinq.com';

let win;
let store;
let client = null;
const capsCache = new Map();

if (!app.requestSingleInstanceLock()) app.quit();

const titleBarColors = () =>
  nativeTheme.shouldUseDarkColors
    ? { color: '#141B22', symbolColor: '#C9D4DC', height: 40 }
    : { color: '#E6ECEF', symbolColor: '#24323C', height: 40 };

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 700,
    minWidth: 360,
    minHeight: 600,
    show: false,
    title: 'Brisa',
    icon: path.join(__dirname, '../../assets/icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141B22' : '#E6ECEF',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin' ? {} : { titleBarOverlay: titleBarColors() }),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => win.show());
  if (DEV) win.webContents.openDevTools({ mode: 'detach' });

  // Nenhuma navegação para fora do app; links externos vão para o navegador.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

nativeTheme.on('updated', () => {
  if (win && process.platform !== 'darwin') win.setTitleBarOverlay(titleBarColors());
});

function getClient() {
  if (DEMO) return (client ||= createDemoClient());
  if (client) return client;
  const token = store.getToken();
  if (!token) throw new ThinQError('no_token', 'Configure seu token para começar.');
  client = new ThinQClient({ token, country: store.get('country'), clientId: store.get('clientId') });
  return client;
}

// Respostas IPC sempre no formato { ok, data } ou { ok:false, code, message }.
function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, code: String(err.code || 'error'), message: friendlyMessage(err) };
    }
  });
}

async function capsFor(id) {
  if (!capsCache.has(id)) capsCache.set(id, ac.parseProfile(await getClient().getProfile(id)));
  return capsCache.get(id);
}

async function stateFor(id) {
  const caps = await capsFor(id);
  return ac.parseState(await getClient().getState(id), caps);
}

function registerIpc() {
  handle('config:get', () => ({
    demo: DEMO,
    hasToken: DEMO || !!store.getToken(),
    country: store.get('country') || 'BR',
    deviceId: store.get('deviceId') || null,
    encrypted: store.canEncrypt(),
  }));

  handle('config:save', async ({ token, country }) => {
    const finalToken = (token || '').trim() || store.getToken();
    const test = new ThinQClient({ token: finalToken, country, clientId: store.get('clientId') });
    const devices = ac.airConditioners(await test.listDevices());
    store.setToken(finalToken);
    store.set({ country: test.country });
    client = test;
    capsCache.clear();
    return devices;
  });

  handle('config:clear', () => {
    store.clearToken();
    client = null;
    capsCache.clear();
    return true;
  });

  handle('devices:list', async () => ac.airConditioners(await getClient().listDevices()));

  handle('device:select', (id) => {
    store.set({ deviceId: id });
    return true;
  });

  handle('ac:load', async (id) => {
    const caps = await capsFor(id);
    return { caps, state: await stateFor(id) };
  });

  handle('ac:state', (id) => stateFor(id));

  handle('ac:power', async (id, on) => {
    await getClient().setPower(id, !!on);
    return true;
  });

  handle('ac:mode', async (id, mode) => {
    await getClient().control(id, ac.modePayload(mode));
    return true;
  });

  handle('ac:fan', async (id, fan) => {
    await getClient().control(id, ac.fanPayload(await capsFor(id), fan));
    return true;
  });

  handle('ac:temp', async (id, mode, value, unit) => {
    await getClient().control(id, ac.tempPayload(await capsFor(id), mode, value, unit));
    return true;
  });

  handle('open:pat', () => shell.openExternal(PAT_URL));
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'), safeStorage);
  registerIpc();
  createWindow();
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
