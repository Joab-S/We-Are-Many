# We Are Many

Jogo de navegador de exploração espacial, replicação de sondas e terraformação, feito com three.js e inspirado na temática de *Somos Legião, Somos Bob*. As estrelas estão nas posições reais, vindas de catálogos astronômicos públicos.

- Requisitos e plano de desenvolvimento: [docs/REQUISITOS.md](docs/REQUISITOS.md)
- Estado atual: **Fase 0** (provas técnicas)

## Rodando

```bash
npm install
npm run dev        # abre em http://localhost:5173
npm test           # testes do núcleo (vitest)
npm run build      # checagem de tipos + build de produção em dist/
```

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
| F | Observar a superfície (em órbita de um planeta rochoso) |
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
5. **Vida na superfície:** peixes, herbívoros, predadores e uma espécie inteligente, cada criatura um ponto no mapa e um sprite em pixel art no zoom. As espécies dependem do clima e do terreno, se reproduzem, caçam e morrem. A espécie inteligente funda aldeias que crescem, mandam colonos e avançam de era (Pedra, Bronze, Ferro...). Espécies conhecidas podem ser levadas a outros planetas.

## Estrutura

```
src/core/       Núcleo sem three.js: unidades, PRNG determinístico, voo, astrofísica
src/procgen/    Geração procedural determinística (ruído, superfícies)
src/sim/        Simulação sem three.js: espécies, ecossistema e aldeias
src/universe/   Manifesto da octree, seleção e carregamento de chunks
src/client/     three.js: modo espaço (3D), modo superfície (2D), HUD
tools/pipeline/ Pipeline Python que gera os chunks a partir do catálogo
public/universe Chunks gerados
```

## Créditos dos dados

- Estrelas: [HYG Database](https://github.com/astronexus/HYG-Database) v4.1, por David Nash (astronexus), licença CC BY-SA 4.0. Os chunks em `public/universe/` são derivados dele e seguem a mesma licença.
- Sistema Solar: parâmetros orbitais e físicos da NASA/JPL.
