# We Are Many

Jogo de navegador de exploração espacial, replicação de sondas e terraformação, feito com three.js e inspirado na temática de *Somos Legião, Somos Bob*. As estrelas estão nas posições reais, vindas de catálogos astronômicos públicos.

- Requisitos e plano de desenvolvimento: [docs/REQUISITOS.md](docs/REQUISITOS.md) e vida nos planetas: [docs/REQUISITOS-VIDA.md](docs/REQUISITOS-VIDA.md). Cada requisito tem a sua situação (feito, parcial, a fazer).
- Estado atual: **Fase 0** concluída e ampliada (navegação com o GUIA, sondas e quase toda a vida nos planetas já existem); próximos passos na [seção 8.1](docs/REQUISITOS.md#81-backlog-revisado-em-20102026-próximos-passos).
- Regra do projeto: nada que já foi implementado é removido sem necessidade ou pedido, e toda remoção é registrada com o motivo ([seção 0](docs/REQUISITOS.md#0-como-manter-este-documento)).

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes do núcleo (vitest)
npm run build      # checagem de tipos + build de produção em dist/
```

Sem WebGL (aceleração de hardware desligada ou GPU bloqueada), o jogo usa sozinho um renderizador por software em Canvas 2D, com visual simplificado. Para testar esse modo, abra com `?soft` no endereço.

Os chunks de estrelas já estão versionados em `public/universe/v1/`. Para gerá-los de novo a partir do catálogo HYG (só biblioteca padrão do Python):

```bash
npm run data
```

## Controles

| Espaço 3D | |
|---|---|
| Clique | Captura o mouse para pilotar (Esc solta) |
| Mouse | Mira a direção da nave |
| W / S | Acelera / freia (sem tecla, a nave desliza) |
| A / D | Curva, inclinando a nave |
| Espaço / Shift | Sobe / desce |
| Q / E | Gira a nave |
| Tab | Turbo (energia limitada, recarrega sozinha) |
| Roda do mouse | Potência do motor |
| C | Cruzeiro: mantém a velocidade sem segurar W |
| F | Observar a superfície (em órbita de um planeta rochoso) |
| G | Painel do GUIA: sugestões, sistema atual, estrelas, pontos de interesse, marcadores, busca e diário de bordo |
| Ctrl K | Busca do GUIA (a mesma lista do G), em qualquer lugar do espaço |
| T | Trava como alvo o que estiver na mira |
| N | Aceita a próxima sugestão do GUIA como alvo |
| J | Liga ou desliga o piloto automático até o alvo (qualquer comando manual desliga) |
| V | Varredura de longo alcance (revela pontos de interesse e o que há nos sistemas num raio de 4 pc) |
| M / R | Envia uma sonda de extração ao corpo mais próximo / aos anéis |
| B | Salva um marcador na posição atual |
| H / X | Alvo: casa (Terra) / limpar alvo |
| 1 / 2 / 3 | Atalhos de teste: Terra, Alfa Centauri, Sirius |

| Superfície 2D | |
|---|---|
| Botão esquerdo | Usa a ferramenta selecionada |
| Botão direito ou meio, WASD | Move o mapa |
| Roda do mouse | Zoom (com zoom alto aparecem árvores, casas e criaturas em pixel art) |
| Abas Terreno / Vida / Civilização | Ferramentas de terraformação, espécies e aldeias |
| Espaço | Pausa ou retoma o tempo (painel da direita: pausa, 1x, 2x, 5x) |
| Nome de uma aldeia no painel | Leva a câmera até ela |
| Esc | Volta à órbita |

## O que a Fase 0 prova

1. **Campo de estrelas real:** 109 mil estrelas do HYG, convertidas para coordenadas galácticas e divididas em 116 chunks numa octree, carregados conforme a posição da nave e guardados em cache no IndexedDB.
2. **Escala contínua:** origem flutuante (a câmera fica sempre na origem), depth buffer logarítmico e velocidade adaptativa. O voo vai do espaço interestelar até a órbita da Terra sem tela de carregamento.
3. **Sistema Solar:** planetas reais em escala visual comprimida, menu orbital e distância mínima de aproximação.
4. **Superfície estilo WorldBox:** mapa de um pixel por elemento, com tamanho proporcional ao planeta (Terra = 1024×512, até 2048×1024), cilíndrico, gerado num Web Worker, com ferramentas de terraformação e vegetação que se espalha. A cena 3D é descartada ao entrar e reconstruída ao sair.
5. **Vida na superfície:** peixes, herbívoros, predadores e uma espécie inteligente, cada criatura um ponto no mapa e um sprite em pixel art no zoom. As espécies dependem do clima e do terreno, se reproduzem, caçam e morrem. A espécie inteligente funda assentamentos (aldeia, vila, cidade) com praça, ruas em grade e casas em lotes, cada um com sua área; cidades formam reinos ligados por estradas. As casas mudam de estilo a cada era (Pedra, Bronze, Ferro...). Requisitos completos da vida em [docs/REQUISITOS-VIDA.md](docs/REQUISITOS-VIDA.md). Espécies conhecidas podem ser levadas a outros planetas.

## Estrutura

```
src/core/                 Núcleo sem three.js: unidades, PRNG determinístico, voo, astrofísica
src/procgen/              Geração procedural determinística (ruído, superfícies)
src/sim/                  Simulação sem three.js: espécies, ecossistema e aldeias
src/sim/ecosystem.ts      Classe Ecosystem: estado, construtor, crônica e escalonador (step, yearly)
src/sim/eco/              Tipos, constantes, funções puras, tiles e células ecológicas do ecossistema
src/sim/eco/core/         Partes do Ecosystem: criaturas (nascer, morrer, andar), save e consultas da interface
src/sim/eco/people/       Pessoas: decisão, migração, sociedade, vocação e rebanhos
src/sim/eco/fauna/        Bichos de terra: células ecológicas, comida, decisão e espaço
src/sim/eco/flora/        Vegetação e matas
src/sim/eco/settlements/  Assentamentos: fundação, planta, prédios, ruas, ciclo de vida, colônias, política e forma
src/sim/eco/economy/      Economia: o ano, estoque, técnicas e produção
src/sim/eco/community/    Jornadas do modo completo, desgaste das ruas e relações entre lugares
src/sim/eco/work/         Ações presenciais e recursos do mapa (árvores, pedra, minas)
src/sim/eco/war/          Guerras
src/sim/eco/politics/     Diplomacia entre reinos
src/sim/eco/naval/        Portos, jangadas e barcos
src/sim/eco/trade/        Mercados e caravanas
src/sim/eco/world/        Eventos do mundo e ferramentas do jogador
src/universe/             Manifesto da octree, seleção e carregamento de chunks
src/client/               three.js: modo espaço (3D), modo superfície (2D), HUD
tools/pipeline/           Pipeline Python que gera os chunks a partir do catálogo
public/universe           Chunks gerados
```

O `Ecosystem` é uma classe parcial: cada arquivo em `src/sim/eco/<domínio>/` exporta um objeto com métodos `this: Ecosystem`, que `ecosystem.ts` instala no protótipo (não enumeráveis, fora do save). A impressão digital do mundo (`src/sim/fingerprint.ts`) protege refatorações: `npx vitest run --config vitest.calib.config.ts src/sim/fingerprint.calib.ts` compara três mundos fixos com o baseline.

## Créditos dos dados

- Estrelas: [HYG Database](https://github.com/astronexus/HYG-Database) v4.1, por David Nash (astronexus), licença CC BY-SA 4.0. Os chunks em `public/universe/` são derivados dele e seguem a mesma licença.
- Sistema Solar: parâmetros orbitais e físicos da NASA/JPL.

## Publicar no Netlify (grátis)

O `netlify.toml` já traz a configuração (build `npm run build`, pasta `dist`, Node 22).

1. Em app.netlify.com, entre com o GitHub e clique em **Add new site → Import an existing project**.
2. Escolha o GitHub e o repositório `Joab-S/We-Are-Many`, branch `main`. Não mude nada e clique em **Deploy**.
3. O Netlify dá um endereço `https://<nome>.netlify.app`; cada push na `main` publica de novo.

### Fluxo de branches (poupa créditos do Netlify)

Cada publicação na `main` gasta créditos do plano grátis do Netlify (15 por deploy de produção).

1. Toda mudança vai num PR para a branch `development`. PRs e a `development` não compilam no Netlify.
2. Teste a `development` localmente: `git checkout development && git pull && npm install && npm run dev`.
3. Quando estiver bom, abra um PR da `development` para a `main`. Só esse merge publica, uma vez, juntando várias mudanças.

Na `main`, um push que só muda documentação (`docs/`, `README.md`) também não compila.

## Publicar na Vercel

O jogo é um site estático (Vite), e o `vercel.json` já traz a configuração.

1. Em vercel.com, entre com o GitHub e clique em **Add New → Project**.
2. Importe o repositório `Joab-S/We-Are-Many`. A Vercel detecta Vite sozinha; não mude nada e clique em **Deploy**.
3. A branch `main` vira o endereço principal; cada PR ganha um endereço de prévia.
