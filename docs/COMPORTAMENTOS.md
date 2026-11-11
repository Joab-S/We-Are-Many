# Comportamentos das pessoas

<!-- Gerado por src/IAUS/npc/lista.ts a partir do catálogo. Não edite à mão: rode `npx vitest run src/IAUS/npc/lista.test.ts` com GRAVAR=1. -->

Cada comportamento é um Behavior do IAUS: o **porquê** (as considerações, cada uma uma entrada e uma curva de resposta),
o **quê** (o Behavior Type, que o corpo da pessoa executa), o **contexto** (sobre quem é pontuado: a própria pessoa ou
cada alvo de um tipo) e o **peso** (1 ambiente e ócio, 2 útil e social, 3 trabalho, 4 e 5 emergência). As ações
contínuas valem um pouco a mais enquanto duram (o foco, ou momentum), para não serem largadas pela metade.

A arquitetura está em [src/IAUS/npc/README.md](../src/IAUS/npc/README.md).

## Cérebros de nascença

O cérebro troca os pacotes em grupo quando a vida muda (`ajustarPacotes`).

| Cérebro | Quando | Pacotes |
|---|---|---|
| Andarilho | Adulto sem lugar: sobreviver, achar onde ficar, conhecer gente. | Sobrevivência, Descanso, Movimento, Tédio e entretenimento, Percepção e marcação, Vida social, Família, Moradia, Fazer eu mesmo, Comércio e contratação |
| Morador | Adulto que mora num lugar: tudo do andarilho, mais ofício, o que o lugar pede, mudança, cidadania e defesa. | Sobrevivência, Descanso, Movimento, Tédio e entretenimento, Percepção e marcação, Vida social, Família, Moradia, Ficar, mudar ou fundar, Fazer eu mesmo, Ofício, O que o lugar pede, Comércio e contratação, Cidadania, Defesa |
| Criança | Brincar, ficar perto dos pais, aprender olhando. | Sobrevivência, Descanso, Movimento, Tédio e entretenimento, Percepção e marcação, Vida social, Infância |
| Idoso | Sem o trabalho pesado e a defesa; ensina, conversa, vota. | Sobrevivência, Descanso, Movimento, Tédio e entretenimento, Percepção e marcação, Vida social, Família, Moradia, Ficar, mudar ou fundar, Ofício, Comércio e contratação, Cidadania |
| Líder | Morador eleito: ganha o pacote do governo. | Sobrevivência, Descanso, Movimento, Tédio e entretenimento, Percepção e marcação, Vida social, Família, Moradia, Ficar, mudar ou fundar, Fazer eu mesmo, Ofício, O que o lugar pede, Comércio e contratação, Cidadania, Governo, Defesa |

## A pessoa, por camada

### Corpo

#### 1. Sobrevivência

Comer, beber, se aquecer e fugir do perigo.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 101 | **Comer do que tenho**<br>Com fome e comida guardada, come do próprio estoque. | Comer | eu | instantâneo | 4 | fome · tenho comida |
| 102 | **Comer no celeiro do lugar**<br>Morador com fome e sem comida própria pega a parte dele no celeiro do lugar. | Comer | eu | instantâneo | 3.6 | fome · mora num lugar · celeiro tem · sem comida própria |
| 103 | **Colher frutas para comer**<br>Com fome, vai ao arbusto com frutas mais perto e come lá. | Coletar | alvo: arbusto | contínuo | 3.2 | fome · tem fruta · perto |
| 104 | **Beber água**<br>Com sede, vai à água mais perto e bebe. | Beber | alvo: agua | contínuo | 4.2 | sede · perto |
| 105 | **Escolher uma presa**<br>Com fome e coragem, vê um animal sem dono e o marca como alvo de caça (tag no animal). | MarcarAlvo | alvo: animal | instantâneo | 2.6 | fome · não estou caçando outra · perto · ninguém marcou · coragem · perigo |
| 106 | **Caçar a presa marcada**<br>Persegue e abate o animal que marcou como alvo de caça. | Cacar | alvo: animal | contínuo | 3.4 | marquei · fome · perto · fôlego |
| 107 | **Desistir da presa**<br>A presa fugiu para longe ou ele cansou: tira a marca de alvo de caça. | DesmarcarAlvo | alvo: animal | instantâneo | 2 | marquei · longe ou cansado |
| 108 | **Pescar para comer**<br>Com fome e água com peixe por perto, pesca e come. | Pescar | alvo: pesqueiro | contínuo | 3 | fome · tem peixe · perto · paciência |
| 109 | **Fugir do perigo**<br>Um bicho bravo ou alguém hostil perto: corre para longe dele. | Fugir | alvo: animal, pessoa | contínuo | 5 | perigoso · perto · medo · não é minha caça |
| 110 | **Abrigar-se do frio em casa**<br>Com frio e casa, vai para dentro. | IrParaCasa | eu | contínuo | 3 | frio · tem casa |
| 111 | **Fazer uma fogueira**<br>Com frio e lenha à mão (ou sem casa), acende um fogo. | Aquecer | eu | contínuo | 2.8 | frio · tem lenha |

#### 2. Descanso

Dormir, descansar e se recuperar.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 201 | **Dormir em casa**<br>Cansado (mais ainda à noite), vai dormir em casa. | Dormir | eu | contínuo | 3 | cansaço · noite · tem casa |
| 202 | **Dormir ao relento**<br>Muito cansado e sem casa, deita onde está. | Dormir | eu | contínuo | 2.6 | cansaço · noite · sem casa |
| 203 | **Recuperar o fôlego**<br>Um pouco cansado no meio do dia: para um pouco. | FicarParado | eu | contínuo | 1.4 | cansaço · preguiça |

#### 3. Movimento

Ficar parado, vagar, explorar, voltar para casa e acompanhar alguém.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 301 | **Ficar parado**<br>Nada urgente: fica onde está, olhando em volta. É o piso de todo cérebro. | FicarParado | eu | contínuo | 0.25 | calma · preguiça |
| 302 | **Vagar por perto**<br>Sem nada para fazer, anda à toa por perto. | Vagar | sozinho | contínuo | 0.4 | tédio · não vagou agora |
| 303 | **Explorar a região**<br>Curioso (ou sem lugar para morar), anda para longe para conhecer a região. | Explorar | lugar | contínuo | 1.1 | curiosidade · sem casa ou entediado · não explorou agora · sem teto |
| 304 | **Voltar para casa ao anoitecer**<br>À noite, longe de casa, volta. | IrParaCasa | eu | contínuo | 2 | noite · tem casa · apego |
| 305 | **Acompanhar alguém querido**<br>Sozinho e com saudade, anda junto de um amigo ou parente que está perto. | Seguir | alvo: pessoa | contínuo | 1.2 | solidão · laço · perto |

### Mente

#### 4. Tédio e entretenimento

O tédio sobe quando nada acontece; cada um se distrai do seu jeito.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 401 | **Passear pela praça**<br>Entediado, vai passear onde há movimento (praça, mercado, beira da água). | Passear | eu | contínuo | 1.3 | tédio · sociável · mora num lugar |
| 402 | **Puxar conversa à toa**<br>Entediado, conversa com quem está perto (o laço muda com o jeito dos dois). | Conversar | alvo: pessoa | contínuo | 1.4 | tédio · perto · sociável · não é rival · não falou agora com ele |
| 403 | **Ir à taberna**<br>Entediado e com algum dinheiro, vai beber e prosear na taberna. | Festejar | alvo: oficina | contínuo | 1.6 | tédio · é taberna · tem dinheiro · sociável · perto |
| 404 | **Contemplar a paisagem**<br>Entediado mas calmo e devoto, senta e olha o mundo (o tédio passa devagar). | FicarParado | eu | contínuo | 0.9 | tédio · paciência · fé |
| 405 | **Mexer no ofício por gosto**<br>Trabalhador e entediado, faz algo do ofício sem ninguém pedir (um banco, uma panela). | Trabalhar | eu | contínuo | 1.1 | tédio · diligente · tem ofício |
| 406 | **Ir à festa**<br>Há festa no lugar: vai, mais ainda quem é sociável. | Festejar | alvo: evento | contínuo | 2.2 | é festa · do meu lugar · sociável · tédio |
| 407 | **Rezar**<br>A fé pede: reza no templo ou onde estiver. | Rezar | eu | contínuo | 1.6 | fé · devoto |

#### 5. Percepção e marcação

Dar tags a si, perceber tags nos outros, marcar alvos e esquecer o que mudou.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 501 | **Reconhecer o ofício de alguém**<br>Vê alguém que mostra um ofício e passa a saber o que ele faz ("ele é lenhador"): a tag vira crença. | PerceberTag | alvo: pessoa | instantâneo | 1.5 | perto · ele mostra um ofício · não reparou nele agora |
| 502 | **Reconhecer quem lidera**<br>Vê o líder do lugar e passa a saber quem é. | PerceberTag | alvo: pessoa | instantâneo | 1.4 | é o líder · ainda não sei · perto |
| 503 | **Assumir a identidade do ofício**<br>Pratica um ofício e já tem jeito nele: passa a se ver assim ("eu sou ferreiro") e a mostrar isso a todos. | DarTagASi | eu | instantâneo | 1.8 | pratica um ofício · já tem prática · ainda não se vê assim |
| 504 | **Largar a identidade antiga**<br>Trocou de ofício: deixa de se dizer o que era ("não sou mais pescador"). | TirarTagDeSi | eu | instantâneo | 1.8 | carrega um ofício velho |
| 505 | **Esquecer um ofício que mudou**<br>Achava que alguém fazia um ofício, mas ele não mostra mais: a crença sai. | EsquecerTag | alvo: pessoa | instantâneo | 1.2 | perto · crença vencida |
| 506 | **Marcar alguém como perigoso**<br>Alguém hostil se aproxima do lugar: marca-o como perigoso para todos verem. | MarcarAlvo | alvo: pessoa, animal | instantâneo | 2.4 | hostil · perto · ainda não marquei |
| 507 | **Reservar uma árvore para cortar**<br>Antes de ir cortar, marca a árvore como reservada (ninguém mais vai nela). | MarcarAlvo | alvo: arvore, rocha | instantâneo | 1.6 | preciso do que dá · não tenho outra reservada · perto · ninguém reservou · tem o que tirar |

### Vínculos

#### 6. Vida social

Conversar, fazer amigos, ajudar, brigar com rivais e evitar quem não gosta.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 601 | **Conversar com um conhecido**<br>Sentindo-se só, procura alguém de quem gosta para conversar. | Conversar | alvo: pessoa | contínuo | 2 | solidão · gosto dele · perto · não falou agora com ele |
| 602 | **Puxar amizade com alguém novo**<br>Sociável, vai conhecer alguém com quem tem afinidade. | Conversar | alvo: pessoa | contínuo | 1.6 | ainda não conhece · afinidade · sociável · perto · não falou agora com ele |
| 603 | **Ajudar quem passa fome**<br>Gentil e com comida sobrando, dá parte ao vizinho que tem fome. | Doar | alvo: pessoa | instantâneo | 2.4 | ele tem fome · tenho comida sobrando · gentileza · gosto dele · perto |
| 604 | **Discutir com um rival**<br>Agressivo, perto de quem detesta: briga (os dois saem piores). | Discutir | alvo: pessoa | instantâneo | 1.4 | detesta · agressividade · perto · não brigou agora |
| 605 | **Evitar um rival**<br>Pacífico, perto de quem detesta: se afasta. | Fugir | alvo: pessoa | contínuo | 1.3 | detesta · paz · perto |

#### 7. Família

Cortejar, casar, ter filhos, cuidar deles e de quem está doente.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 701 | **Cortejar alguém**<br>Adulto sem par, com um amigo muito próximo também sem par: corteja. | Cortejar | alvo: pessoa | contínuo | 2 | sou adulto · não sou casado · ele é adulto · ele não é casado · gosto muito · quer família · perto |
| 702 | **Casar**<br>Namorando há um tempo e o laço é forte: casa. | Casar | alvo: pessoa | instantâneo | 2.6 | namorando ele · ele não é casado · laço forte · quer família |
| 703 | **Ter um filho**<br>Casado, com casa, comida e lugar na casa: o casal tem um filho. | TerFilho | eu | instantâneo | 1.8 | casado · tem casa · quer família · cabe na casa · sem fome · não teve filho agora |
| 704 | **Cuidar do filho**<br>Vê o filho com fome ou sozinho e vai cuidar dele. | Cuidar | alvo: pessoa | contínuo | 2.8 | é meu filho · ele é criança · ele precisa · família |
| 705 | **Cuidar de um idoso**<br>Gentil, vê um idoso querido com fome e o ajuda. | Cuidar | alvo: pessoa | contínuo | 1.8 | é idoso · precisa · gosto dele · gentileza |

#### 17. Infância

Brincar, ficar perto dos pais e aprender olhando quem trabalha.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1701 | **Brincar**<br>Criança entediada brinca (sozinha ou com outras crianças perto). | Brincar | eu | contínuo | 2 | é criança · tédio |
| 1702 | **Ficar perto dos pais**<br>Criança longe dos pais (ou com medo) vai para perto deles. | Seguir | alvo: pessoa | contínuo | 2.2 | é criança · é meu pai ou mãe · longe |
| 1703 | **Olhar alguém trabalhar**<br>Criança curiosa observa um adulto no ofício (ganha um pouco de jeito para ele). | Aprender | alvo: pessoa | contínuo | 1.4 | é criança · ele mostra um ofício · curiosidade · perto |

### Lugar

#### 8. Moradia

Escolher onde ficar, juntar-se a quem já mora, levantar e ampliar a casa, abrir a oficina nela.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 801 | **Estabelecer-se aqui**<br>Sem teto, num sítio com água, comida e madeira ou pedra perto (e clima bom): decide que é aqui que vai morar. | Estabelecer | eu | instantâneo | 3 | sem teto · água perto · comida perto · material perto · pedra perto · clima · apego (cansou de andar) · olhou bastante |
| 802 | **Juntar-se a quem já mora perto**<br>Sem teto, perto de um lugar onde mora alguém de quem gosta: decide morar lá, com a casa perto da dele. | JuntarSe | alvo: assentamento | instantâneo | 3.4 | sem teto · gosto de quem mora lá · o lugar é bom · não está cheio · sociável · perto |
| 803 | **Procurar um sítio melhor**<br>Sem teto e onde está não serve: anda até o melhor sítio que viu. | IrPara | alvo: sitio | contínuo | 2.2 | sem teto · sítio bom · aqui é pior · perto |
| 804 | **Abrir a obra da minha casa**<br>Já decidiu onde morar e não tem casa: marca o terreno (perto dos vizinhos) e começa a obra. | ConstruirCasa | eu | instantâneo | 3 | assentado · sem casa · sem obra aberta · adulto |
| 805 | **Trabalhar na obra da minha casa**<br>Tem a obra da própria casa (ou da oficina) e material: bate nela até terminar. | Construir | alvo: obra | contínuo | 2.8 | é minha · tem material · disposição · diligente |
| 806 | **Ampliar a casa**<br>A família não cabe mais: abre a obra de um cômodo a mais (ou de um andar). | AmpliarCasa | eu | instantâneo | 2 | tem casa · casa apertada · sem obra aberta · ambição |
| 807 | **Abrir a oficina do meu ofício**<br>Já se vê no ofício e o lugar precisa dele: transforma parte da casa na oficina (padaria, marcenaria, ferraria...). | AbrirOficina | alvo: oficio | instantâneo | 2.4 | é o meu ofício · já me vejo nele · o ofício tem oficina · ainda não tenho · tem casa · o lugar precisa · ambição · sem obra aberta |

#### 9. Ficar, mudar ou fundar

Comparar o lugar onde mora com os outros conhecidos e com os sítios vazios.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 901 | **Ficar onde mora**<br>O lugar é bom, os laços estão aqui e mudar custa: fica. | Ficar | eu | instantâneo | 1 | o lugar é bom · não está cheio · laços aqui · apego · chegou há pouco |
| 902 | **Mudar-se para outro lugar**<br>Outro lugar conhecido está melhor (comida, espaço, amigos lá): a família se muda. | MudarSe | alvo: assentamento | instantâneo | 1 | não é o meu · o lugar é bom · não está cheio · amigos lá · desapego |
| 903 | **Fundar um lugar novo**<br>O lugar está cheio demais e há um sítio vazio bom: a família sai para começar de novo (fissão). | Fundar | alvo: sitio | instantâneo | 1 | sítio bom · aperto em casa · ousadia · não é o líder |

### Sustento

#### 10. Fazer eu mesmo

Cortar lenha, tirar pedra, colher, caçar, pescar e plantar para si e para a casa.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1001 | **Cortar lenha eu mesmo**<br>Precisa de madeira (casa, fogo, encomenda) e tem força: vai à árvore mais à mão e corta. | CortarLenha | alvo: arvore | contínuo | 2.6 | preciso de madeira · não é de outro · é a que reservei · tem madeira · perto · força · disposição · sou lenhador ou não tenho ofício |
| 1002 | **Tirar pedra eu mesmo**<br>Precisa de pedra e tem força: vai à rocha mais à mão e tira. | ExtrairPedra | alvo: rocha | contínuo | 2.4 | preciso de pedra · não é de outro · é a que reservei · tem pedra · perto · força · disposição · sou pedreiro ou não tenho ofício |
| 1003 | **Colher frutos para guardar**<br>A casa precisa de comida: colhe frutos e leva. | Coletar | alvo: arbusto | contínuo | 2.2 | preciso de comida · tem fruta · perto · sou coletor ou não tenho ofício |
| 1004 | **Caçar para a casa**<br>A casa precisa de comida e ele marcou uma presa: vai atrás dela. | Cacar | alvo: animal | contínuo | 2.4 | marquei a presa · preciso de comida · perto · coragem · sou caçador ou não tenho ofício |
| 1005 | **Marcar uma presa para a casa**<br>Caçador (ou quem precisa de comida) vê um animal sem dono e o marca como alvo de caça. | MarcarAlvo | alvo: animal | instantâneo | 2.2 | não estou caçando outra · preciso de comida · sou caçador · ninguém marcou · perto |
| 1006 | **Pescar para guardar**<br>A casa precisa de comida e há peixe perto: pesca e leva. | Pescar | alvo: pesqueiro | contínuo | 2.2 | preciso de comida · tem peixe · perto · paciência · sou pescador ou não tenho ofício |
| 1007 | **Plantar uma roça**<br>Mora num lugar com terra boa e a comida do mato não basta: abre uma roça. | Plantar | eu | contínuo | 2 | assentado · terra boa · falta comida · paciência · sou agricultor ou não tenho ofício · poucas roças |
| 1008 | **Colher a roça madura**<br>Uma roça do lugar está madura: colhe. | Colher | alvo: roca | contínuo | 2.8 | madura · do meu lugar · perto · sou agricultor |
| 1009 | **Levar a carga para casa**<br>Carregando bastante: leva para o estoque da casa (ou do lugar). | Entregar | eu | contínuo | 2.4 | carga · tem casa |

#### 11. Ofício

Escolher o ofício pela necessidade do lugar e pelo próprio jeito, trocar na falta, ensinar e aprender.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1101 | **Escolher um ofício**<br>Com gente para dividir o trabalho, escolhe o que fazer: o que o lugar sente faltar, o que ainda tem vaga, o próprio jeito e aptidão, o costume da família e o que a era permite. | EscolherOficio | alvo: oficio | instantâneo | 3.2 | sem ofício · falta no lugar · vaga · jeito · aptidão · era · costume · gente para dividir |
| 1102 | **Trocar de ofício**<br>O lugar sente muita falta de outro ofício e o dele está sobrando: quem tem mais jeito e abertura troca primeiro. | EscolherOficio | alvo: oficio | instantâneo | 2.4 | tem ofício · não é o atual · falta muito · o meu está sobrando · jeito · abertura · não trocou faz pouco |
| 1103 | **Ensinar o ofício a um filho**<br>Mestre no ofício, ensina o filho que o acompanha. | Ensinar | alvo: pessoa | contínuo | 1.6 | sou bom nisso · é meu filho · ele está perto · paciência · não ensinou agora |
| 1104 | **Aprender com quem sabe**<br>Ainda sem jeito no ofício, vai aprender com quem ele crê que é mestre nele. | Aprender | alvo: pessoa | contínuo | 1.4 | ainda sei pouco · ele faz o mesmo · confio nele · curiosidade · perto |

#### 12. O que o lugar pede

Pegar tarefas do quadro do lugar, acudir as urgentes e ajudar nas obras dos outros e nas públicas.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1201 | **Pegar uma tarefa do quadro**<br>O lugar tem tarefas abertas: pega a de mais prioridade que combina com o ofício e está perto. | FazerTarefa | alvo: tarefa | contínuo | 1 | prioridade · ofício · perto · vaga · amigos nela · não urgente |
| 1202 | **Acudir uma tarefa urgente**<br>Colheita, fogo ou alarme: qualquer adulto ajuda, mesmo fora do ofício. | FazerTarefa | alvo: tarefa | contínuo | 1.6 | urgente · prioridade · ofício · perto · vaga |
| 1203 | **Ajudar na obra de um vizinho**<br>Construtor (ou gentil e à toa) ajuda a levantar a obra de alguém do lugar. | Construir | alvo: obra | contínuo | 1.8 | do meu lugar · não é minha · tem material · sou construtor · gentileza · perto |
| 1204 | **Trabalhar na obra pública**<br>O líder mandou fazer uma obra e paga por ela: quem precisa do pagamento (e é leal) vai trabalhar. | Construir | alvo: obra | contínuo | 2 | é pública · do meu lugar · tem material · preciso do pagamento · lealdade · sou construtor · perto |
| 1205 | **Levar material à obra pública**<br>A obra que o líder mandou fazer está parada por falta de madeira ou pedra e ele tem: leva, e o tesouro paga. | Entregar | alvo: obra | contínuo | 2.6 | é pública · do meu lugar · tenho o que falta · o tesouro paga · lealdade · perto |
| 1206 | **Levar a produção ao celeiro**<br>Tem produção na mão e o lugar tem celeiro: leva para lá (o lugar todo come dela). | Entregar | eu | contínuo | 2 | carga · o lugar tem celeiro · falta comida · generosidade |

#### 100+. Pacotes de habilidade dos ofícios

Um Behavior-Ability Pair: o mesmo porquê (o lugar precisa do ofício, há disposição) ligado à habilidade de cada ofício. Quem passa a praticar um ofício ganha o pacote dele.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 10001 | **Trabalhar no meu ofício**<br>Pratica o ofício: o quanto o lugar precisa dele, a disposição e a diligência decidem; de noite quase ninguém trabalha. | Ability | eu | contínuo | 2.6 | o lugar precisa · disposição · diligência · é dia · sem fome |

Pacotes: 100 Ofício: Coletor, 101 Ofício: Caçador, 102 Ofício: Pescador, 103 Ofício: Agricultor, 104 Ofício: Lenhador, 105 Ofício: Pedreiro, 106 Ofício: Construtor, 107 Ofício: Pastor, 108 Ofício: Padeiro, 109 Ofício: Taberneiro, 110 Ofício: Marceneiro, 111 Ofício: Ferreiro, 112 Ofício: Tecelão, 113 Ofício: Oleiro, 114 Ofício: Comerciante, 115 Ofício: Sacerdote.

### Troca

#### 13. Comércio e contratação

Encomendar, comprar, trocar e vender; aceitar, recusar, cumprir e cancelar encomendas.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1301 | **Encomendar a quem faz**<br>Precisa de um bem e conhece alguém que o faz (tag percebida): encomenda e paga na entrega, em vez de fazer. | Contratar | alvo: pessoa | instantâneo | 2.6 | preciso do que ele faz · posso pagar · não quero fazer (fraco) · não quero fazer (tempo) · confio nele · sem encomenda aberta · ele está perto |
| 1302 | **Comprar de quem vende**<br>Precisa de um bem e alguém que o faz tem para vender agora: compra na hora. | Negociar | alvo: pessoa | instantâneo | 2.8 | preciso do que ele faz · ele tem para vender · posso pagar · ele está perto · não comprou agora dele |
| 1303 | **Trocar por escambo**<br>Sem dinheiro, mas com sobra de outro bem: propõe uma troca a quem faz o que precisa. | Negociar | alvo: pessoa | instantâneo | 2 | preciso do que ele faz · tenho sobra para dar · sem dinheiro · gosto dele · perto |
| 1304 | **Pôr a sobra à venda**<br>Tem sobra do que produz: põe à venda na porta de casa ou no mercado. | Negociar | eu | instantâneo | 1.6 | tenho sobra · ganância · ainda não vendo |
| 1305 | **Aceitar a encomenda**<br>Recebeu uma encomenda do que faz: aceita se quer o pagamento, se tem disposição e se gosta de quem pediu. | AceitarOferta | alvo: oferta | instantâneo | 2.6 | é para mim · ainda é proposta · é o que faço · quero o pagamento · ganância · disposição · gosto do cliente · tenho pronto ou dá para fazer |
| 1306 | **Recusar a encomenda**<br>A encomenda não compensa (cansado, já cheio de serviço, não gosta de quem pediu): recusa. | RecusarOferta | alvo: oferta | instantâneo | 1.2 | é para mim · ainda é proposta · cansado ou cheio · não gosto do cliente · não é bem o que faço |
| 1307 | **Entregar a encomenda**<br>Aceitou uma encomenda e já tem o bem (do estoque ou recém-feito): leva e recebe. | Entregar | alvo: oferta | contínuo | 3 | é minha para cumprir · aceita · tenho o bem |
| 1308 | **Cancelar uma encomenda parada**<br>Encomendou faz tempo e nada: desiste (e procura outro jeito). | CancelarOferta | alvo: oferta | instantâneo | 1.5 | é minha · parada há tempo · paciência |
| 1309 | **Pagar o que deve**<br>Está devendo a alguém e tem como pagar: paga. | Doar | alvo: pessoa | instantâneo | 2 | devo a ele · tenho como · lealdade |

### Sociedade

#### 14. Cidadania

Pedir um líder, candidatar-se, votar, apoiar ou protestar, pagar ou sonegar o imposto, alistar-se.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1401 | **Pedir que o lugar escolha um líder**<br>O lugar cresceu, não tem quem decida e já há brigas ou faltas: chama o povo para escolher um líder. | ConvocarEleicao | eu | instantâneo | 2 | mora no lugar · sem líder · sem eleição aberta · gente demais para combinar · brigas ou faltas · iniciativa |
| 1402 | **Candidatar-se a líder**<br>Há eleição: quem é ambicioso, carismático e querido se candidata. | Candidatar | eu | instantâneo | 3 | eleição aberta · adulto · ainda não sou candidato · ambição · carisma · popularidade |
| 1403 | **Votar em um candidato**<br>Há eleição: vota no candidato de quem mais gosta, com quem combina e que tem carisma e fama. | Votar | alvo: pessoa | instantâneo | 2.4 | eleição aberta · é candidato · ainda não votei · gosto dele · combina comigo · carisma dele · fama dele |
| 1404 | **Apoiar o líder**<br>Gosta do trabalho do líder: elogia em público (a aprovação dele sobe). | Apoiar | alvo: pessoa | instantâneo | 1.2 | é o líder · aprovo · lealdade · não falou agora |
| 1405 | **Protestar contra o líder**<br>Não gosta do trabalho do líder (imposto alto, fome, nada feito): protesta; muitos protestos derrubam o líder. | Protestar | alvo: pessoa | instantâneo | 1.6 | é o líder · desaprovo · rebeldia · agressividade · não protestou agora |
| 1406 | **Pagar o imposto**<br>O imposto venceu: paga ao tesouro (o leal e quem aprova o líder pagam sem pensar). | PagarImposto | eu | instantâneo | 2.2 | imposto devido · tenho como · lealdade · aprovo o líder |
| 1407 | **Sonegar o imposto**<br>O imposto venceu, mas é ganancioso e não gosta do líder: não paga. | Sonegar | eu | instantâneo | 1.6 | imposto devido · ganância · rebeldia · desaprovo o líder |
| 1408 | **Alistar-se**<br>O líder chamou às armas: o corajoso e leal se alista. | Alistar | eu | instantâneo | 2.4 | chamado · adulto · ainda não sou soldado · não é o líder · coragem · lealdade |

#### 15. Governo

O líder decide obras públicas, imposto, exército, festas e socorro pela própria personalidade.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1501 | **Mandar fazer uma obra de serviço**<br>Estrada, praça, prefeitura, poço, celeiro ou mercado que o lugar sente faltar: o líder diligente e gentil manda fazer. | OrdenarObra | alvo: obraPublica | instantâneo | 2.4 | sou o líder · é de serviço · o lugar precisa · o tesouro paga · sem obra aberta · diligência · gentileza |
| 1502 | **Mandar fazer uma obra de fé**<br>O povo sente falta de um templo: o líder devoto manda fazer. | OrdenarObra | alvo: obraPublica | instantâneo | 2.2 | sou o líder · é de fé · o lugar precisa · o tesouro paga · sem obra aberta · fé |
| 1503 | **Mandar fazer uma obra de defesa**<br>Há ameaça (ou o líder é belicoso): muralha ou quartel. | OrdenarObra | alvo: obraPublica | instantâneo | 2.2 | sou o líder · é de defesa · o lugar precisa · o tesouro paga · sem obra aberta · belicoso · coragem |
| 1504 | **Subir o imposto**<br>O tesouro não dá para o que o lugar precisa: o líder ganancioso ou ambicioso sobe o imposto. | DefinirImposto | alvo: imposto | instantâneo | 1.8 | sou o líder · é mais alto · um degrau só · tesouro curto · o povo aguenta · ambição · ganância · não mexeu agora |
| 1505 | **Baixar o imposto**<br>O povo reclama ou o tesouro sobra: o líder gentil baixa o imposto. | DefinirImposto | alvo: imposto | instantâneo | 1.8 | sou o líder · é mais baixo · um degrau só · o povo reclama · tesouro sobra · gentileza · não mexeu agora |
| 1506 | **Chamar o povo às armas**<br>Há ameaça (ou o líder é belicoso e o lugar cresceu): chama gente para o exército. | Recrutar | eu | instantâneo | 2.2 | sou o líder · ameaça · gente para isso · sem chamado ativo · belicoso |
| 1507 | **Distribuir comida do celeiro**<br>O povo passa fome: o líder gentil abre o celeiro. | Distribuir | eu | instantâneo | 2.4 | sou o líder · fome no lugar · gentileza · não distribuiu agora |
| 1508 | **Dar uma festa na praça**<br>O líder carismático faz festa para comemorar ou para recuperar o apoio do povo. | PromoverFesta | eu | instantâneo | 1.4 | sou o líder · o tesouro paga · carisma · apoio a recuperar ou a festejar · não festejou agora |
| 1509 | **Deixar o cargo**<br>Sem apoio nenhum, velho ou sem vontade: o líder deixa o cargo e o lugar escolhe outro. | Renunciar | eu | instantâneo | 1.5 | sou o líder · sem apoio · pouca ambição |

#### 16. Defesa

Defender o lugar, patrulhar, treinar e correr para o abrigo.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 1601 | **Defender o lugar**<br>Algo perigoso se aproxima: o soldado (ou o corajoso) enfrenta. | Atacar | alvo: pessoa, animal | contínuo | 4 | é perigoso · perto · soldado ou corajoso · coragem |
| 1602 | **Patrulhar**<br>Soldado em dia de serviço ronda o lugar. | Patrulhar | eu | contínuo | 2 | soldado · ameaça · disposição |
| 1603 | **Treinar**<br>Soldado sem ameaça treina com as armas. | Treinar | eu | contínuo | 1.6 | soldado · sem ameaça · diligência |
| 1604 | **Correr para o abrigo**<br>Ataque ao lugar: quem não luta corre para a praça ou para dentro da muralha. | Abrigar | eu | contínuo | 4.5 | ameaça · não sou soldado · medo · não está passando fome · não está com muita sede |

## O mundo agregado

O Ecosystem decide uma vez por ano ou por jornada, sem corpo: estes pacotes são pontuados pelo mesmo `Brain` (src/IAUS/npc/mundo).

### 31. Ofício do ano

Mundo agregado: uma vez por ano, cada adulto escolhe o ofício entre os que o lugar comporta.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 3101 | **Seguir um ofício**<br>Pela falta no lugar, pela vaga, pelo jeito e pela aptidão, pela era e pelo costume (o atual, o da família, a vocação do lugar). | EscolherOficio | alvo: oficio | instantâneo | 1 | falta · vaga · jeito · aptidão · era · costume |

### 32. Líder do lugar

Mundo agregado: o lugar sem líder escolhe um entre os adultos (ou o herdeiro, num reino).

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 3201 | **Escolher quem lidera**<br>Carisma, ambição, idade boa, amigos no lugar e, num reino, ser herdeiro. | Votar | alvo: pessoa | instantâneo | 1 | carisma · ambição · idade · amigos · herdeiro |

### 33. Mudança do ano

Mundo agregado: cada família compara ficar, migrar para um lugar conhecido e fundar num sítio vazio.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 3301 | **Ficar onde mora (família)**<br>A nota do lugar com o custo de mudar e a histerese, a lotação, os laços ali e o apego. | Ficar | eu | instantâneo | 1 | lugar · pressão · laços · apego |
| 3302 | **Migrar para um lugar conhecido**<br>A nota do outro lugar, a lotação de lá, os amigos e parentes lá e a afinidade; o apego pesa contra. | MudarSe | alvo: assentamento | instantâneo | 1 | lugar · pressão · laços · desapego |
| 3303 | **Fundar num sítio vazio**<br>A nota do sítio (no máximo um pouco acima da de casa), a pressão de casa (fissão) e a ousadia. | Fundar | alvo: sitio | instantâneo | 1 | sítio · pressão · ousadia |

### 34. Jornada

Mundo agregado: ao fim de cada tarefa, a próxima jornada entre as necessidades e o quadro do lugar.

| Id | Comportamento | Tipo | Contexto | Duração | Peso | Considerações |
|---|---|---|---|---|---|---|
| 3401 | **Comer (jornada)**<br>A fome aperta. | Comer | eu | instantâneo | 1.4 | fome |
| 3402 | **Descansar em casa (jornada)**<br>Cansado; o preguiçoso descansa antes. | Dormir | eu | instantâneo | 1.4 | cansaço · disposição |
| 3403 | **Conversar na praça (jornada)**<br>Sozinho há tempo, e mais se for sociável. | Conversar | eu | instantâneo | 1.1199999999999999 | solidão · sociável |
| 3404 | **Rezar no templo (jornada)**<br>Há templo e a fé chama, mais no devoto. | Rezar | eu | instantâneo | 1.1199999999999999 | fé · devoto |
| 3405 | **Pegar uma tarefa do quadro (jornada)**<br>Prioridade, ofício, distância e amigos na mesma tarefa. | FazerTarefa | alvo: tarefa | instantâneo | 1 | prioridade · ofício · perto · amigos |
| 3406 | **Acudir uma tarefa urgente (jornada)**<br>Colheita, fogo, muralha ou alarme: qualquer adulto ajuda. | FazerTarefa | alvo: tarefa | instantâneo | 1.6 | prioridade · ofício · perto · amigos |

## Tipos de comportamento (o quê)

| Tipo | O que faz |
|---|---|
| FicarParado | Fica onde está (parado, observando, recuperando o fôlego). |
| Vagar | Anda à toa por perto. |
| Explorar | Anda para longe, para conhecer a região. |
| IrPara | Anda até o alvo (ou até a posição do contexto). |
| IrParaCasa | Volta para casa. |
| Seguir | Anda junto com o alvo. |
| Fugir | Afasta-se do alvo. |
| Comer | Come do próprio estoque, do celeiro do lugar ou do alvo (fruta, peixe, caça). |
| Beber | Bebe água no alvo (rio, lago, poço). |
| Dormir | Dorme (em casa ou ao relento). |
| Aquecer | Faz fogo ou entra num abrigo para se aquecer. |
| Coletar | Colhe frutos do alvo. |
| CortarLenha | Corta a árvore do alvo e leva a madeira. |
| ExtrairPedra | Tira pedra da rocha do alvo. |
| Cacar | Persegue e abate o animal do alvo. |
| Pescar | Pesca no alvo. |
| Plantar | Prepara e semeia uma roça. |
| Colher | Colhe a roça madura do alvo. |
| Pastorear | Cuida dos animais da criação. |
| EscolherOficio | Passa a praticar o ofício do alvo (ou troca para ele). |
| FazerTarefa | Faz a tarefa do quadro do lugar no alvo. |
| Trabalhar | Trabalha no ofício (habilidade do pacote do ofício). |
| Produzir | Transforma um bem em outro na oficina do alvo. |
| Construir | Bate na obra do alvo (casa, oficina, obra pública). |
| ConstruirCasa | Abre a obra da própria casa perto de onde está (e perto dos vizinhos). |
| AbrirOficina | Transforma (parte da) casa na oficina do ofício do alvo. |
| AmpliarCasa | Abre a obra que aumenta a casa. |
| Entregar | Leva a carga ao estoque da casa, ao celeiro ou a quem encomendou. |
| Negociar | Propõe uma troca ou compra ao alvo (cria uma oferta). |
| Contratar | Encomenda ao alvo um serviço ou bem que ele faz (cria uma oferta de encomenda). |
| AceitarOferta | Aceita a oferta do alvo: entrega do estoque ou vai produzir. |
| RecusarOferta | Recusa a oferta do alvo. |
| CancelarOferta | Desiste de uma oferta que fez. |
| Doar | Dá comida ou bens ao alvo que precisa. |
| Conversar | Conversa com o alvo (o laço muda com o jeito dos dois). |
| Brincar | Brinca (crianças) ou se diverte sozinho. |
| Passear | Passeia pela praça, pelo mercado ou pela beira da água. |
| Festejar | Vai à festa ou à taberna. |
| Rezar | Reza no templo ou sozinho. |
| Cortejar | Corteja o alvo. |
| Casar | Casa com o alvo. |
| TerFilho | O casal tem um filho. |
| Cuidar | Cuida do alvo (filho, doente, idoso). |
| Ensinar | Ensina o ofício ao alvo. |
| Aprender | Aprende o ofício com o alvo. |
| Discutir | Briga com o alvo. |
| Estabelecer | Decide ficar aqui: o lugar vira a casa dele (e, sem vizinhos, um assentamento novo). |
| JuntarSe | Passa a morar no assentamento do alvo. |
| MudarSe | Muda a família para o assentamento do alvo. |
| Fundar | Sai para fundar um lugar novo no sítio do alvo. |
| Ficar | Fica onde mora (não muda). |
| ConvocarEleicao | Chama o povo para escolher um líder. |
| Candidatar | Candidata-se a líder. |
| Votar | Vota no candidato do alvo. |
| Apoiar | Apoia o líder em público. |
| Protestar | Protesta contra o líder. |
| PagarImposto | Paga o imposto ao tesouro do lugar. |
| Sonegar | Deixa de pagar o imposto. |
| DefinirImposto | O líder muda o imposto para a faixa do alvo. |
| OrdenarObra | O líder manda fazer a obra pública do alvo (paga pelo tesouro). |
| Recrutar | O líder chama gente para o exército. |
| Distribuir | O líder distribui comida do celeiro. |
| PromoverFesta | O líder faz uma festa na praça. |
| Renunciar | O líder deixa o cargo. |
| Alistar | Entra para o exército do lugar. |
| Patrulhar | Ronda o lugar. |
| Treinar | Treina com as armas. |
| Atacar | Ataca o alvo. |
| Abrigar | Corre para o abrigo. |
| DarTagASi | Dá uma tag a si mesmo ("eu sou lenhador"). (Tagging System) |
| TirarTagDeSi | Tira uma tag de si mesmo. (Tagging System) |
| MarcarAlvo | Marca uma tag no alvo, com o próprio id ("AlvoDeCaca:12"), visível a todos; com o param `eu`, marca a si junto ("Caçando"). (Tagging System) |
| DesmarcarAlvo | Tira a marca que pôs no alvo (e a de si, com o param `eu`). (Tagging System) |
| PerceberTag | Passa a crer que o alvo tem uma tag (ou as tags de ofício que o alvo mostra). (Tagging System) |
| EsquecerTag | Deixa de crer numa tag do alvo. (Tagging System) |

Total: 117 comportamentos em 21 pacotes e 16 pacotes de habilidade.
