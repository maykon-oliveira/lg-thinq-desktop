# LG ThinQ Desktop

App Electron que controla ares-condicionados LG pela API oficial ThinQ Connect. Interface e textos em português do Brasil.

## Comandos

- `npm test`: testes (`node:test`, sem dependências)
- `npm run demo`: abre o app com aparelhos simulados, sem token. Use para ver qualquer mudança de tela
- `npm run dev`: app real com DevTools. Também salva o profile e o estado brutos de cada aparelho em `<userData>/debug/<deviceId>.json`, para conferir formatos da API
- `npm run dist`: instalador do Windows em `dist/`

## Planejamento

Funcionalidades planejadas ficam em `docs/specs/`. O `README.md` dessa pasta lista o status de cada uma. Antes de começar uma funcionalidade, leia a spec. Ao terminar, marque os itens de "Pronto quando" e atualize o status.

## Arquitetura

```
renderer (HTML/CSS/JS puros)  ⇄  preload.js  ⇄  main (Node)  ⇄  api-{região}.lgthinq.com
```

- `src/main/thinq.js`: cliente HTTP da API. Um método por endpoint, erros como `ThinQError`, mensagens amigáveis em `friendlyMessage`.
- `src/main/ac.js`: **funções puras** que traduzem `profile`/`state` da LG para o modelo da tela e montam os payloads de controle. Toda lógica de formato da API mora aqui, com teste.
- `src/main/main.js`: janela, IPC e cache de capacidades (`capsCache`).
- `src/main/demo.js`: aparelho simulado. Tem de imitar o formato real da API (profile e state), não o modelo da tela.
- `src/renderer/app.js`: estado em `S`, `render()` redesenha tudo a partir de `S.ac`, ações via `act()` (atualização otimista: muda a tela, envia e desfaz se falhar).

## Padrões

- **O token nunca sai do processo principal.** A tela só chama funções do `preload.js`.
- **A tela nunca monta payload da API.** Ela manda uma intenção (`setMode(id, 'COOL')`, `set(id, 'swingV', true)`). O processo principal valida contra as capacidades e monta o corpo em `ac.js`.
- **IPC** sempre por `handle()` em `main.js`, que devolve `{ ok: true, data }` ou `{ ok: false, code, message }`. `message` já vem traduzida.
- **A tela se adapta ao profile.** Um controle só aparece se o profile disser que o recurso existe e é gravável (`mode` inclui `'w'`). Nada de lista fixa por modelo.
- **Todo recurso novo entra no demo**, no formato real da API. O aparelho "Sala" tem tudo e o "Quarto" só o básico, para testar os dois casos.
- **Teste para todo parsing e payload novo** em `test/`, incluindo o caso de o recurso não existir.
- **Limite de chamadas da LG:** não diminua o polling (30 s) nem crie chamadas em loop. Prefira cache no processo principal.
- **Sem framework nem bundler** na tela. CSP restrita em `index.html`: nada de script ou `style="..."` inline no HTML (via JS, `el.style` funciona). Ícones são SVG inline em `ICONS`.
- **Visual:** cores por variáveis CSS em `:root`, com tema escuro em `prefers-color-scheme`. A cor de destaque é `--mode`, que segue o modo de operação. Folhas (sheets) usam `.sheet-backdrop` + `.sheet`.
- **Acessibilidade:** botões de alternar usam `aria-pressed`, a barra de status é `role="status"` e todo botão só com ícone tem `aria-label`.
- **Dependências:** evite. Se precisar, só JS puro (nada nativo, que quebra o build portátil).
- **Código e comentários** em português, no tom do código existente: comentários curtos, só onde o porquê não é óbvio.
- **Commits** em português, no imperativo, descrevendo o que muda para o usuário.
- Atualize a seção "O que dá para fazer" do `README.md` quando a funcionalidade for visível ao usuário.
