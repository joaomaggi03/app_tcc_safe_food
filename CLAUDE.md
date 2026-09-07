# CLAUDE.md — Instruções do projeto

Este arquivo é lido automaticamente pelo Claude Code no início de cada sessão.
Ele define o contexto, a stack e as regras deste projeto. Leia antes de agir.

## O que é o projeto

App móvel de **gestão e adequação de segurança alimentar** para pequenos
estabelecimentos (restaurantes, lanchonetes, padarias, food trucks, feirantes,
ambulantes), baseado na **RDC nº 216/2004 da ANVISA**. É um Trabalho de
Conclusão de Curso (Engenharia da Computação — UTFPR).

O diferencial do app é um **checklist dinâmico** que:
- adapta as exigências sanitárias ao **perfil/porte** do estabelecimento (esconde itens que não se aplicam);
- calcula um **score de conformidade**;
- organiza os checks por **periodicidade** (trilhas diária, periódica e semestral);
- funciona **offline**.

## Documentos de referência (leia-os antes de implementar)

- **`PLANO_IMPLEMENTACAO_APP_RDC216.md`** — o plano completo, dividido em fases.
  É o mapa do projeto. Cada fase tem objetivo, critério de "pronto" e um prompt.
- **`data/rdc216.ts`** — a RDC 216 inteira estruturada em `PERFIS`, `CATEGORIAS`
  e `ITENS`, com tipos e funções auxiliares. É a fonte de dados do checklist.

Sempre que uma tarefa envolver checklist, perfis, categorias ou periodicidade,
consulte esses dois arquivos em vez de inventar estrutura nova.

## Stack

- **Expo (managed) + React Native**
- **TypeScript**
- **expo-router** (navegação por arquivos)
- **expo-sqlite** (banco local — núcleo offline)
- **Zustand** (estado global)
- **expo-notifications** (alertas de periodicidade)
- **Supabase** — SOMENTE na fase final/opcional (auth + sincronização). Não usar antes.

## Regras de trabalho

1. **Offline-first.** O núcleo (checklist, filtro, score, periodicidade) funciona
   sem internet, sobre o SQLite. Não introduza dependência de rede no núcleo.
2. **Uma fase por vez.** Implemente apenas a fase pedida. Não pule adiante nem
   implemente o projeto todo de uma vez. Respeite a ordem do plano.
3. **Explique para iniciante.** O autor está começando em React Native e Expo.
   Explique o que cada arquivo faz e como testar. Prefira soluções simples e
   padrões comuns a abstrações avançadas.
4. **Não invente conteúdo da norma.** Os itens do checklist vêm do `data/rdc216.ts`.
   Não crie itens novos nem altere textos da RDC sem ser pedido.
5. **Periodicidade é código, norma é dado.** A frequência dos checks é regra de
   negócio (ver Fase 5 do plano). A única frequência legal fixa é a da água
   (180 dias), já marcada no seed. O resto é decisão do app.
6. **Peça teste antes de avançar.** Ao fim de cada fase, garanta que roda no
   emulador/celular e sugira um commit antes da próxima fase.
7. **Ordem ao criar arquivos:** todo trabalho novo em `/home` do projeto; siga a
   estrutura de pastas que o plano sugere (`app/`, `db/`, `data/`, `store/`, `components/`).

## Ordem das fases (resumo — detalhes no plano)

0. Setup do projeto Expo + navegação.
1. Schema SQLite + seed a partir de `data/rdc216.ts`.
2. Perfil de negócio (RF02) + geração do checklist filtrado (RF03).
3. Execução da inspeção: 4 respostas (RF06) + "Não se Aplica" oculta item (RF09).
4. Score de conformidade (RF04).
5. Periodicidade em três trilhas + notificações (RF05).
6. (Opcional/final) Auth + sincronização Supabase (RF01).

Fora do núcleo (podem ficar de fora): plano de ação corretiva (RF07) e
exportação em PDF (RF08).

## Estado atual

- **Fase 0 — concluída.** Projeto Expo (SDK 57) + expo-router com abas Início,
  Nova Inspeção e Histórico.
- **Fase 1 — concluída.** Schema SQLite em `db/schema.ts` (tabelas `perfil`,
  `categoria`, `item`, `item_aplicabilidade`, `estabelecimento`, `meta`), seed em
  `db/seed.ts` a partir de `data/rdc216.ts`, consultas em `db/consultas.ts`.
- **Fase 2 — concluída.** Cadastro do estabelecimento em `app/cadastro.tsx`
  (RF02: nome e tipo obrigatórios; cidade e responsável opcionais) e checklist
  filtrado por perfil em `app/nova-inspecao.tsx` (RF03, ainda só leitura).
  Estado global em `store/estabelecimento.ts` (Zustand). O schema v2 acrescentou
  as colunas `cidade` e `responsavel`.
- **Fase 3 — concluída.** Execução da inspeção. O schema v3 acrescentou
  `inspecao`, `resposta` e `item_oculto`. A tela `app/inspecao.tsx` recebe a
  trilha por parâmetro (`/inspecao?trilha=diario`), grava cada resposta na hora
  (RF06) e retoma inspeção em andamento. "Não se Aplica" grava em `item_oculto`
  e o item some das próximas inspeções (RF09) — reversível pela lista de itens
  ocultos em `app/nova-inspecao.tsx`, que virou o seletor das três trilhas.
  `app/historico.tsx` lista as inspeções reais (sem score ainda).
  Rótulos de apresentação centralizados em `theme/rotulos.ts`.
- **Fase 4 — concluída.** Score de conformidade (RF04). Fórmula em
  `db/consultas.ts`: percentual do peso dos adequados sobre o peso dos
  avaliados, com `PESO_CRITICO = 3` substituindo o peso 2 do seed nos itens
  críticos; "não se aplica" e "não observado" ficam fora do numerador E do
  denominador; denominador zero devolve `null`, não 0%. O score é sempre
  **derivado das respostas**, nunca gravado — e parte da tabela `resposta`,
  não do checklist atual, para que uma inspeção antiga não mude de nota
  quando o checklist mudar. Tela de resultado em `app/resultado.tsx` (score,
  críticos em destaque, cobertura e score por categoria da RDC).
  Schema v4: `item.momento`, `inspecao.modo`, `inspecao.total_itens` e
  `inspecao.dia_local` (dia no fuso do aparelho — `data_conclusao` é UTC e
  jogaria uma diária das 21h30 para o dia seguinte).
- **Decisões da Fase 4 que valem para o TCC:**
  - O Início mostra **quatro leituras** (diária de hoje, rotina do mês,
    última auditoria, status da água) e não uma média geral: num mês há ~26
    diárias contra 1 auditoria, e qualquer média entre elas seria dominada
    pelas diárias, escondendo a auditoria.
  - A trilha diária **não é de início de expediente**: dos 32 itens, 11 são
    estado conferível antes de abrir, 19 só existem com a operação rodando
    e 2 a norma amarra ao fim do trabalho. Por isso a inspeção diária fica
    **aberta o dia todo** e é concluída no fechamento, e os itens são
    marcados com `momento` (`data/rdc216.ts`) para aparecerem na ordem do
    expediente.
  - A diária tem dois modos: **Rotina** (as verificações guiadas de
    `data/rotina-diaria.ts`) e **Completa** (item a item). O modo fica gravado
    na inspeção, para o histórico não comparar preenchimentos diferentes.
    (`essencial` é valor legado no banco, de inspeções antigas.)
  - **A rotina guiada** existe porque os itens diários estão redigidos na
    linguagem da norma e são difíceis de responder no meio do expediente.
    As 11 verificações (12 nos perfis móveis) reagrupam os mesmos 32 itens em
    perguntas técnicas que se respondem de uma vez, **citando os artigos da
    RDC que cada uma cobre**. O agrupamento é decisão do app; a norma não é
    reescrita, e o banco continua gravando resposta item a item — o score não
    muda. Ao acrescentar um item diário no `rdc216.ts`, inclua-o em alguma
    verificação, senão ele só aparece no modo Completo.
- **Próxima: Fase 5** — periodicidade em três trilhas + notificações (RF05).
  Atenção: o plano propõe guardar `ultima_conclusao` em `status_trilha`, mas
  isso agora já está em `inspecao.data_conclusao`/`dia_local` — considere
  `status_trilha` só com `intervalo_dias` e derive a data, para as duas
  fontes não discordarem. Verificar antes se o `expo-notifications` funciona
  no Expo Go do SDK 57 ou se exige development build.
- **O fluxo de telas é provisório.** O autor não está convencido da navegação
  atual e pode redesenhá-la. Mantenha a regra de negócio em `db/` e `store/`,
  fora das telas.
- Paleta da marca em `theme/cores.ts` (primária #3CAE63). Nenhuma tela escreve
  hexadecimal direto.
- Migrações são versionadas por `PRAGMA user_version` (ver `VERSAO_SCHEMA`).
  Ao editar `data/rdc216.ts`, suba a `VERSAO_SEED` em `db/seed.ts`.
  Colunas novas entram sempre num bloco `SCHEMA_Vn` novo, nunca editando um
  bloco antigo. `ALTER TABLE` acrescenta a coluna no FIM da tabela: use
  sempre colunas nomeadas no INSERT.
