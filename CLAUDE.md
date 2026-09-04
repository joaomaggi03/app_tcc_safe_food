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
- **Próxima: Fase 3** — execução da inspeção: quatro respostas por item (RF06) e
  "Não se Aplica" ocultando o item nas próximas inspeções (RF09).
- **O fluxo de telas é provisório.** O autor não está convencido da navegação
  atual e pode redesenhá-la. Mantenha a regra de negócio em `db/` e `store/`,
  fora das telas. A tela de execução da Fase 3 deve receber a trilha por
  parâmetro, senão a Fase 5 obriga a reescrever a navegação dela.
- Paleta da marca em `theme/cores.ts` (primária #3CAE63). Nenhuma tela escreve
  hexadecimal direto.
- Migrações são versionadas por `PRAGMA user_version` (ver `VERSAO_SCHEMA`).
  Ao editar `data/rdc216.ts`, suba a `VERSAO_SEED` em `db/seed.ts`.
