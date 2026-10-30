const test = require('node:test');
const assert = require('node:assert/strict');
const { ThinQClient, ThinQError, friendlyMessage } = require('../src/main/thinq');

function fakeFetch(responder) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = responder(url, init) || {};
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test('usa o servidor da região do país (BR → aic)', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { response: [] } }));
  const c = new ThinQClient({ token: 'abc', country: 'br', fetchImpl });
  await c.listDevices();
  assert.equal(fetchImpl.calls[0].url, 'https://api-aic.lgthinq.com/devices');
});

test('envia os cabeçalhos exigidos pela API', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { response: [] } }));
  const c = new ThinQClient({ token: 'abc', country: 'BR', clientId: 'cid', fetchImpl });
  await c.listDevices();
  const h = fetchImpl.calls[0].init.headers;
  assert.equal(h.Authorization, 'Bearer abc');
  assert.equal(h['x-country'], 'BR');
  assert.equal(h['x-client-id'], 'cid');
  assert.equal(h['x-service-phase'], 'OP');
  assert.ok(h['x-api-key']);
  assert.match(h['x-message-id'], /^[A-Za-z0-9_-]{22}$/);
});

test('cada requisição tem um x-message-id novo', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { response: {} } }));
  const c = new ThinQClient({ token: 'abc', country: 'BR', fetchImpl });
  await c.getState('d1');
  await c.getState('d1');
  const [a, b] = fetchImpl.calls.map((x) => x.init.headers['x-message-id']);
  assert.notEqual(a, b);
});

test('controle usa POST com x-conditional-control e corpo JSON', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { response: {} } }));
  const c = new ThinQClient({ token: 'abc', country: 'BR', fetchImpl });
  await c.control('d 1', { airConJobMode: { currentJobMode: 'COOL' } });
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api-aic.lgthinq.com/devices/d%201/control');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['x-conditional-control'], 'true');
  assert.deepEqual(JSON.parse(init.body), { airConJobMode: { currentJobMode: 'COOL' } });
});

test('erro da API vira ThinQError com código', async () => {
  const fetchImpl = fakeFetch(() => ({ status: 400, body: { error: { code: '1103', message: 'Invalid token' } } }));
  const c = new ThinQClient({ token: 'abc', country: 'BR', fetchImpl });
  await assert.rejects(c.listDevices(), (err) => err instanceof ThinQError && err.code === '1103');
});

test('ligar um ar já ligado (2302) não é erro; desligar já desligado (2304) também não', async () => {
  let code = '2302';
  const fetchImpl = fakeFetch(() => ({ status: 400, body: { error: { code, message: 'x' } } }));
  const c = new ThinQClient({ token: 'abc', country: 'BR', fetchImpl });
  assert.equal(await c.setPower('d', true), null);
  code = '2304';
  assert.equal(await c.setPower('d', false), null);
  code = '2302';
  await assert.rejects(c.setPower('d', false));
});

test('falha de rede vira mensagem clara', async () => {
  const c = new ThinQClient({ token: 'abc', country: 'BR', fetchImpl: async () => { throw new Error('ECONNRESET'); } });
  await assert.rejects(c.listDevices(), (err) => err.code === 'network');
});

test('país inexistente é recusado', () => {
  assert.throws(() => new ThinQClient({ token: 'abc', country: 'ZZ' }), (err) => err.code === 'bad_country');
});

test('mensagens amigáveis em português', () => {
  assert.match(friendlyMessage({ code: '1103' }), /Token inválido/);
  assert.match(friendlyMessage({ code: '1308' }), /permissão de controle/);
  assert.match(friendlyMessage({ code: '9999', message: 'Outro' }), /Outro/);
});
