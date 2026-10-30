# Spec 3: atualização em tempo real (MQTT)

**Status:** não iniciada.

## Objetivo

Trocar a consulta a cada 30 s por avisos em tempo real da nuvem da LG. Quando alguém muda o ar pelo controle remoto ou pelo celular, a tela atualiza na hora. Alertas do aparelho (filtro, erro, timer encerrado) viram notificações do sistema.

A consulta periódica continua como reserva, mas bem mais espaçada (ex.: 5 min), e volta a 30 s se o MQTT cair.

## Como funciona na API *(validar tudo no SDK `thinqconnect`, `mqtt_client.py` e `thinq_api.py`)*

1. **Registrar o cliente:** `POST client` com `{ type: 'MQTT', 'service-code': 'SVC202', 'device-type': '607', allowExist: true }`. Usa o mesmo `x-client-id` que o app já guarda em `store.clientId`.
2. **Descobrir o servidor:** `GET route` devolve `mqttServer` (ex.: `mqtts://xxxx-ats.iot.<região>.amazonaws.com:8883`).
3. **Certificado do cliente:**
   - Gerar um par de chaves RSA 2048 e um CSR. O Node não gera CSR sozinho, então isso precisa de uma dependência (`@peculiar/x509` ou `node-forge`).
   - `POST client/certificate` com `{ body: { 'service-code': 'SVC202', csr } }`.
   - A resposta traz `certificatePem` e `subscriptions` (os tópicos).
   - Guardar chave e certificado criptografados com `safeStorage`, como o token. Gerar de novo só se expirar ou se a conexão for recusada.
4. **Conectar:** MQTT sobre TLS (porta 8883) com a chave e o certificado do cliente, a CA raiz da Amazon (AmazonRootCA1, embutida no app, nunca baixada em tempo de execução) e `clientId` igual ao `x-client-id`. Assinar os tópicos de `subscriptions`. Biblioteca: `mqtt` (mqtt.js).
5. **Pedir eventos de cada aparelho:**
   - `POST event/{deviceId}/subscribe` com `{ expire: { unit: 'HOUR', timer: 4464 } }` para mudanças de estado.
   - `POST push/{deviceId}/subscribe` para alertas.
   - Renovar antes de expirar. `GET event` e `GET push` listam o que está assinado.
6. **Mensagens:** JSON com `deviceId` e `pushType`:
   - `DEVICE_STATUS`: traz `report` com o estado **parcial**, no mesmo formato de `GET state`. Precisa mesclar com o último estado completo.
   - `DEVICE_PUSH`: traz `pushCode` (ex.: fim de timer, filtro). Vira notificação.
   - `DEVICE_REGISTERED` / `DEVICE_UNREGISTERED` / `DEVICE_ALIAS_CHANGED`: recarregar a lista de aparelhos.
7. **Ao trocar ou remover o token:** `DELETE event/{id}/unsubscribe`, `DELETE push/{id}/unsubscribe`, `DELETE client`, e apagar o certificado salvo.

## Onde mexer

| Arquivo | O que muda |
| --- | --- |
| `src/main/thinq.js` | `registerClient`, `getRoute`, `issueCertificate`, `subscribeEvents/Push`, `unsubscribe...`, `deregisterClient` |
| `src/main/realtime.js` (novo) | Ciclo de vida: registro, certificado, conexão, reconexão com espera crescente (1 s, 2 s, 4 s… até 5 min), renovação das assinaturas, emissão de eventos `state`, `push`, `devices`, `status` |
| `src/main/csr.js` (novo) | Geração de chave e CSR, isolada para testar |
| `src/main/main.js` | Liga o `realtime` depois que há token. Mescla `report` no último estado bruto e manda o estado traduzido para a tela via `webContents.send('ac:update', ...)`. Notificação com `Notification` do Electron |
| `src/preload.js` | `onUpdate(cb)`, `onRealtimeStatus(cb)` (só leitura, sem expor o `ipcRenderer`) |
| `src/main/demo.js` | Simular um `DEVICE_STATUS` de vez em quando (ex.: a temperatura ambiente mudando) |
| `src/renderer/app.js` | Ouvir `onUpdate`. Polling vira 5 min com MQTT conectado e 30 s sem ele. Indicador discreto "ao vivo" na barra de status |
| `test/realtime.test.js` (novo) | Mescla de estado parcial, tradução de `pushCode`, agenda de reconexão (com relógio falso) |

## Riscos

- O fluxo do certificado não tem documentação pública. Tem de seguir o SDK linha a linha e testar.
- Se o registro falhar (ex.: país não suportado, limite de clientes), o app continua só com polling, sem mostrar erro grave. Só registra no log.
- Uma dependência nativa quebraria o build portátil. Usar apenas bibliotecas em JS puro.

## Pronto quando

- [ ] Mudar a temperatura pelo controle remoto atualiza a tela em poucos segundos.
- [ ] Derrubar a rede e voltar: reconecta sozinho e o polling volta a 30 s enquanto isso.
- [ ] Remover o token desfaz registro e assinaturas.
- [ ] Uma notificação do sistema aparece quando um timer termina.
- [ ] Testes passando. Modo demo mostrando atualizações espontâneas.
- [ ] README atualizado (a seção "Como funciona" fala do polling).
