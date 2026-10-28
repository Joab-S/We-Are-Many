# IA local das pessoas

Cada pessoa inteligente do mundo decide por conta própria, com uma IA leve que roda no navegador, sem
chave de API e sem internet. A proposta completa está no documento "IA local das pessoas: proposta".
Esta pasta é o lugar para escrever, testar e ajustar essa IA sem mexer no resto da simulação.

## Como funciona

A IA é de **utilidade** (a mesma ideia do The Sims e de muitos jogos de simulação): para cada decisão,
cada opção recebe uma nota de 0 a 1. A nota é o produto de **considerações** (falta no lugar, traços,
amigos, idade...), cada uma passada por uma curva. A pessoa sorteia entre as opções perto da melhor;
quem é paciente fica quase sempre com a melhor, quem é impulsivo varia mais. Tudo usa o gerador de
sorteios do mundo (fluxo `mente`), então a mesma semente dá a mesma história.

## Arquivos

| Arquivo | O que tem |
|---|---|
| `traits.ts` | Os 16 traços de personalidade (−10 a 10), sorteio, herança dos pais, viés da cultura, compatibilidade entre duas pessoas |
| `utility.ts` | O motor: curvas, considerações, nota, escolha e o porquê |
| `tuning.ts` | **Todos os pesos num lugar só.** É aqui que se ajusta o comportamento |
| `relations.ts` | Laços entre pessoas (conhecido, amigo, cônjuge, rival), até 12 por pessoa |
| `trace.ts` | O diário de cada pessoa: o que decidiu, quando e por quê |
| `decisions/work.ts` | Escolha do ofício e quem troca de ofício na falta |
| `decisions/social.ts` | Um ano de vida social: encontros, amizade, rivalidade, casamento, brigas |
| `decisions/leader.ts` | Escolha do líder, herdeiro do rei e temperamento do rei para a guerra |
| `lab/` | O laboratório: testes que olham uma pessoa, um casal, um grupo e um povo inteiro |

## Onde a simulação chama a IA (`src/sim/ecosystem.ts`)

- `spawn` e o nascimento: traços sorteados ou herdados dos pais (o outro pai é o cônjuge).
- `firstRole` / `thinkProfession`: ofício de quem vira adulto. Soldados e guardas continuam sendo chamados pelo líder.
- `shiftLabor`: na falta, quem muda de ofício primeiro é quem tem mais vontade (`switchWill`).
- `socialize`: um ano de vida social por lugar.
- Natalidade: casados têm mais filhos que solteiros (`SOCIAL.coupleBirth` e `singleBirth`).
- `migrate`: o casal e os filhos se mudam juntos.
- `updateLeader`: o povo escolhe o líder; `warMood` soma o temperamento do rei à agressividade do reino.
- `curiosity`: a curiosidade para descobrir técnicas vem do traço.

## Como testar e ajustar

1. Mude um peso em `tuning.ts`.
2. Rode o laboratório: `npx vitest run src/ai/lab`. Ele vai do pequeno ao grande:
   - `pessoa.test.ts`: uma pessoa sozinha. O corajoso caça? A falta fala mais alto que o gosto?
   - `casal.test.ts`: duas pessoas e um grupo de 40. Quem combina casa? Quem é agressivo briga?
   - `aldeia.test.ts`: um povo de verdade por 150 anos. Os ofícios juntam gente com o jeito deles? Os líderes são carismáticos?
3. Veja o mundo inteiro: `npm run calibrar:longa` (3 mundos × 1000 anos).
4. No jogo, clique numa pessoa: a ficha mostra os traços marcantes, o cônjuge, os amigos, os rivais e as
   últimas decisões com o porquê. "Seguir" mantém a câmera nela.
