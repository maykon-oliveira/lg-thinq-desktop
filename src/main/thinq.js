// Cliente mínimo da API oficial LG ThinQ Connect.
// Referência: SDK oficial `thinqconnect` (LG Electronics, Apache-2.0).

const crypto = require('node:crypto');
const { regionFor } = require('./regions');

// Chave pública da API, a mesma distribuída no SDK oficial.
const API_KEY = 'v6GFvkweNo7DK7yD3ylIZ9w52aKBU0eJ7wLXkSR3';

// Ligar um ar já ligado devolve 2302; desligar um já desligado devolve 2304.
// O SDK oficial e o Home Assistant tratam esses casos como sucesso.
const ALREADY_ON = '2302';
const ALREADY_OFF = '2304';

class ThinQError extends Error {
  constructor(code, message, status) {
    super(message || 'Erro desconhecido da API ThinQ');
    this.name = 'ThinQError';
    this.code = String(code ?? 'unknown');
    this.status = status;
  }
}

function messageId() {
  // Mesmo formato do SDK: UUID4 em base64 url-safe sem o padding final.
  return crypto.randomBytes(16).toString('base64url').slice(0, 22);
}

class ThinQClient {
  constructor({ token, country, clientId, fetchImpl = globalThis.fetch, baseUrl } = {}) {
    if (!token) throw new ThinQError('no_token', 'Informe o token pessoal (PAT).');
    const region = regionFor(country);
    if (!region && !baseUrl) throw new ThinQError('bad_country', `País não suportado: ${country}`);
    this.token = token;
    this.country = String(country).toUpperCase();
    this.clientId = clientId || crypto.randomUUID();
    this.fetch = fetchImpl;
    this.baseUrl = baseUrl || `https://api-${region}.lgthinq.com`;
  }

  headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      'x-country': this.country,
      'x-message-id': messageId(),
      'x-client-id': this.clientId,
      'x-api-key': API_KEY,
      'x-service-phase': 'OP',
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  async request(method, path, { body, headers } = {}) {
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/${path}`, {
        method,
        headers: this.headers(headers),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw new ThinQError('network', 'Sem conexão com a nuvem da LG. Verifique a internet.');
    }

    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* resposta sem corpo JSON */
    }

    if (!res.ok) {
      const e = payload?.error || {};
      throw new ThinQError(e.code ?? res.status, e.message || `HTTP ${res.status}`, res.status);
    }
    return payload?.response ?? payload;
  }

  listDevices() {
    return this.request('GET', 'devices');
  }

  getProfile(deviceId) {
    return this.request('GET', `devices/${encodeURIComponent(deviceId)}/profile`);
  }

  getState(deviceId) {
    return this.request('GET', `devices/${encodeURIComponent(deviceId)}/state`);
  }

  control(deviceId, payload) {
    return this.request('POST', `devices/${encodeURIComponent(deviceId)}/control`, {
      body: payload,
      headers: { 'x-conditional-control': 'true' },
    });
  }

  async setPower(deviceId, on) {
    try {
      return await this.control(deviceId, { operation: { airConOperationMode: on ? 'POWER_ON' : 'POWER_OFF' } });
    } catch (err) {
      if (err instanceof ThinQError && err.code === (on ? ALREADY_ON : ALREADY_OFF)) return null;
      throw err;
    }
  }
}

// Mensagens em português para os códigos de erro da API (lista do SDK oficial).
function friendlyMessage(err) {
  const code = String(err?.code ?? '');
  if (['1103', '1218', '1302'].includes(code) || err?.status === 401) {
    return 'Token inválido ou expirado. Gere um novo token e salve nas configurações.';
  }
  const map = {
    network: 'Sem conexão com a nuvem da LG. Verifique a internet.',
    bad_country: 'País não suportado pela API da LG.',
    1307: 'Esse país não é aceito para o seu token. Confira o país nas configurações.',
    1308: 'O token não tem permissão de controle. Gere outro marcando "All device control rights".',
    1306: 'Limite de chamadas da LG atingido. Aguarde alguns minutos.',
    1205: 'Aparelho não encontrado na sua conta LG.',
    1222: 'O aparelho está offline. Ele está na tomada e no Wi-Fi?',
    2209: 'O aparelho demorou para responder. Tente de novo.',
    2301: 'O controle remoto está desativado no aparelho.',
    2302: 'Esse comando não está disponível agora.',
    2304: 'Ligue o ar-condicionado antes de mudar isso.',
    2305: 'Esse ajuste não está disponível neste modo.',
  };
  return map[code] || err?.message || 'Algo deu errado.';
}

module.exports = { ThinQClient, ThinQError, API_KEY, messageId, friendlyMessage };
