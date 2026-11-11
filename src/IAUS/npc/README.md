# Os comportamentos das pessoas

Tudo o que uma pessoa decide (andar, comer, morar, trabalhar, contratar, votar, governar) é um **comportamento do
IAUS**, escrito como dado e agrupado em pacotes. A lista completa, gerada do catálogo, está em
[docs/COMPORTAMENTOS.md](../../../docs/COMPORTAMENTOS.md).

## As peças do IAUS e onde cada uma vive

| Peça do IAUS | Aqui | Exemplo |
|---|---|---|
| **Cérebro** (Brain) | `criarCerebro` (pacotes/index.ts) monta o `Brain` a partir de um Brain Seed | Andarilho, Morador, Criança, Idoso, Líder |
| **Comportamento** (Behavior, o porquê) | Um item de um pacote: nome, descrição, peso, contexto, considerações | "Encomendar a quem faz" |
| **Tipo de comportamento** (Behavior Type, o quê) | `tipos.ts`: cada tipo passa a ação ao corpo (`Pessoa.corpo.agir`); os do Tagging System mexem nas tags no próprio IAUS | `Contratar`, `CortarLenha`, `MarcarAlvo` |
| **Consideração** (Consideration) | `c(nome, entrada, curva, opções)`: uma entrada (`entradas.ts`) e uma curva de resposta (`curvas.ts`) | `c('posso pagar', E.possoPagar, curva.faixa(0.5, 2))` |
| **Decisão** (Decision) | O `Brain` pontua cada comportamento por contexto: uma vez para si (`eu`) ou uma vez por alvo do tipo pedido (`alvo`) | "Cortar lenha eu mesmo → árvore 12" |
| **Pacotes de comportamento** | `pacote({ id, nome, camada, descricao }, [...])`: os comportamentos ganham ids na faixa do pacote (pacote 13 → 1301, 1302...) | Comércio e contratação (13) |
| **Pacotes de habilidade** | Um Behavior-Ability Pair por ofício: o mesmo "Trabalhar no ofício" ligado à habilidade de cada um | Ofício: Ferreiro (111) |

O cérebro troca pacotes **em grupo** quando a vida muda (`ajustarPacotes`): o andarilho que assenta ganha Ofício,
O que o lugar pede, Mudança, Cidadania e Defesa; a criança que cresce perde a Infância; quem é eleito ganha o Governo
e o perde ao sair; quem passa a praticar um ofício ganha o pacote de habilidade dele.

## As camadas

| Camada | Pacotes | Pergunta que respondem |
|---|---|---|
| Corpo | Sobrevivência (1), Descanso (2), Movimento (3) | Como fico vivo e onde estou? |
| Mente | Tédio e entretenimento (4), Percepção e marcação (5) | O que faço com o tempo livre e o que sei dos outros? |
| Vínculos | Vida social (6), Família (7), Infância (17) | Com quem ando, caso, crio filhos? |
| Lugar | Moradia (8), Ficar, mudar ou fundar (9) | Onde moro e como é a minha casa? |
| Sustento | Fazer eu mesmo (10), Ofício (11), O que o lugar pede (12), habilidades dos ofícios (100+) | Como ganho a vida? |
| Troca | Comércio e contratação (13) | Faço, compro ou encomendo? |
| Sociedade | Cidadania (14), Governo (15), Defesa (16) | Quem manda, quanto pago, quem defende? |

O peso dá a ordem natural entre as camadas: 1 para ambiente e ócio, 2 para o útil e o social, 3 para o trabalho, 4 e
5 para a emergência (sede, fuga). As ações contínuas têm **foco** (o momentum do IAUS, `FOCO` = 1,6): enquanto duram,
valem mais, então só uma coisa bem mais importante interrompe o corte de uma árvore no meio.

## O Tagging System

Três tipos de tag, todos no IAUS (`aiEntity.ts`):

- **Em si**: "Eu sou lenhador" (`DarTagASi` com `tag: 'oficio'`), "Caçando", "Candidato", "Soldado".
- **Em outros, visível a todos**: a marca leva o id de quem marcou. "Escolher uma presa" põe `AlvoDeCaca:12` no
  animal; "Reservar uma árvore" põe `Reservado:12`. Com o parâmetro `eu`, quem marca também se marca pelo mesmo tempo
  ("Caçando", "Reservando"), e por isso não escolhe uma segunda presa. "Desistir da presa" tira as duas.
- **Crenças sobre os outros**: "Reconhecer o ofício de alguém" faz a pessoa **crer** que o outro é lenhador
  (`PerceberTag`), sem mudar o outro. A crença vence com o tempo e "Esquecer um ofício que mudou" a apaga quando o
  outro deixou de mostrar a tag. As considerações leem as duas coisas juntas (`seesTag`: fato ou crença).

## O exemplo do lenhador

Quem precisa de madeira tem, no mesmo ciclo, duas decisões concorrendo:

- **Cortar lenha eu mesmo** (pacote 10), por árvore: preciso de madeira, a árvore é minha ou de ninguém, tem madeira,
  está perto, força, disposição, e "sou lenhador ou não tenho ofício" (quem tem outro ofício perde tempo).
- **Encomendar a quem faz** (pacote 13), por pessoa: preciso do que ele faz (pela tag que **creio** que ele tem),
  posso pagar, não quero fazer (fraco, ou tenho ofício), confio nele (laço), não tenho encomenda aberta, ele está perto.

A encomenda vira uma oferta (`WOT.oferta`) com cliente, fornecedor, bem, quantidade e preço. O lenhador a pontua com
o **próprio** interesse ("Aceitar a encomenda": quero o pagamento, ganância, disposição, gosto do cliente, tenho pronto
ou dá para fazer) ou recusa. Aceita, ela entra no que ele precisa: ele **entrega do estoque** se tiver, ou **corta e
entrega depois** ("Entregar a encomenda"). Quem não recebe em tempo cancela; quem recebe e não paga fica com a tag
"Credor" no lenhador, e "Pagar o que deve" acerta. O mesmo vale para pedra (pedreiro), comida (coletor, caçador,
pescador, agricultor) e os bens das oficinas (pão, ferramentas, pano...).

## A fundação, de uma pessoa à cidade

| Momento | Comportamentos |
|---|---|
| Um andarilho acha água, comida e material | Explorar, Procurar um sítio melhor, Estabelecer-se aqui |
| Faz a casa com o que tem por perto | Abrir a obra da minha casa, Reservar uma árvore, Cortar lenha / Tirar pedra eu mesmo, Trabalhar na obra da minha casa |
| Outros chegam, gostam de quem está e ficam; as casas sobem juntas | Juntar-se a quem já mora perto (amigos e afinidade), o lote perto da casa mais próxima |
| Vêm os filhos | Cortejar, Casar, Ter um filho, Cuidar do filho; a criança brinca, fica perto dos pais e aprende olhando |
| As pessoas se especializam e a casa vira oficina | Escolher um ofício (a falta que o lugar sente, a vaga, o jeito, a aptidão, a tradição), Assumir a identidade do ofício, Abrir a oficina do meu ofício (padaria, taberna, marcenaria, pedreira, ferraria...) |
| Troca | Encomendar, Comprar, Escambo, Pôr a sobra à venda |
| O lugar é reconhecido e escolhe um líder | Pedir que o lugar escolha um líder, Candidatar-se, Votar |
| O líder governa pela personalidade | Mandar fazer uma obra de serviço, de fé ou de defesa; Subir ou baixar o imposto; Chamar às armas; Distribuir comida; Dar uma festa |
| O povo aprova ou desaprova | Apoiar o líder, Protestar, Pagar o imposto, Sonegar |
| As obras públicas se fazem | Levar material à obra pública (o tesouro paga), Trabalhar na obra pública |
| O exército | Alistar-se, Patrulhar, Treinar, Defender o lugar, Correr para o abrigo |

As obras **privadas** nascem do que cada morador sente (casa, ampliação, oficina); as **públicas**, só do líder.

## Duas escalas

- **A pessoa com corpo** (pacotes 1 a 17): pensa a cada segundo e meio, percebe o que está perto e age pelo corpo. O
  mundo de exemplo é o laboratório da sociedade (`src/sim/sociedade`): um mapa pequeno onde a fundação acontece
  sozinha. O corpo é uma interface (`Corpo.agir`), então outro mundo só precisa implementar as ações.
- **O mundo agregado** (`mundo/`, pacotes 31 a 34): o Ecosystem decide uma vez por ano ou por jornada. Cada decisão é
  um pacote escrito igual aos outros, pontuado pelo `Decisor`, que preenche os stats de quem decide e de cada opção.
  Os pesos ficam em `mundo/ajustes.ts`, que o ajuste automático (`npm run calibrar:ajustar`) e a aba Ajustes editam.

## O grafo do cérebro

`brainGraph(brain)` (src/IAUS/graph.ts) devolve os nós (cérebro, pacotes, comportamentos, considerações, entradas,
tipos, tags e crenças), com a nota do último ciclo e o que está ativo, e as ligações entre eles. `sphereLayout`
põe cada pacote num ponto da esfera, os comportamentos e as considerações em volta dele (os aglomerados) e o que é
compartilhado numa casca interna. É o dado pronto para a vista do cérebro em esfera.

## Como acrescentar um comportamento

1. Escolha o pacote pela pergunta que ele responde (a tabela das camadas) e acrescente o item **no fim** da lista,
   para não mudar o id dos outros.
2. Se precisar de uma ação nova, registre o nome em `ACOES` (tipos.ts) e implemente no corpo do mundo
   (`src/sim/sociedade/acoes.ts`, no laboratório).
3. Se precisar de uma entrada nova, registre em `entradas.ts`, lendo só stats, tags e crenças (nada do mundo).
4. Regrave a lista: `GRAVAR=1 npx vitest run src/IAUS/npc/lista.test.ts`.
