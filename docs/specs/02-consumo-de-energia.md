# Spec 2: consumo de energia

**Status:** não iniciada.

## Objetivo

Mostrar quanto o ar-condicionado gastou: kWh por dia nos últimos 30 dias e por mês no último ano, com uma estimativa em reais a partir da tarifa que o usuário informar.

## API *(validar)*

Endpoints do SDK `thinqconnect` (`thinq_api.py`), na mesma base `https://api-{região}.lgthinq.com` e com os mesmos headers:

| Chamada | Para quê |
| --- | --- |
| `GET devices/energy/{deviceId}/profile` | Diz se o aparelho informa energia e quais propriedades existem (ex.: `totalEnergy`). Sem suporte, devolve erro ou lista vazia |
| `GET devices/energy/{deviceId}/usage?period=DAY&startDate=YYYYMMDD&endDate=YYYYMMDD&energyProperty=totalEnergy` | Consumo por dia no intervalo |
| `GET devices/energy/{deviceId}/usage?period=MONTH&startDate=YYYYMM&endDate=YYYYMM&energyProperty=totalEnergy` | Consumo por mês (formato da data: validar se é `YYYYMM` ou `YYYYMMDD`) |

Pontos a confirmar no primeiro teste:

- A unidade dos valores: Wh ou kWh.
- Se o dia de hoje vem parcial ou só aparece no dia seguinte.
- O limite de intervalo por chamada (o SDK sugere no máximo cerca de 30 dias para `DAY`).
- Quais modelos do Brasil informam energia. Muitos inverter informam, os modelos mais antigos não.

## Onde mexer

| Arquivo | O que muda |
| --- | --- |
| `src/main/thinq.js` | `getEnergyProfile(id)` e `getEnergyUsage(id, { period, start, end, property })` |
| `src/main/energy.js` (novo) | Funções puras: datas da consulta, normalizar a resposta em `[{ date, kwh }]`, somar e calcular o custo |
| `src/main/main.js` | IPC `energy:load(id, period)`. Cache em memória por aparelho e período, válido por 1 hora (energia não muda a cada minuto e o token tem limite de chamadas) |
| `src/main/store.js` | Guardar a tarifa (R$/kWh) |
| `src/main/demo.js` | Dados simulados plausíveis (ex.: 3 a 9 kWh por dia, maior nos dias quentes) |
| `src/renderer/*` | Folha "Consumo" com o gráfico e a tarifa |
| `test/energy.test.js` (novo) | Datas, normalização e custo |

## Tela

- Botão "Consumo" na barra de status, só se o profile de energia indicar suporte.
- Folha "Consumo":
  - Alternador "30 dias" / "12 meses".
  - Gráfico de barras em SVG feito à mão (nada de biblioteca nova), na cor do modo atual.
  - Total do período em kWh e em R$.
  - Campo "Tarifa (R$/kWh)" com valor inicial vazio. Sem tarifa, só mostra kWh.
  - Passar o mouse (ou focar) numa barra mostra a data e o valor.
- Erro de aparelho sem suporte: a folha nem aparece. Erro de rede: mensagem na própria folha, com "Tentar de novo".

## Pronto quando

- [ ] Testes de `energy.js` passando.
- [ ] Modo demo mostra o gráfico nos dois períodos.
- [ ] Aparelho real: valores batem com o app LG ThinQ do celular (aba de energia).
- [ ] Aparelho sem suporte: nenhum botão de consumo.
- [ ] README atualizado.
