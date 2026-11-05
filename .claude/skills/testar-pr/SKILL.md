---
name: testar-pr
description: "Como testar o We Are Many antes de abrir ou atualizar um PR para a development: o que rodar para cada tipo de mudança, como abrir o jogo num estado conhecido (?cena, ?debug, window.space), como ler as capturas do teste de fumaça e o que fazer quando ele falha. Use sempre que uma mudança neste repositório estiver pronta para conferir, antes de qualquer push ou PR, e quando pedirem para rodar os testes, testar o jogo ou ver se algo funciona, mesmo sem falar em PR. Use também ao escrever um teste em tests/jogo, ao criar uma cena e quando npm test, npm run test:jogo ou o CI falharem."
---

# Testar antes do PR

O objetivo é chegar ao PR sabendo que o CI vai passar, tendo visto o jogo funcionar e podendo dizer o que ficou sem teste. Os comandos estão explicados também na seção "Testando" do `README.md`.

## O mínimo antes de qualquer PR

Vale para qualquer mudança de código, mesmo pequena: são os mesmos passos do CI (`.github/workflows/ci.yml`), que vai rodá-los de todo jeito. Rode um por vez: disputando CPU, os testes de mundo simulado podem estourar o limite de 30 s sem nada estar errado.

```bash
npm run build
npm test
npm run test:jogo
```

| Comando | O que faz | Tempo aproximado |
|---|---|---|
| `npm run build` | Tipos (`tsc`) e build | 15 s |
| `npm test` | A suíte inteira do Vitest | cerca de 3 min |
| `npm run test:jogo` | Compila, serve o `dist` e joga num Chromium sem GPU, no WebGL e no `?soft` | 2 min |
| `npm run test:rapido` | A suíte sem os mundos simulados (lista em `vitest.rapido.config.ts`). Serve para usar enquanto trabalha, não substitui o `npm test` | 20 s |

Na primeira vez, o `test:jogo` precisa do navegador: `npx playwright install chromium`.

## Gastar pouco tempo e poucos tokens

Vale para qualquer IA de código (Claude Code, Codex, Cursor e as outras): cada rodada custa minutos e cada linha de saída custa tokens.

- **Enquanto trabalha, rode só o que a mudança toca:** o arquivo de teste dela (`npx vitest run src/sim/war`) e o `npm run test:rapido`. A suíte inteira não é para cada passo.
- **A suíte inteira, o build e o `test:jogo` rodam uma vez, antes de abrir o PR.** Nos pushes seguintes do mesmo PR, rode só o que o novo commit toca: o CI roda tudo de novo de qualquer jeito.
- **Rode a suíte inteira em segundo plano** quando a ferramenta deixar, e continue o trabalho enquanto ela roda.
- **Não rode de novo para reler a saída.** Quando detecta uma IA, o Vitest já usa o relator curto (`minimal`): mostra só o resumo e o que falhou. Para ver uma falha de perto, rode só o arquivo dela. Não passe `--reporter=verbose` nem `--reporter=default` sem precisar: a saída inteira tem umas 300 linhas.
- **Um comando por vez:** o build, a suíte e o `test:jogo` disputam a CPU e deixam tudo mais lento, e os testes de mundo simulado podem estourar o tempo.
- **Só documentação, ou só a prancha de arte fora de `src`:** não rode nada.

## O que mais rodar, conforme a mudança

| Mudou | Enquanto trabalha | Além do mínimo |
|---|---|---|
| `src/client/**` | `npm run test:rapido` e `npx playwright test -g "WebGL"` | Olhar as capturas (abaixo) |
| `src/sim`, `src/IAUS`, `src/procgen` | `npx vitest run <pasta ou arquivo>` | Impressão digital (abaixo) |
| `src/save` | `npx vitest run src/save` | `npx playwright test save`, que recarrega no navegador um save da versão anterior. Ao subir `SAVE_VERSION`, mantenha esse caso funcionando |
| `tests/jogo` | `npx playwright test -g "<parte do título>"` | Provar que o teste falha (abaixo) |
| Só documentação | Nada | Nada |

Os testes de `src/sim/eco/<domínio>` ficam em `src/sim/<domínio>.test.ts`: para `src/sim/eco/war`, rode `npx vitest run src/sim/war`. O filtro é por pedaço do caminho, então `src/sim/eco` não roda os testes dessa pasta, e sim os de `economy` e `ecosystem`, que começam igual.

### Impressão digital do mundo

O `npm test` e o CI **não** a rodam: ela é um `.calib.ts`, fora dos testes normais. Quem mexe no que o mundo simulado usa precisa rodá-la à mão (cerca de 1 min):

```bash
npx vitest run --config vitest.calib.config.ts src/sim/fingerprint.calib.ts
```

Uma refatoração tem que manter a impressão idêntica. Se ela mudou, o comportamento mudou. Se a mudança é de propósito, regrave o baseline no mesmo commit e diga isso no PR, com `UPDATE=1` na frente do comando (no PowerShell, `$env:UPDATE=1` antes dele). Se não era de propósito, é um bug: não regrave. A falha mostra em qual cenário (com povos, só fauna, com vista) e em quais anos (50, 100, 150, 200) a impressão divergiu, e isso já aponta onde procurar: se só a fauna continua igual, o problema está nos povos.

## Olhe as capturas

Um teste verde não prova que ficou certo. Não há comparação de imagens: o teste só confere que existe imagem no meio da tela. Por isso, quando mexer no que aparece na tela, abra os PNG em `test-results/<teste>/` e veja. O Playwright apaga essa pasta a cada rodada, então só existem as capturas da última.

| Captura | O que deve mostrar |
|---|---|
| `1-inicio` | O Sol no meio, os planetas e o HUD |
| `2-orbita` | A Terra grande, com o painel "EM ÓRBITA" |
| `3-superficie` | O mapa da Terra e o HUD da superfície |
| `4-volta` | A Terra de novo, com o painel de órbita |
| `saturno` | Saturno com os anéis |
| `cidade` | Uma cidade no mapa, com ruas |
| `cidade-na-esfera` | As ruas dessa cidade na esfera |

## Abrir o jogo num estado conhecido

Com `npm run dev`, acrescente ao endereço. Os parâmetros combinam entre si, como em `/?cena=saturno&debug&soft`.

| Parâmetro | O que faz |
|---|---|
| `?cena=saturno` | Abre em órbita de Saturno, a 3 raios |
| `?cena=terra-cidade` | Simula a Terra até surgir uma cidade (cerca de 40 s) e abre em cima dela, parada |
| `?soft` | Força o renderizador por software, o mesmo de quem não tem WebGL |
| `?debug` | Liga o painel F3, as taxas nos painéis e as alças do console |

Com `?debug`, no console:

```js
space.goToPlanet('Saturno', 3)   // a nave para a 3 raios do planeta; órbita é a menos de 4
space.ship; space.systems; space.state
surface.eco                      // o mundo, com a superfície aberta
debugEarth()                     // desce direto à Terra
```

`space` e `surface` só existem enquanto o modo está aberto. Uma cena não lê nem grava o save, então é seguro abrir uma em cima de um jogo em andamento.

Para uma cena nova, acrescente uma função em `src/client/cenas.ts`. Monte o mundo pela fachada do motor (`createEngine`, `restoreEcosystem`), sem usar `ecosystemOf` no cliente, e acrescente um teste em `tests/jogo/cenas.spec.ts`.

## Escrever um teste em tests/jogo

Importe `test`, `expect` e as funções de `./apoio`, não do `@playwright/test`: é o `test` de lá que reprova o teste quando o console do jogo registra um erro. Um teste que provoca um erro de propósito esvazia a lista `erros` no final.

O que costuma pegar quem escreve um teste novo:

- **Espere o passo anterior aparecer antes da próxima tecla.** Cada modo tem o seu `Input`, então uma tecla apertada durante a troca de modo se perde.
- **A fusão não é instantânea.** O `F` e o pouso mantêm os dois modos vivos por 0,6 s, depois de a superfície ficar pronta, e as teclas não valem nesse meio tempo: `superficie(page)` em `tests/jogo/apoio.ts` só aparece no fim, e é ela que se espera antes de apertar qualquer tecla. Para fotografar um momento exato, pause as animações (`document.getAnimations()`) e ponha o `currentTime`, como em `esfera.spec.ts`. A nave parada a prumo não pousa; acelerando, sim: um teste que desce com `W` e não quer pousar vai inclinado.
- **A mesma tecla muda de sentido.** `F` no espaço só funciona em órbita de planeta rochoso, e fora disso não faz nada, sem erro. Na superfície, `F` é seguir e `1` é pausar. Por isso um `F` perdido pode passar despercebido se o teste não conferir que a superfície abriu.
- **Mande as teclas pelo código:** `Digit1`, `KeyF`, `Escape`, como em `src/client/space/commands.ts` e `surface/keys.ts`.
- **Use `esperarImagem` antes de medir ou fotografar.** No primeiro segundo de um navegador recém-aberto, sem GPU, o contexto WebGL às vezes cai e volta sozinho. Nesse intervalo a foto sai branca, com um ícone de imagem quebrada no canto. Um tempo fixo de espera não resolve isso.

**Prove que o teste falha.** Quebre o jogo de propósito (apague a linha que o teste deveria vigiar), rode só esse teste, confira que ele falha com a mensagem certa e desfaça. Um teste escrito sem isso pode não vigiar nada: `a Terra na tela` já passou aqui com a cena desligada, porque aceitava a tela branca.

Um teste novo de mundo simulado no Vitest deve entrar em `SIMULATED_WORLDS`, em `vitest.rapido.config.ts`, para o `test:rapido` continuar rápido.

**Mundo longo: divida a rodada.** Rodar um mundo de 200 ou 300 anos custa de 30 a 50 s. Os testes de mundo longo das sementes 42 e 7 ficam em `src/sim/mundo42.test.ts` e `src/sim/mundo7.test.ts`, que rodam o mundo uma vez só (`sharedWorld`, em `src/sim/sharedWorld.ts`) e o fotografam nos anos pedidos. Um teste novo com uma dessas sementes entra no arquivo dela e pega a sua cópia com `world.at(ano)`. Se o ano ainda não está na lista do `sharedWorld`, acrescente-o, em vez de chamar `runWorld` de novo.

## Quando falha

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| `o console do jogo não pode ter erros` | O jogo registrou um erro ou um aviso "Falha..." | A mensagem do teste traz o erro. Corrija o jogo |
| `o espaço na tela`, `a Terra na tela`, `o mapa na tela` | Nada desenhado no meio da tela | Veja o PNG da falha em `test-results/` |
| Espera por "EM ÓRBITA" estoura | A tecla se perdeu ou a nave não entrou em órbita | Confira a espera antes da tecla. Rastro: `npx playwright show-trace test-results/<teste>/trace.zip` |
| `cena terra-cidade: nenhuma cidade grande em 400 anos` | O mundo mudou e não forma mais cidade | Provavelmente a mudança em `src/sim` afetou o mundo: rode a impressão digital e olhe a simulação antes de mexer nos limites da cena |
| `Executable doesn't exist` | Falta o navegador | `npx playwright install chromium` |
| `http://localhost:4179 is already used` | Outro `test:jogo` ou `vite preview` aberto | Feche o outro processo |
| Teste do Vitest estoura 30 s | Máquina ocupada, ou um mundo simulado ficou mais lento | Rode esse teste sozinho. Se passar, era a máquina. Se não, procure o que ficou lento antes de aumentar o limite |
| `fatal: '$GIT_DIR' too big` | Git 2.42 no Windows, caminho do git dir acima de 220 caracteres (acontece em worktree) | O commit entra mesmo assim, mas o push falha. Use um worktree de nome mais curto ou uma pasta mais rasa |

Não apague nem pule um teste para fazer o CI passar: `docs/REQUISITOS.md` 0.1 pede não remover nada sem necessidade ou pedido.

**Aumentar um limite de tempo** só depois de saber por que ele estourou, e dizendo o motivo no PR. Antes disso, ele só esconde o problema: o teste continua sem saber se o jogo funciona, e demora mais para dizer isso.

### Falhou só no CI

O CI não tem GPU e costuma ser mais lento que uma máquina de desenvolvimento, mas não presuma que é só isso. A rodada guarda `test-results/` no artefato `capturas`, mesmo quando falha, com as fotos e o rastro:

```bash
gh run list --branch <ramo> --workflow CI
gh run download <id da rodada> --name capturas --dir capturas-ci
```

Olhe o PNG do teste que falhou. Se a tela está branca ou preta, é um problema de imagem: veja a tabela acima. Se a imagem está certa e o que estourou foi uma espera, compare com a captura local do mesmo passo antes de concluir que é lentidão. Apague `capturas-ci` depois, para não ir parar no commit.

## O que os testes não cobrem

Se a mudança encosta nisto, confira à mão e diga no PR. Com `npm run dev`, `/?cena=saturno` leva direto à órbita, e a tecla `1` leva à da Terra.

- Os botões do HUD (o fluxo usa as teclas), o GUIA, o piloto automático, as sondas e os saltos `2` e `3`.
- Recarregar um save feito na superfície: `tests/jogo/save.spec.ts` só recarrega um feito no espaço.
- O `Esc` soltando a trava do mouse no espaço.
- A descida em outros planetas além da Terra, e `terra-cidade` no `?soft`.
- Qualquer navegador além do Chromium sem GPU em 1280x800: GPU real, Firefox, Safari e celular.

## No PR

- A base é a `development`, e o texto é em português.
- Diga o que rodou, o que conferiu à mão e o que ficou sem teste. Se mudou a impressão digital de propósito, diga isso também.
- O CI tem dois jobs, `Tipos, build e testes` e `Teste de fumaça do jogo`. As capturas da rodada ficam no artefato `capturas`, na página da rodada do CI.
