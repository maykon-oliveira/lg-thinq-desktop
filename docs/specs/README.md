# Specs

Planos das próximas funcionalidades. Cada spec diz o que fazer, como a API da LG funciona naquele ponto, onde mexer no código e como saber que terminou.

Ao começar ou terminar uma spec, atualize o status aqui e no topo do arquivo dela.

| # | Spec | Status |
| --- | --- | --- |
| 1 | [Recursos extras do ar-condicionado](01-recursos-do-ar.md) | Implementada, falta validar em aparelho real |
| 2 | [Consumo de energia](02-consumo-de-energia.md) | Não iniciada |
| 3 | [Atualização em tempo real (MQTT)](03-tempo-real-mqtt.md) | Não iniciada |

## Fontes da API

A LG não publica uma referência completa da API ThinQ Connect. O que existe de mais confiável:

- SDK oficial em Python, `thinqconnect` (LG Electronics, Apache-2.0): `thinq_api.py` (endpoints), `mqtt_client.py` (tempo real), `devices/air_conditioner.py` (recursos do ar).
- Integração `lg_thinq` do Home Assistant, que usa esse SDK.
- O próprio `profile` do aparelho: ele diz quais recursos existem, se são graváveis (`mode: ['r','w']`) e quais valores aceitam. Em modo dev o app salva profile e estado em disco (ver CLAUDE.md), use isso para validar uma spec.

Quando uma spec diz **"validar"**, o formato foi tirado do SDK e ainda não foi visto num aparelho real.
