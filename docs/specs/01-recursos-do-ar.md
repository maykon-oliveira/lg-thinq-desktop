# Spec 1: recursos extras do ar-condicionado

**Status:** implementada, falta validar em aparelho real.

## Objetivo

Expor na tela tudo o que o `profile` do ar-condicionado oferece além de ligar, temperatura, modo e ventilação. Cada recurso só aparece se o modelo tiver aquele recurso, seguindo a mesma regra dos modos e velocidades.

## Recursos

Todos usam o endpoint que o app já chama: `POST devices/{id}/control`, com o corpo `{ <recurso>: { <propriedade>: valor } }`.

| Recurso | Propriedades | Tipo | Na tela |
| --- | --- | --- | --- |
| `windDirection` | `rotateUpDown`, `rotateLeftRight` | boolean, gravável | Liga e desliga a oscilação vertical e a horizontal |
| `powerSave` | `powerSaveEnabled` | boolean, gravável | Liga e desliga o modo econômico |
| `display` | `light` | enum (ex.: `ON`/`OFF` ou níveis), gravável | Luz do painel: chave liga/desliga, ou opções se houver níveis |
| `operation` | `airCleanOperationMode` | enum `START`/`STOP`, gravável | Liga e desliga a purificação |
| `sleepTimer` | `relativeHourToStop`, `relativeMinuteToStop`, `relativeStopTimer` | número / enum `SET`/`UNSET` | Modo dormir: desliga em 1, 2, 3, 4, 6 ou 8 h |
| `timer` | `relativeHourToStart/Stop`, `relativeMinuteToStart/Stop`, `relativeStartTimer/StopTimer` | idem | Ligar em X h (com o ar desligado) ou desligar em X h (com o ar ligado) |
| `timer` | `absoluteHourToStart/Stop`, `absoluteMinuteToStart/Stop`, `absoluteStartTimer/StopTimer` | idem | Ligar ou desligar às HH:MM |
| `filterInfo` | `filterRemainPercent`, `usedTime`, `filterLifetime` | número, só leitura | Vida útil do filtro em %. Se faltar o percentual, calcula por `usedTime / filterLifetime` |
| `airQualitySensor` | `PM1`, `PM2`, `PM10`, `humidity`, `odorLevel`, `totalPollutionLevel` | só leitura | Painel de qualidade do ar e umidade |
| `twoSetTemperature` (ou `twoSetTemperatureInUnits`) | `twoSetEnabled`, `heatTargetTemperature`, `coolTargetTemperature`, `unit` | `twoSetEnabled` só leitura, alvos graváveis | Faixa no modo auto: "aquece abaixo de X°, resfria acima de Y°" |

### Regras da API que importam

- **Timer de ligar só com o ar desligado; timer de desligar e modo dormir só com o ar ligado.** Fora disso a API devolve erro 2302/2304/2305.
- **Cancelar timer** *(validar)*: se o profile tiver `relativeStopTimer`, `relativeStartTimer`, `absoluteStopTimer` ou `absoluteStartTimer` gravável, mande `UNSET`. Se não tiver, mande hora e minuto `0`.
- **Estado do timer** *(validar)*: o estado traz o tempo restante em `relativeHourToStop` + `relativeMinuteToStop`. Hora e minuto em `0`, ou `relativeStopTimer: 'UNSET'`, significam timer inativo. O app calcula o horário previsto (agora + restante) para mostrar "desliga às 23:40".
- **`twoSetEnabled`** é estado, não um controle: o aparelho liga sozinho em alguns modos. A faixa só aparece quando ele está `true`.
- `PM2` na API é o PM2.5.

## Onde mexer

| Arquivo | O que muda |
| --- | --- |
| `src/main/ac.js` | `parseProfile` gera `caps.extras`; `parseState` gera `state.extras`; `extraPayload(caps, feature, value)` monta e valida o corpo de cada recurso |
| `src/main/main.js` | Um canal IPC só, `ac:set(id, feature, value)`, que passa por `extraPayload`. A interface nunca manda um payload cru |
| `src/preload.js` | `set(id, feature, value)` |
| `src/main/demo.js` | O aparelho "Sala" simula todos os recursos, com timers contando de verdade. O "Quarto" não tem nenhum, para testar a tela sem extras |
| `src/renderer/*` | Linha de "chips" na tela principal com o que está ativo (timer, oscilação, econômico, filtro baixo), e uma folha "Ajustes" com todos os controles |
| `test/ac.test.js` | Parsing e payload de cada recurso, incluindo os casos sem o recurso |

### Nomes das features em `extraPayload`

| feature | valor | payload |
| --- | --- | --- |
| `swingV` / `swingH` | boolean | `{ windDirection: { rotateUpDown | rotateLeftRight: v } }` |
| `powerSave` | boolean | `{ powerSave: { powerSaveEnabled: v } }` |
| `light` | um dos valores do profile | `{ display: { light: v } }` |
| `airClean` | boolean | `{ operation: { airCleanOperationMode: 'START' | 'STOP' } }` |
| `sleepTimer` | minutos (0 cancela) | `{ sleepTimer: { relativeHourToStop, relativeMinuteToStop } }` |
| `timerStart` / `timerStop` | minutos (0 cancela) | `{ timer: { relativeHourToStart, relativeMinuteToStart } }` etc. |
| `alarmStart` / `alarmStop` | `"HH:MM"` (ou `null` cancela) | `{ timer: { absoluteHourToStart, absoluteMinuteToStart } }` etc. |
| `twoSetHeat` / `twoSetCool` | temperatura | `{ twoSetTemperature: { heatTargetTemperature, unit } }` etc. |

## Tela

- **Tela principal:** abaixo de Modo e Ventilação, uma linha de chips só com o que está ativo ou pede atenção: "Desliga às 23:40", "Dormir até 01:10", "Oscilando", "Econômico", "Filtro 8%". Clicar num chip abre a folha Ajustes. Sem nada ativo, a linha some.
- **Botão Ajustes** na barra de status (ícone de controles deslizantes), visível só se o aparelho tiver pelo menos um recurso extra.
- **Folha Ajustes**, no mesmo estilo da folha de configurações:
  1. Ar e filtro: qualidade do ar, umidade e filtro (só leitura).
  2. Vento: oscilação vertical e horizontal.
  3. Opções: econômico, luz do painel, purificação.
  4. Faixa automática (só com `twoSetEnabled`).
  5. Timer: com o ar ligado, "Dormir" e "Desligar em"; com o ar desligado, "Ligar em". Mais "Às HH:MM" se houver timer absoluto. Timer ativo mostra o horário e um botão "Cancelar".
- Controles que exigem o ar ligado ficam desabilitados com ele desligado, como Modo e Ventilação.
- Toda ação usa o mesmo fluxo otimista de `act()`: muda na tela, envia, desfaz e mostra o erro se falhar.

## Pronto quando

- [x] `npm test` cobre parsing e payload de todos os recursos.
- [x] `npm run demo`: "Sala" mostra e controla tudo; "Quarto" não mostra chips nem o botão Ajustes.
- [ ] Testado num aparelho real com `npm run dev`, conferindo o profile salvo em `debug/`. Corrigir os pontos marcados como *validar*.
- [x] README atualizado na seção "O que dá para fazer".
