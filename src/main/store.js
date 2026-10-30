// Configuração local do app. O token (PAT) é criptografado com o cofre do
// sistema operacional (DPAPI no Windows, Keychain no macOS, libsecret no Linux).

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class Store {
  constructor(dir, safeStorage) {
    this.file = path.join(dir, 'config.json');
    this.safe = safeStorage;
    this.data = this.read();
    if (!this.data.clientId) {
      this.data.clientId = crypto.randomUUID();
      this.write();
    }
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), { mode: 0o600 });
  }

  get(key) {
    return this.data[key];
  }

  set(patch) {
    Object.assign(this.data, patch);
    this.write();
  }

  canEncrypt() {
    return !!this.safe?.isEncryptionAvailable?.();
  }

  setToken(token) {
    if (this.canEncrypt()) {
      this.set({ token: this.safe.encryptString(token).toString('base64'), tokenPlain: undefined });
    } else {
      // Sem cofre do sistema disponível (ex.: Linux sem keyring): guarda localmente.
      this.set({ tokenPlain: token, token: undefined });
    }
  }

  getToken() {
    if (this.data.token && this.canEncrypt()) {
      try {
        return this.safe.decryptString(Buffer.from(this.data.token, 'base64'));
      } catch {
        return null;
      }
    }
    return this.data.tokenPlain || null;
  }

  clearToken() {
    this.set({ token: undefined, tokenPlain: undefined, deviceId: undefined });
  }
}

module.exports = { Store };
