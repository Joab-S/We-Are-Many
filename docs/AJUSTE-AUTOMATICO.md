# Ajuste automático das constantes

Documento técnico · 31/10/2026

`npm run calibrar:ajustar -- <plano.json>` procura sozinho os valores das constantes de equilíbrio (`src/sim/balance.ts` e `src/ai/tuning.ts`) que deixam a simulação mais perto das metas. O método é o CMA-ES, uma estratégia evolutiva. Ele substitui o ajuste por tentativa e erro, em que se troca um número, roda a calibração, olha a tabela e repete.

## O problema

- **Cada avaliação é cara.** Um mundo da calibração longa na Terra do jogo leva uns 3 minutos por semente em 300 anos, e uns 12 minutos em 1000 anos (medido na calibração conjunta, com uns 4000 moradores no fim).
- **A nota tem ruído.** Com o mesmo código, só a semente já muda muito o resultado: na calibração longa, os moradores no fim foram de 1810 a 5634 entre três sementes.
- **Os parâmetros interagem.** A nota mínima do sítio, a colônia da fome e o modo de vida mexem na mesma coisa, a comida de quem está em falta. Ajustar um de cada vez anda em zigue-zague.
- **São poucos parâmetros de cada vez,** de 5 a 20, contínuos ou inteiros, cada um com uma faixa razoável.

## Por que CMA-ES

| Método | Avaliações típicas para 8 a 15 parâmetros | Ruído | Parâmetros que andam juntos | Encaixe aqui |
| --- | --- | --- | --- | --- |
| Tentativa e erro (um de cada vez) | Centenas, com uma pessoa olhando | Engana fácil | Não vê | É o que se faz hoje |
| Grade | k^n (5 valores em 8 parâmetros dão 390 625) | Precisa repetir | Vê, mas não cabe | Não |
| Busca aleatória | Centenas | Aguenta | Não aprende | Bom para comparar |
| Algoritmo genético clássico | Milhares (mutação de tamanho fixo, cruzamento que ignora a forma do problema) | Aguenta | Mal | Funciona, mas gasta mais |
| **CMA-ES** | **Centenas** (100·n é o limite comum; antes disso já melhora muito) | **Aguenta**: só usa a ordem dos candidatos, não o valor | **Aprende**: a covariância é exatamente isso | **Escolhido** |
| Otimização bayesiana (GP ou TPE, como no Optuna) | Dezenas a uma centena | Aguenta com modelo de ruído | Aprende | Melhor com orçamento muito curto; pede Python ou uma biblioteca, e o modelo fica caro com muitas avaliações |

O CMA-ES é da família dos algoritmos genéticos (população, seleção, recombinação, mutação). A diferença é que a mutação **aprende**:

- o passo (σ) cresce quando a busca anda sempre para o mesmo lado e encolhe perto do ótimo;
- a covariância aprende quais parâmetros devem mudar juntos, como "baixar a nota mínima pede subir a população da colônia da fome".

Por isso ele chega ao alvo com bem menos avaliações que um genético clássico, sem pedir derivada nem modelo do jogo. Como usa só a ordem dos candidatos, uma semente azarada não desmonta a busca.

## Como funciona aqui

```
plano.json ─► tools/tune.mjs (CMA-ES) ─┬─► vitest + vitest.tune.config.ts + src/sim/tune.calib.ts   (semente 0)
                                       ├─► ...                                                       (semente 1)
                                       └─► ... (até `paralelo` processos ao mesmo tempo)
                 cada processo: troca as constantes no código ao carregar, roda runWorld, mede a distância às metas
```

- **A troca das constantes não toca no motor.** O `vitest.tune.config.ts` tem um plugin que, ao carregar `balance.ts` e `tuning.ts`, troca os números pedidos no texto do módulo (`tools/tune/constants.mjs`). Aceita número solto (`SITE_MIN_VALUE`), campo de objeto (`MOVE_W.stay`) e item de vetor (`SEASON_HARVEST[2]`).
  - As cópias locais que as partes do `Ecosystem` fazem ao carregar já pegam o valor novo.
  - Cada avaliação devolve o valor que o módulo de fato viu, e o otimizador confere.
  - Os dois arquivos ficam fora do cache em disco do vitest, que não sabe da troca.
- **A distância às metas** (`src/sim/tuneGoals.ts`) é zero com tudo dentro da faixa. Fora dela, conta a distância até a borda mais perto, na escala da borda, ao quadrado e vezes o peso. Sem metas no plano, valem as da calibração longa (`LONG_TARGETS`).
- **Números aleatórios comuns.** Numa geração, todos os candidatos rodam nas mesmas sementes. Assim a diferença entre eles é do parâmetro, não da semente. As sementes giram de uma geração para outra, para o resultado não decorar um punhado de mundos.
- **Escala.** O otimizador trabalha em [0, 1] por parâmetro, com escala logarítmica quando pedida. Um candidato fora da faixa é avaliado na borda e paga uma multa pela distância.
- **O centro.** A cada geração, o centro da nuvem (a média do CMA-ES) também é avaliado. Com ruído, ele costuma ser a melhor resposta, e mostra o progresso nas mesmas sementes.
- **Validação contra a maldição do vencedor.** O melhor candidato de uma geração tende a ter tido sorte nas suas sementes. Por isso, no fim, três finalistas rodam de novo no horizonte da calibração longa (`validar`, 1000 anos por padrão): os valores de agora, o centro final e o melhor visto. Fica o melhor ali. Nos planos de exemplo, a validação usa sementes que a otimização nunca viu (9 a 14 contra 0 a 8), então o resultado não é decorado.
- **Cache e retomada.** Toda avaliação vai para `avaliacoes.jsonl` na pasta de saída. A chave inclui uma impressão do código da simulação (`src/sim`, `src/ai`, `src/procgen` e `src/core`), então uma rodada interrompida continua de onde parou, e um cache feito com outro código não é usado.

## Uso

```bash
# 0. Quais parâmetros pesam? Cada um no mínimo e no máximo, o resto como está (2n + 1 configurações).
#    Numa cópia do plano com "modo": "sensibilidade" (exemplo: tools/tune/conjunta-sensibilidade.json).

# 1. O ajuste de verdade: 1000 anos, metas da calibração longa (mais povo, era e lugares que não morrem cedo),
#    largando dos valores de agora.
npm run calibrar:ajustar -- tools/tune/assentamentos-longo.json

# 2. Escrever os valores escolhidos no código, conferir e medir a calibração longa.
node tools/tune.mjs aplicar tools/tune/saida/assentamentos-longo
npx vitest run && npm run calibrar:longa
```

A fase curta (`tools/tune/assentamentos.json`, 300 anos, só metas de taxa: fome, povo, era e as partes de lugares pequenos, que morrem cedo e de uma família só) serve para explorar rápido quando os valores estão longe do bom, como logo depois de uma mudança grande no código. Para encadear as duas, ponha `"partirDe": "saida/assentamentos"` no plano longo e baixe o `sigma` para uns 0,1.

O relatório de cada fase (`tools/tune/saida/<plano>/relatorio.md`) é refeito a cada geração. Os planos de exemplo ajustam as oito constantes que a sensibilidade da calibração conjunta (agente 4B, em `docs/CALIBRACAO-LONGA.md`) mostrou que pesam, e miram o que ficou fora da meta: fome, lugares vivos e fundados, lugares que morrem cedo e metrópoles. Os campos:

| Campo | O que é | Padrão |
| --- | --- | --- |
| `modo` | `cmaes` ou `sensibilidade` | `cmaes` |
| `parametros` | `{ nome, min, max, log?, inteiro?, inicio? }`; o ponto de partida é `inicio`, o valor de `partirDe` ou o valor de agora no código | obrigatório |
| `partirDe` | Pasta de saída (ou `melhor.json`) de outra rodada, relativa ao plano: a fase seguinte começa do que ela escolheu | nenhum |
| `metas` | `{ chave, min?, max?, peso?, escala? }`, onde `chave` é um campo de `Indicators` | nenhuma |
| `metasDaLonga` | Somar as metas da calibração longa (`LONG_TARGETS`) às da lista | sim quando não há lista |
| `anos`, `raio` | Horizonte e tamanho da Terra de cada mundo | 300, 1 |
| `sementes`, `porAvaliacao` | Sementes disponíveis e quantas cada candidato roda por geração | 0 a 5, 3 |
| `geracoes`, `populacao`, `sigma`, `semente` | Gerações, candidatos por geração (padrão do CMA-ES: 4 + 3·ln n), passo inicial (fração da faixa) e semente do otimizador | 10, automático, 0,25, 1 |
| `paralelo` | Processos ao mesmo tempo | todas as CPUs |
| `validar` | `{ anos, sementes }` da validação final | 1000 anos, sementes 0 a 5 |
| `saida` | Pasta do cache e dos relatórios | `tools/tune/saida/<plano>` (fora do git) |

## Custo

O ajuste roda poucas vezes, na máquina de quem desenvolve, e pode levar horas sem ninguém olhando. Por isso os padrões preferem resultado confiável a rapidez: todas as CPUs, 3 sementes por candidato e validação em 1000 anos.

| Fase | Mundos | Tempo de simulação (1 núcleo) | Numa máquina de 8 núcleos |
| --- | --- | --- | --- |
| Sensibilidade (8 parâmetros, 300 anos, 3 sementes) | 17 × 3 = 51 | ~2,5 h | ~20 min |
| Fase curta (8 parâmetros, 12 gerações, 300 anos) | 11 × 3 × 12 = 396 | ~18 h | ~2,5 h |
| Fase longa (8 parâmetros, 10 gerações, 1000 anos) | 11 × 3 × 10 = 330 | ~66 h | ~8 h |
| Validação de cada fase (3 finalistas, 1000 anos, 6 sementes) | 18 | ~3,5 h | ~30 min |

Os tempos por mundo vêm da calibração conjunta: uns 3 minutos em 300 anos e uns 12 em 1000 anos. Cada processo do vitest soma uns 3 segundos de partida. A rodada interrompida (queda de energia, limite de tempo de um terminal) continua do cache: é só rodar o mesmo plano de novo.

Para gastar menos: rode a sensibilidade primeiro e leve para o CMA-ES só os parâmetros que pesam (com 5 parâmetros, a geração tem 8 candidatos em vez de 10).

## Limites

- **O ajuste é tão bom quanto as metas.** Se uma meta estiver errada ou faltar, o otimizador explora a brecha (por exemplo, menos fome com menos gente). Por isso o exemplo pede um mínimo de moradores junto com a fome baixa.
- **Defeito não se resolve com número.** O ajuste acha o melhor equilíbrio do código como ele está. Se a ablação mostra um defeito (um lugar nômade que nunca volta a plantar, por exemplo), ele é corrigido antes, no código.
- **Horizonte curto não garante o longo.** Uma rodada de 300 anos não mede bem as metas de 1000 anos (maior lugar, metrópoles, cidades), e as metas de contagem (lugares vivos e fundados) não valem ao mesmo tempo nos dois horizontes. Na calibração conjunta, o CMA-ES em 300 anos achou candidatos bem melhores ali (distância 0,25 contra 2,12), e na validação em 1000 anos os dois finalistas perderam para os valores de agora (2,55 e 2,76 contra 1,60): nota mínima mais baixa dá mais povo cedo e quase o dobro de fundações em 1000 anos. Por isso o ajuste de verdade é o de 1000 anos, e o resultado escolhido ainda passa pela calibração longa completa antes de entrar no código.
- **Por ora, só constantes numéricas.** A tabela de biomas (`src/sim/biomeYield.ts`) é feita de chamadas `row(...)` e ainda não dá para ajustar por nome.
