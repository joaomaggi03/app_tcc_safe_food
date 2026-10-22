# Plano de Implementação — App de Gestão de Segurança Alimentar (RDC 216/2004)

> Documento de escopo para desenvolvimento incremental com o Claude Code.
> Projeto de TCC — João Lucas Maggi — Engenharia da Computação (UTFPR).

---

## 1. Visão geral e princípios do projeto

O objetivo é construir um app móvel que traduz as exigências da **RDC nº 216/2004** em checklists prontos e adaptados ao porte de cada estabelecimento, funcionando **offline** e calculando um **score de conformidade**, com **notificações de periodicidade** de inspeção.

**Princípios que guiam este plano:**

1. **Offline-first.** Todo o núcleo funciona sem internet, usando SQLite local (via `expo-sqlite`). O Supabase (nuvem/sincronização) entra só numa fase final e opcional.
2. **Construção por partes.** Cada fase entrega algo *funcional e testável* antes de seguir. Nunca se implementa "tudo de uma vez".
3. **Núcleo primeiro.** A ordem prioriza o que é diferencial do TCC: o **checklist baseado na norma**, o **filtro por perfil** e a **periodicidade**. Score vem logo em seguida. Plano de ação e exportação em PDF ficam por último (podem sair do escopo final).
4. **Dados no centro.** A modelagem da RDC 216 em categorias e itens é o coração do projeto — é a primeira coisa a estruturar depois do setup.
5. **Norma vira dado; periodicidade vira código.** O conteúdo técnico (o que verificar, temperaturas, prazos) é absorvido no seed da Fase 1. A frequência dos checks é regra de negócio do app, definida na Fase 5 — a norma só fixa a frequência da água (180 dias); o resto é decisão de boa prática assumida no trabalho.

---

## 2. Decisão de arquitetura

| Camada | Escolha inicial | Observação |
|---|---|---|
| Framework | **Expo (managed) + React Native** | Simplifica muito para quem está começando. |
| Navegação | **expo-router** | Navegação por arquivos, mais fácil de entender do que configurar rotas manualmente. |
| Linguagem | **TypeScript** | Ajuda a evitar erros e combina muito bem com o Claude Code. Se travar, dá pra usar JS, mas recomendo TS. |
| Banco local | **expo-sqlite** | Núcleo offline. É onde vive o checklist, respostas, inspeções. |
| Estado global | **Zustand** | Bem mais simples que Redux; suficiente para o app. |
| Notificações | **expo-notifications** | Para os alertas de periodicidade. |
| Nuvem (fase final) | **Supabase** | Auth + sincronização. **Não entra no começo.** |

**Por que offline-first e não Supabase desde já:** as funcionalidades centrais (checklist, filtro, score, periodicidade) são todas locais. Adiar o Supabase reduz a carga de aprendizado e reforça o argumento central da proposta (funcionamento offline). A autenticação começa local e migra para o Supabase Auth apenas quando a sincronização for implementada.

---

## 3. Modelo de dados (visão inicial)

Estrutura pensada para o SQLite. Serve de referência — o Claude Code vai criar as tabelas conforme cada fase precisar.

- **perfil_negocio** — tipos de estabelecimento (restaurante, lanchonete, padaria, food truck, feirante, ambulante). Cada um tem uma periodicidade padrão de inspeção.
- **categoria** — blocos temáticos da RDC (edificações, higienização, controle de pragas, abastecimento de água, manejo de resíduos, saúde dos manipuladores etc.).
- **item** — cada exigência da norma. Pertence a uma categoria, tem texto, referência ao artigo da RDC, e regras de aplicabilidade por perfil.
- **item_aplicabilidade** — liga item ↔ perfil, definindo quais itens aparecem para cada tipo de negócio (o "filtro inteligente").
- **inspecao** — uma sessão de vistoria (data, perfil usado, score final).
- **resposta** — resposta de cada item numa inspeção: `Adequado`, `Inadequado`, `Não se Aplica`, `Não Observado`.
- **item_oculto** — itens marcados como "Não se Aplica" que não devem mais aparecer nas próximas inspeções daquele estabelecimento (RF09).
- **config_periodicidade** — configuração de intervalo de inspeção por estabelecimento (RF05).

> **Revisão da implementação (set/2026).** O modelo implementado (schema v9, em `db/schema.ts`) difere desta visão inicial:
>
> - `perfil_negocio` chama-se **`perfil`**, e a periodicidade padrão da auditoria mora nele.
> - **Não existe `config_periodicidade`.** O intervalo editável é a coluna `estabelecimento.periodicidade_auditoria_dias`, copiada do perfil no cadastro.
> - **`inspecao` não guarda score.** O score é sempre derivado das respostas (ver a revisão da Fase 4). Ela guarda `trilha`, `modo`, `dia_local` e `total_itens`.
> - Tabelas que a visão inicial não previa: **`estabelecimento`** (o cadastro do RF02, âncora de todo dado do usuário), **`acao`** (o plano de ação do RF07) e **`meta`** (versão do seed carregado).
> - A regra que decidiu o que virou tabela: *vira tabela o que o SQL precisa cruzar*. Por isso os tópicos de cada item e os dias de funcionamento são colunas TEXT, e não tabelas.

---

## 4. Fases de desenvolvimento

Cada fase abaixo é uma "parte" a ser construída separadamente. A ordem respeita sua prioridade: **checklist e norma → periodicidade → score**, com o resto depois.

### Fase 0 — Setup do projeto e fundações
**Objetivo:** ter um app Expo rodando no celular/emulador com navegação básica.

- Criar projeto Expo com TypeScript.
- Configurar `expo-router` com 2–3 telas placeholder (Início, Nova Inspeção, Histórico).
- Definir estrutura de pastas (ex.: `app/`, `db/`, `components/`, `data/`, `store/`).
- Rodar no Android Studio (emulador) e/ou no celular pelo app Expo Go.

**Critério de pronto:** o app abre, navega entre telas e não quebra.

**Prompt sugerido para o Claude Code:**
> "Crie um projeto Expo com TypeScript e expo-router. Quero três telas placeholder (Início, Nova Inspeção, Histórico) com navegação por abas. Explique cada passo, porque sou iniciante em React Native. Não configure banco de dados ainda."


> **Revisão da implementação (set/2026).** As três abas planejadas — Início, Nova Inspeção e Histórico — foram substituídas por três **perguntas**: **Hoje** ("o que eu faço agora?"), **Conformidade** ("como estou?") e **Estabelecimento** ("como o app está configurado?"). O desenho original tinha dois defeitos: o Início listava as três trilhas e cada linha levava a Nova Inspeção, que listava as três trilhas de novo (um menu apontando para outro menu); e a rotina diária, usada várias vezes por dia, ficava a três toques — a mesma distância da auditoria, que roda uma vez por mês.
>
> - `app/historico.tsx` foi removido. O histórico virou parte da aba Conformidade, **separado por trilha**: numa lista corrida, as ~26 diárias do mês afogam a única auditoria.
> - `/nova-inspecao` continua existindo como rota sem aba (`href: null`), aberta pelo "+" do cabeçalho. Deixou de ser destino fixo porque não é um lugar: é uma ação, e das raras.
> - **O Expo Go deixou de bastar.** O `expo-notifications` não carrega nele no Android (SDK 53+), o que mantinha os alertas desligados. O app roda hoje num *development build* gerado pelo EAS (`eas.json`).

---

### Fase 1 — Estruturar a RDC 216 em dados (o coração do projeto)
**Objetivo:** transformar a norma em categorias e itens estruturados, num arquivo de dados (seed).

- Criar taxonomia de categorias com base na RDC (edificações/instalações, higienização, controle integrado de pragas, abastecimento de água, manejo de resíduos, manipuladores, matérias-primas, preparo/armazenamento, exposição/transporte, documentação/POP).
- Para cada item: texto da exigência, categoria, artigo de referência da RDC, e a quais perfis se aplica.
- Salvar tudo como um seed (`data/rdc216.ts` ou `.json`) que depois popula o SQLite.

**Critério de pronto:** um arquivo de dados com as categorias e um primeiro conjunto de itens (não precisa ser os 160 de uma vez — comece por 2–3 categorias completas para validar o formato).

> **Nota:** você me disse que tem a norma mas ainda não organizou os itens. **Esta fase é onde eu te ajudo diretamente**: podemos, aqui no chat, extrair e estruturar os itens da RDC 216 num formato pronto pra colar no projeto. Recomendo fazer isso comigo antes de mandar o Claude Code implementar, porque a qualidade desse seed define a qualidade de todo o resto.

**Prompt sugerido para o Claude Code (depois de termos o seed):**
> "Tenho um arquivo de dados com categorias e itens da RDC 216 neste formato: [colar]. Crie o schema SQLite (expo-sqlite) para categorias, itens e aplicabilidade por perfil, e uma função de seed que popula o banco na primeira execução do app."


> **Revisão da implementação (set/2026).** O seed não parou nas "2–3 categorias completas" sugeridas como validação de formato: `data/rdc216.ts` tem **6 perfis, 12 categorias, 89 itens e 447 regras de aplicabilidade**.
>
> - A estimativa de ~160 itens não se confirmou. **89 itens** cobrem a norma sem repetição — o número alto da estimativa vinha de contar parágrafos, não exigências distintas.
> - O item ganhou campos que o plano não previa: `critico` (usado pelo score), `momento` (a hora do expediente em que o check cabe) e `topicos`.
> - **Os `topicos` são reescrita nossa, não texto da RDC.** São 1 a 3 frases curtas com o essencial, e é o que aparece no checklist — os itens redigidos na linguagem da norma eram difíceis de responder no meio do expediente. Por isso o texto integral continua acessível a um toque, no botão "Ver texto da norma".

---

### Fase 2 — Perfil de negócio + geração do checklist dinâmico (RF02 + RF03)
**Objetivo:** o usuário escolhe o tipo de estabelecimento e o app monta o checklist filtrado.

- Tela de configuração de perfil no primeiro acesso (RF02).
- Lógica que gera a lista de verificação filtrando itens por perfil (RF03) — o "filtro inteligente".
- Tela que exibe o checklist agrupado por categoria.

**Critério de pronto:** escolher "food truck" mostra um checklist diferente de "restaurante", ocultando itens não aplicáveis.

**Prompt sugerido:**
> "Crie uma tela de seleção de perfil de negócio que salva a escolha no SQLite. Depois, crie a tela de checklist que lê os itens do banco filtrados pelo perfil selecionado, agrupados por categoria. Mostre como testar com dois perfis diferentes."


> **Revisão da implementação (set/2026).** Cumprida como planejada. O cadastro cresceu depois, em campos que o plano não previa: `cidade` e `responsavel` (schema v2), `periodicidade_auditoria_dias` (Fase 5) e `dias_funcionamento` (schema v6 — ver a revisão da Fase 5).

---

### Fase 3 — Execução da inspeção (RF06 + RF09)
**Objetivo:** responder cada item e tratar o "Não se Aplica".

- Para cada item, quatro opções: `Adequado`, `Inadequado`, `Não se Aplica`, `Não Observado` (RF06).
- Salvar respostas de uma inspeção no SQLite.
- Ao marcar "Não se Aplica", o item não aparece mais nas próximas inspeções daquele estabelecimento (RF09) e não conta no score.

**Critério de pronto:** dá pra preencher uma inspeção inteira; itens marcados "Não se Aplica" somem nas inspeções seguintes.

**Prompt sugerido:**
> "Adicione a cada item do checklist quatro botões de resposta (Adequado, Inadequado, Não se Aplica, Não Observado) e salve as respostas de uma inspeção no SQLite. Quando o usuário marcar 'Não se Aplica', registre esse item como oculto para futuras inspeções deste estabelecimento."


> **Revisão da implementação (set/2026).** Cumprida, com duas diferenças.
>
> - **O "Não se Aplica" é reversível.** O plano dizia que o item some das próximas inspeções, mas não dizia como desfazer. A lista de itens ocultos fica na aba Estabelecimento: esconder um item é uma decisão do usuário sobre o próprio negócio, e decisão que não se desfaz vira armadilha.
> - **A execução não é uma tela, é um componente.** Saiu de `app/inspecao.tsx` para `components/ExecucaoInspecao.tsx`, porque tem dois donos: a aba Hoje e a rota `/inspecao`. A tela que hospeda injeta o que vem acima da lista e o botão extra do cabeçalho.

---

### Fase 4 — Score sanitário (RF04)
**Objetivo:** calcular a pontuação de conformidade ao fim da inspeção.

- Cálculo do score a partir das respostas (ex.: percentual de "Adequado" sobre os itens aplicáveis; "Não se Aplica" e "Não Observado" tratados conforme regra definida).
- Tela de resultado com o score e resumo por categoria.

**Critério de pronto:** ao concluir uma inspeção, aparece um score coerente e reprodutível.

**Prompt sugerido:**
> "Crie a função que calcula o score de conformidade de uma inspeção: percentual de itens 'Adequado' sobre o total de itens aplicáveis, excluindo 'Não se Aplica'. Mostre o score numa tela de resultado com um resumo por categoria. Explique a fórmula."


> **Revisão da implementação (set/2026).** Foi a fase que mais se afastou do plano.
>
> - **A fórmula não é a sugerida.** Não é o percentual simples de "Adequado" sobre os aplicáveis: é **ponderada**, com `PESO_CRITICO = 3` substituindo o peso do seed nos itens críticos. E "não observado" também fica **fora do denominador**, não só "não se aplica" — não observar não é reprovar.
> - **Denominador zero devolve `null`, nunca 0%.** "Nada avaliado" e "tudo inadequado" são coisas diferentes, e um 0% na tela mentiria sobre a primeira.
> - **Surgiu uma segunda métrica, que o plano não previa:** o `atendimento`, contagem simples (cada item vale um). É a única comparável com a lista de verificação da **RDC 275/2002**, que não tem peso, e com as faixas dela — 76–100 / 51–75 / 0–50 (`db/faixa.ts`). Aparece só na auditoria periódica, que é o análogo estrutural daquela lista; carimbar um grupo numa rotina diária de 12 verificações seria inventar. A 275 é norma de indústria, então a faixa é critério **adaptado**, e a tela declara isso.
> - **Decidido NÃO fazer um score geral composto** entre as trilhas: nenhuma norma ou roteiro de VISA combina inspeções de periodicidades diferentes num número, e os pesos seriam arbitrários. A aba Hoje mostra **quatro leituras** em vez de uma média — num mês há ~26 diárias contra 1 auditoria, e qualquer média entre elas seria dominada pelas diárias.
> - O score é **sempre derivado das respostas, nunca gravado**, e parte da tabela `resposta` e não do checklist atual — para que uma inspeção antiga não mude de nota quando o checklist mudar.

---

### Fase 5 — Periodicidade e notificações (RF05)
**Objetivo:** organizar os checks em trilhas de periodicidade e avisar o usuário antes de cada vencimento.

#### 5.0 Princípio: de onde vem a periodicidade

A RDC 216 **quase não fixa frequências** de verificação. A única frequência legal explícita é a da água/reservatório (a cada 180 dias). Todo o resto — de quanto em quanto tempo refazer o checklist — é **regra de negócio do app**, uma decisão de boa prática assumida no TCC. Consequência prática: a norma e a cartilha são fonte do *conteúdo* (o que verificar, já estruturado no seed da Fase 1); a *lógica de periodicidade* é código. A lógica não precisa "entender" temperatura ou higiene — ela só manipula datas e intervalos.

#### 5.1 As três trilhas

O campo `frequencia` de cada item no seed define em qual trilha ele entra:

- **Diária** (`frequencia: 'diario'`): checklist rápido do dia a dia (manuseio, temperatura, higiene). Intervalo = 1 dia. Decisão do app (a norma não exige).
- **Periódica / auditoria completa** (`frequencia: 'periodico'`, mais todos os demais): percorre **todos** os itens do perfil. Intervalo = `periodicidadeAuditoriaDias` do perfil (padrão 30 dias, configurável). Decisão do app.
- **Semestral / legal** (`frequencia: 'semestral'`): itens de água/reservatório. Intervalo = 180 dias, lido do campo `periodicidadeDias` do item. **Vem da norma** — o app trata como obrigação, não como opção editável.

Opcional: a trilha diária pode ter um modo "essencial" (só itens `critico`, via `itensDiariosEssenciais`) para um check ultrarrápido.

#### 5.2 Modelo de dados (novas tabelas SQLite)

> ⚠️ **Substituída na implementação:** a tabela `status_trilha` abaixo **não foi criada**. A última conclusão sai de `inspecao.dia_local` e o intervalo de `estabelecimento.periodicidade_auditoria_dias`. Ver a revisão ao fim desta fase. O texto original fica como registro do que foi planejado.

Guardar, por estabelecimento e por trilha, a data do último check concluído:

- **status_trilha** — `estabelecimento_id`, `trilha` ('diario' | 'periodico' | 'semestral'), `ultima_conclusao` (data ou nulo), `intervalo_dias`. Uma linha por trilha por estabelecimento. O `intervalo_dias` é copiado na criação (1 / periodicidade do perfil / 180) e, no caso da periódica, pode ser editado pelo usuário.

Não é preciso uma tabela nova de "vencimento": o próximo vencimento é **calculado**, não armazenado (evita dados desatualizados).

#### 5.3 Lógica de cálculo (mesma para as três trilhas)

```
proximoVencimento(trilha, estabelecimento):
    base = trilha.ultima_conclusao ?? estabelecimento.data_cadastro
    retorna base + trilha.intervalo_dias

estaVencido(trilha, estabelecimento, hoje):
    retorna hoje >= proximoVencimento(trilha, estabelecimento)

diasParaVencer(trilha, estabelecimento, hoje):
    retorna proximoVencimento(trilha, estabelecimento) - hoje   // em dias
```

Regras de borda (implementadas em `db/vencimento.ts`, com `ultima_conclusao` lida da última inspeção concluída da trilha):
- Se `ultima_conclusao` é nula (nunca fez o check), o prazo conta a partir do cadastro → nasce vencido/no primeiro dia. Isso puxa o usuário a fazer o primeiro check.
- Ao concluir um check de uma trilha, gravar `ultima_conclusao = hoje` naquela linha de `status_trilha`. O próximo vencimento se recalcula sozinho.

#### 5.4 Notificações (expo-notifications)

Uma rotina diária (ou na abertura do app) percorre as trilhas de cada estabelecimento e agenda/dispara alerta quando `diasParaVencer <= antecedencia` da trilha. Antecedências sugeridas (configuráveis):

- Diária: no próprio dia (antecedência 0).
- Auditoria periódica: 5 a 7 dias antes.
- Semestral (água): 15 a 30 dias antes (dá tempo de agendar o laudo/serviço).

Refinamento opcional (UX, fora do MVP): usar `critico` e a trilha para modular o destaque/insistência do alerta — um vencimento crítico notifica com mais ênfase.

**Critério de pronto:** cada estabelecimento mostra o status das três trilhas (em dia / vence em X dias / vencido); concluir um check reseta o relógio daquela trilha; o app agenda e dispara um alerta local antes do vencimento.

**Prompt sugerido para o Claude Code:**
> "Implemente a periodicidade em três trilhas (diária = 1 dia; periódica = periodicidade do perfil, padrão 30 dias, editável; semestral = 180 dias, vinda do seed). Crie a tabela `status_trilha` no SQLite com a data da última conclusão por trilha e por estabelecimento. Escreva as funções `proximoVencimento`, `estaVencido` e `diasParaVencer` conforme o pseudocódigo do plano, tratando o caso de nunca ter feito o check (conta a partir do cadastro). Depois, com expo-notifications, agende alertas com antecedência por trilha (diária no dia; periódica 5-7 dias antes; semestral 15-30 dias antes). Mostre como testar no emulador/celular. Sou iniciante, então explique cada passo."


> **Revisão da implementação (set/2026).** **A tabela `status_trilha` da seção 5.2 NÃO foi criada** — e esta é a maior divergência entre o plano e o código.
>
> - A data da última conclusão já estava em `inspecao.dia_local`, e o intervalo editável em `estabelecimento.periodicidade_auditoria_dias`. Criar a tabela seria manter **uma segunda verdade** sobre o mesmo fato, com o risco de as duas discordarem. Vencimento é sempre **derivado**, nunca gravado — como o score.
> - O pseudocódigo de 5.3 continua valendo, mas repartido: `db/vencimento.ts` tem a regra **pura** (em dia / vence em breve / vencida / nunca feita) e `db/datas.ts` as contas de data; `db/periodicidade.ts` lê o banco e chama a regra. Puros de propósito: compilam e são testáveis fora do aparelho.
> - **Antecedências implementadas: 0 / 7 / 30 dias** (o plano sugeria 0 / 5–7 / 15–30).
> - **O modo "essencial" de 5.1 virou outra coisa.** Em vez de "só os itens críticos", a diária tem dois modos: **Rotina** (11 verificações guiadas, 12 nos perfis móveis, que reagrupam os mesmos 32 itens em perguntas técnicas, citando os artigos que cada uma cobre) e **Completa** (item a item). O agrupamento é decisão do app; o banco continua gravando resposta item a item, e o score não muda.
> - **A diária não é de início de expediente.** Dos 32 itens diários, 11 são estado conferível antes de abrir, 19 só existem com a operação rodando e 2 a norma amarra ao fim do trabalho. Por isso a inspeção diária fica **aberta o dia todo** e é concluída no fechamento.
> - **Acréscimo não previsto pelo plano: os dias de funcionamento** (schema v6). O cadastro pergunta em que dias da semana o estabelecimento abre, e o app para de cobrar a diária nas folgas — era o defeito que feirante e ambulante, 2 dos 6 perfis, sofriam todo dia.

---

### Fase 6 — Autenticação e sincronização com Supabase (final / opcional)
**Objetivo:** contas de usuário e backup na nuvem.

- Auth pelo Supabase Auth (RF01). *(A etapa de "auth local" prevista aqui foi descartada: o app não tem login local, e o núcleo não precisa de um.)*
- Sincronização SQLite ↔ Supabase (PostgreSQL) quando houver internet.

> Só entrar aqui depois que todo o núcleo (Fases 1–5) estiver estável. Se o tempo apertar, esta fase pode ficar como "trabalho futuro" no TCC.

#### 6.0 Princípio: sincronizar fatos, não conclusões

O app **não grava nenhum número calculado**. Score, atendimento, faixa da RDC 275, vencimento, sequência de dias e situação das ações corretivas são todos derivados na hora da leitura, a partir das respostas. Essa decisão, tomada lá na Fase 4 por outro motivo (uma inspeção antiga não pode mudar de nota quando o checklist muda), é o que torna a sincronização viável.

Consequência: **sobem os fatos crus, nunca as conclusões**. O problema clássico de sincronização — dois lados calcularam números diferentes e agora não se sabe qual vale — não existe neste projeto. Cada aparelho recalcula tudo a partir dos mesmos fatos e chega ao mesmo resultado.

#### 6.1 O que sincroniza e o que não sincroniza

**Não sincroniza — o catálogo da norma.** `perfil`, `categoria`, `item` e `item_aplicabilidade` vêm do `data/rdc216.ts` pelo seed, versionados por `VERSAO_SEED`. São **código**, não dado do usuário: a mesma versão do app produz o mesmo catálogo em qualquer aparelho. Subir isso para a nuvem seria transportar o que já viaja no APK.

**Não sincroniza — o que é derivado.** Ver 6.0.

**Sincroniza — as cinco tabelas de fato do usuário:**

| tabela | o que é |
|---|---|
| `estabelecimento` | o cadastro (RF02) |
| `inspecao` | cada inspeção feita, de qualquer trilha |
| `resposta` | as quatro respostas do RF06, item a item |
| `item_oculto` | as decisões de "não se aplica" do RF09 |
| `acao` | o plano de ação corretiva do RF07 |

#### 6.2 Os três obstáculos do schema atual

**a) As chaves colidem.** `estabelecimento`, `inspecao` e `acao` usam `INTEGER PRIMARY KEY AUTOINCREMENT`. Dois aparelhos — ou o mesmo aparelho depois de uma reinstalação — geram `id = 1` para inspeções diferentes, que colidem ao subir. E `resposta` e `item_oculto` têm chave primária composta pendurada nesses ids.

**b) Não há como saber o que mudou.** Nenhuma tabela registra quando a linha foi escrita pela última vez. Sem isso, sincronizar é reenviar tudo, sempre.

**c) Apagar não deixa rastro.** O app apaga de verdade: ação excluída, item oculto revertido (o RF09 é reversível), diária refeita. Um `DELETE` local não tem como virar um delete na nuvem — o outro lado só vê ausência, que é indistinguível de "ainda não chegou".

#### 6.3 Modelo de dados (schema v10, aditivo)

Cada uma das cinco tabelas ganha três colunas — **sem trocar as chaves primárias**:

```sql
uuid           TEXT UNIQUE,  -- identidade GLOBAL, gerada no aparelho
atualizado_em  TEXT,         -- UTC ISO, tocado em TODA escrita
excluido_em    TEXT          -- lápide: apagar vira marcar
```

O `uuid` **ao lado** do `id`, e não no lugar dele: o app continua usando o inteiro por dentro, nenhuma tela muda, e o UUID existe só na fronteira da sincronização. É a mesma escolha já feita em `dias_funcionamento` e em `topicos` — acrescentar coluna em vez de reescrever o que funciona.

O `excluido_em` muda uma regra do app: **`DELETE` vira `UPDATE`**, e toda leitura passa a filtrar `WHERE excluido_em IS NULL`. É a mudança mais invasiva do pacote e é inevitável: não existe sincronização de exclusão sem lápide.

Do lado do Supabase, cinco tabelas espelho com uma coluna `usuario_id` (o `auth.uid()`) e políticas de RLS que só deixam cada usuário ver as próprias linhas.

#### 6.4 O algoritmo

O marcador da última sincronização cabe na tabela `meta`, que já existe. **Nenhuma tabela nova.**

```
sincronizar(usuario):
    ultimo = meta['ultimo_sync']            // nulo na primeira vez

    // SUBIDA — respeitando a ordem das chaves estrangeiras
    para cada tabela em [estabelecimento, inspecao, resposta, item_oculto, acao]:
        envia as linhas onde atualizado_em > ultimo

    // DESCIDA
    para cada tabela na MESMA ordem:
        recebe as linhas do servidor onde atualizado_em > ultimo
        casa pelo uuid: existe -> atualiza; não existe -> insere

    meta['ultimo_sync'] = agora()
```

A ordem importa nas duas direções: `estabelecimento` antes de `inspecao`, e `inspecao` antes de `resposta`, `item_oculto` e `acao` — senão a chave estrangeira recusa a linha filha.

#### 6.5 Conflitos que são do domínio, não do relógio

Regra geral: **vence a escrita mais recente** (`atualizado_em`), linha a linha. Os dados do app são quase todos do tipo "escreveu uma vez", então conflito real é raro.

Mas duas invariantes criadas pelo próprio app não sobrevivem a um merge por timestamp:

- **Uma ação ABERTA por item e estabelecimento** (o índice único parcial do RF07). Dois aparelhos criam cada um a sua para o mesmo item; ambas são válidas localmente e colidem ao juntar. Regra: fica a de `criada_em` mais antiga; a outra é absorvida.
- **Uma diária por `dia_local`.** Mesma classe de problema.

Nenhuma das duas se resolve por relógio: são decisões de domínio. Por isso merecem estar escritas no TCC — é onde a sincronização deixa de ser um problema genérico e vira um problema deste app.

#### 6.6 Onde o código mora

Um módulo novo, `db/sincronizacao.ts`, que **ninguém do núcleo importa**. A regra 1 do projeto continua valendo: `db/consultas.ts` nunca sabe que existe rede, e falha de sincronização é silenciosa — o app inteiro funciona sem ela, como funciona hoje.

Dispara em três momentos: na abertura do app, ao reconectar (`expo-network`) e ao concluir uma inspeção. Nunca bloqueia a interface.

#### 6.7 Escopo recomendado: uma mão antes de duas

**Faça primeiro o backup de mão única** — o aparelho sobe, o servidor recebe, nada desce. Isso entrega o valor real ("perdi o celular e não perdi as inspeções"), precisa apenas de `uuid` e `atualizado_em`, e **dispensa lápide, merge e resolução de conflito**, que é onde mora a maior parte da dificuldade.

Sincronização de duas mãos só se justifica se o cenário for "dois aparelhos no mesmo estabelecimento". Se não for, é complexidade sem usuário — e essa é uma conclusão legítima para registrar no TCC.

**Critério de pronto:** login funciona; os dados locais sobem para a nuvem ao reconectar; e, desligada a rede, o app continua inteiro — que é o teste que importa.

> **Revisão da implementação (set/2026) — etapa de mão única FEITA.** Login opcional pelo Supabase Auth (e-mail e senha) e backup de mão única, com estas diferenças em relação a 6.3–6.7:
>
> - **Gatilhos em vez de código.** `atualizado_em` é carimbado por gatilho do SQLite em todo INSERT/UPDATE, e nenhuma escrita do `db/consultas.ts` mudou. O `uuid` foi só para as tabelas de id inteiro (`estabelecimento`, `inspecao`, `acao`); `resposta` e `item_oculto` já têm chave natural.
> - **Sem lápide.** Em vez de trocar DELETE por "marcar como apagado" (o que mexeria em toda leitura), um gatilho anota cada exclusão em `sync_exclusao`, e o backup a repassa. As exclusões sobem **antes** das linhas.
> - Acréscimo: **restauração num aparelho vazio** — o caso "perdi o celular" — sem merge. Juntar dois aparelhos com dados continua sendo a etapa de duas mãos, não feita.
> - **Um aparelho, uma conta.** O histórico de um aparelho pertence à primeira conta que fez backup dele; outra conta pode entrar, mas o backup fica parado com aviso. (Os uuids já são dela na nuvem, e a RLS recusaria os de outra.)
> - **"Ao reconectar" (6.6) é o retorno do app ao primeiro plano** (`AppState`), e não um detector de rede (`expo-network`): sem dependência nova, e cobre o caso real — quem ficou sem sinal e volta a usar o app.
> - **Login opcional diverge do P-RF01** ("para que ele possa acessar o aplicativo"). Decisão: offline-first — exigir login travaria quem abre o app sem sinal. Ajustar o texto do TCC (seção 7).
> - **Supabase Storage não é usado** (a proposta, P-TEC-2, cita "armazenamento de arquivos"). Candidato: o PDF do RF08.
> - **Critério de pronto verificado no aparelho (27/set/2026)** contra o Supabase real: login, backup manual e automático, modo avião (app inteiro offline, subida ao voltar), restauração em aparelho limpo e bloqueio de outra conta.

**Prompt sugerido para o Claude Code:**
> "Implemente a Fase 6 em duas etapas. Primeiro o schema v10, aditivo: acrescente `uuid`, `atualizado_em` e `excluido_em` às tabelas `estabelecimento`, `inspecao`, `resposta`, `item_oculto` e `acao`, sem trocar as chaves primárias, e faça toda escrita tocar o `atualizado_em`. Depois o `db/sincronizacao.ts`, com a SUBIDA apenas (mão única), na ordem das chaves estrangeiras, usando o marcador `ultimo_sync` da tabela `meta`. O módulo não pode ser importado por `db/consultas.ts`: falha de rede tem que ser silenciosa e o app tem que funcionar inteiro offline. Mostre como testar em modo avião. Sou iniciante, então explique cada passo."

---

### Fora do núcleo (podem ficar de fora do projeto final)
- **RF07 — Geração do plano de ação corretiva.**
- **RF08 — Exportação de relatórios em PDF.**

Deixe estes por último. Se implementados, viram diferencial; se não, ficam documentados como trabalhos futuros.


> **Revisão da implementação (set/2026).** O **RF07 foi implementado**, e antes da Fase 6, por decisão do autor: fecha o ciclo "inspeciono → vejo o que falhou → sei o que fazer" sem depender de rede, o que deixa a Fase 6 livre para virar trabalho futuro. Ver a tabela `acao`, o módulo puro `db/acao.ts` e as telas `app/plano-acao.tsx` e `app/acao.tsx`. O **RF08 (PDF) não foi iniciado.**

---

## 5. Mapa Fase → Requisito → Cronograma

| Fase | Requisitos | Mês previsto (cronograma da proposta) | Situação (20/out/2026) |
|---|---|---|---|
| 0 — Setup | — | Jun | ✅ concluída |
| 1 — Dados da RDC | base p/ RF03 | Jun | ✅ concluída |
| 2 — Perfil + checklist | RF02, RF03 | Jul (RF02) · Ago (RF03) | ✅ concluída |
| 3 — Execução da inspeção | RF06, RF09 | Ago (RF06) · Set (RF09) | ✅ concluída |
| 4 — Score | RF04 | Set | ✅ concluída |
| 5 — Periodicidade | RF05 | Out | ✅ concluída |
| 6 — Auth + Supabase | RF01 | Jul (feito em set) | ✅ mínima (login opcional + backup de mão única + restauração), testada no aparelho |
| Fora do núcleo | RF07, RF08 | Out | RF07 ✅ · RF08 ⏳ não iniciado — deve escorregar para o início de novembro, depois dos pedidos do orientador (combinar com ele; se apertar, o plano pronto para um item é o primeiro a cortar) |
| Extra (fora dos RFs) | — | — | ✅ notificação fixa de inspeção em andamento, com progresso (pedido do autor; ver CLAUDE.md) |
| Extra (pedido do orientador, 20/out) | — | Out | 🔶 janelas de horário da diária ✅ (schema v11) · pendências ✅ (schema v12) · alerta por etapa ⏳ · plano de ação pronto para 1 item ⏳ — ver CLAUDE.md |

> Na proposta, o RF01 estava marcado para **julho** — é o único requisito atrasado em relação ao cronograma dela. O RF05 e o RF07 (outubro na proposta) foram entregues antes.

---

## 6. Como conduzir cada fase com o Claude Code

1. **Uma fase por vez.** Só comece a próxima quando a anterior estiver testada no celular/emulador.
2. **Peça explicações.** Como você é iniciante, sempre peça que o Claude Code explique o que cada arquivo faz.
3. **Teste antes de avançar.** Cada fase tem um "critério de pronto" — não pule.
4. **Commit por fase.** Faça um commit no Git ao fim de cada fase para conseguir voltar atrás se algo quebrar.
5. **Traga o seed pronto.** A Fase 1 (dados da RDC) rende muito mais se você e eu estruturarmos os itens aqui no chat antes.

---

## 7. Próximo passo

*(Atualizado em 24/set/2026. O texto original apontava para a Fase 1, já concluída.)*

1. ~~**RF01 mínimo**~~ — concluído e testado no aparelho (ver a revisão da Fase 6).
1. **Pedidos do orientador (20/out/2026):** janelas de horário da diária (feito, schema v11), pendências (feito, schema v12), alerta por etapa e plano de ação pronto para um item. Vêm antes do RF08 para o relatório já nascer com horários e pendências. Detalhes no CLAUDE.md.
2. **RF08 — exportação em PDF:** está no resumo da proposta e no cronograma de outubro. Não depende de rede.
3. **Revisar o texto do TCC contra o que foi construído:** ~160 diretrizes → 89 itens; "tipo e porte" → só tipo; uso adaptado das faixas da RDC 275/2002; login opcional × P-RF01; backup de mão única × "sincronização" (P-TEC-3); Storage do Supabase não usado (P-TEC-2); e a ampliação pedida pelo orientador (horário e janelas da diária, pendências, alerta por etapa), descrita como funcionalidade além dos RFs — deixando claro que as tolerâncias de 30 min, o expediente mínimo de 1 h e o `momento` de cada item são decisões do app, não da RDC 216, que a trava é de boa-fé (relógio do aparelho, horário editável) e como ela convive com o P-RF06 ("avaliar cada item"): o item fora da janela é visto, não respondido.
