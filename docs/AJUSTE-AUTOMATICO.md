# Ajuste automático das constantes

Documento técnico · 31/10/2026

`npm run calibrar:ajustar -- <plano.json>` procura sozinho os valores das constantes de equilíbrio (`src/sim/balance.ts` e `src/ai/tuning.ts`) que deixam a simulação mais perto das metas. O método é o CMA-ES, uma estratégia evolutiva. Ele substitui o ajuste por tentativa e erro, em que se troca um número, roda a calibração, olha a tabela e repete.

## O problema

- **Cada avaliação é cara.** Um mundo da calibração longa na Terra do jogo leva de 1 a 2 minutos por semente em 200 a 300 anos, e uns 5 minutos em 1000 anos.
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
- **Validação contra a maldição do vencedor.** O melhor candidato de uma geração tende a ter tido sorte nas suas duas sementes. Por isso, no fim, três finalistas rodam de novo em mais sementes e num horizonte maior (`validar`): os valores de agora, o centro final e o melhor visto. Fica o melhor ali.
- **Cache e retomada.** Toda avaliação vai para `avaliacoes.jsonl` na pasta de saída. A chave inclui uma impressão do código da simulação (`src/sim`, `src/ai`, `src/procgen` e `src/core`), então uma rodada interrompida continua de onde parou, e um cache feito com outro código não é usado.

## Uso

```bash
# 1. Quais parâmetros pesam? Cada um no mínimo e no máximo, o resto como está (2n + 1 configurações).
#    Ponha "modo": "sensibilidade" no plano.
npm run calibrar:ajustar -- tools/tune/assentamentos.json

# 2. CMA-ES nos que pesam (relatório atualizado a cada geração em tools/tune/saida/<plano>/relatorio.md).
npm run calibrar:ajustar -- tools/tune/assentamentos.json

# 3. Escrever os valores escolhidos no código, conferir e medir a calibração longa.
node tools/tune.mjs aplicar tools/tune/saida/assentamentos
npx vitest run && npm run calibrar:longa
```

O plano (`tools/tune/assentamentos.json` é o exemplo, feito para o problema da onda 3: o povo que encolhe e a fome que sobe):

| Campo | O que é | Padrão |
| --- | --- | --- |
| `modo` | `cmaes` ou `sensibilidade` | `cmaes` |
| `parametros` | `{ nome, min, max, log?, inteiro?, inicio? }`; o ponto de partida é o valor de agora no código (ou `inicio`) | obrigatório |
| `metas` | `{ chave, min?, max?, peso?, escala? }`, onde `chave` é um campo de `Indicators` | as da calibração longa |
| `anos`, `raio` | Horizonte e tamanho da Terra de cada mundo | 200, 1 |
| `sementes`, `porAvaliacao` | Sementes disponíveis e quantas cada candidato roda por geração | 0 a 5, 2 |
| `geracoes`, `populacao`, `sigma`, `semente` | Gerações, candidatos por geração (padrão do CMA-ES: 4 + 3·ln n), passo inicial (fração da faixa) e semente do otimizador | 10, automático, 0,25, 1 |
| `paralelo` | Processos ao mesmo tempo | CPUs − 1 |
| `validar` | `{ anos, sementes }` da validação final | o horizonte e as sementes do plano |
| `saida` | Pasta do cache e dos relatórios | `tools/tune/saida/<plano>` (fora do git) |

## Custo

Com 8 parâmetros, o CMA-ES usa 10 candidatos por geração, mais o centro, em 2 sementes: 22 mundos por geração. Em 200 anos, com 3 processos, isso dá uns 10 a 15 minutos por geração. As 12 gerações do exemplo somam de 2 a 3 horas sem ninguém olhando, mais a validação em 1000 anos (3 finalistas × 3 sementes). A sensibilidade do mesmo plano custa 17 configurações × 2 sementes, uns 30 minutos.

Para gastar menos:

- rode a sensibilidade primeiro e leve para o CMA-ES só os parâmetros que pesam;
- use horizontes curtos (150 a 200 anos) com metas de taxa (fome, tendência do povo, mortes cedo), que já aparecem cedo, e deixe as metas de tamanho (maior lugar, metrópoles) para a validação longa;
- rode com a máquina livre: os processos disputam as CPUs com qualquer outra calibração.

## Limites

- **O ajuste é tão bom quanto as metas.** Se uma meta estiver errada ou faltar, o otimizador explora a brecha (por exemplo, menos fome com menos gente). Por isso o exemplo pede um mínimo de moradores junto com a fome baixa.
- **Defeito não se resolve com número.** O ajuste acha o melhor equilíbrio do código como ele está. Se a ablação mostra um defeito (um lugar nômade que nunca volta a plantar, por exemplo), ele é corrigido antes, no código.
- **Horizonte curto não garante o longo.** Uma rodada de 200 anos não mede bem as metas de 1000 anos. A validação no horizonte longo existe para isso, e o resultado escolhido ainda passa pela calibração longa completa antes de entrar.
- **Por ora, só constantes numéricas.** A tabela de biomas (`src/sim/biomeYield.ts`) é feita de chamadas `row(...)` e ainda não dá para ajustar por nome.
