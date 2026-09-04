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

---

### Fase 2 — Perfil de negócio + geração do checklist dinâmico (RF02 + RF03)
**Objetivo:** o usuário escolhe o tipo de estabelecimento e o app monta o checklist filtrado.

- Tela de configuração de perfil no primeiro acesso (RF02).
- Lógica que gera a lista de verificação filtrando itens por perfil (RF03) — o "filtro inteligente".
- Tela que exibe o checklist agrupado por categoria.

**Critério de pronto:** escolher "food truck" mostra um checklist diferente de "restaurante", ocultando itens não aplicáveis.

**Prompt sugerido:**
> "Crie uma tela de seleção de perfil de negócio que salva a escolha no SQLite. Depois, crie a tela de checklist que lê os itens do banco filtrados pelo perfil selecionado, agrupados por categoria. Mostre como testar com dois perfis diferentes."

---

### Fase 3 — Execução da inspeção (RF06 + RF09)
**Objetivo:** responder cada item e tratar o "Não se Aplica".

- Para cada item, quatro opções: `Adequado`, `Inadequado`, `Não se Aplica`, `Não Observado` (RF06).
- Salvar respostas de uma inspeção no SQLite.
- Ao marcar "Não se Aplica", o item não aparece mais nas próximas inspeções daquele estabelecimento (RF09) e não conta no score.

**Critério de pronto:** dá pra preencher uma inspeção inteira; itens marcados "Não se Aplica" somem nas inspeções seguintes.

**Prompt sugerido:**
> "Adicione a cada item do checklist quatro botões de resposta (Adequado, Inadequado, Não se Aplica, Não Observado) e salve as respostas de uma inspeção no SQLite. Quando o usuário marcar 'Não se Aplica', registre esse item como oculto para futuras inspeções deste estabelecimento."

---

### Fase 4 — Score sanitário (RF04)
**Objetivo:** calcular a pontuação de conformidade ao fim da inspeção.

- Cálculo do score a partir das respostas (ex.: percentual de "Adequado" sobre os itens aplicáveis; "Não se Aplica" e "Não Observado" tratados conforme regra definida).
- Tela de resultado com o score e resumo por categoria.

**Critério de pronto:** ao concluir uma inspeção, aparece um score coerente e reprodutível.

**Prompt sugerido:**
> "Crie a função que calcula o score de conformidade de uma inspeção: percentual de itens 'Adequado' sobre o total de itens aplicáveis, excluindo 'Não se Aplica'. Mostre o score numa tela de resultado com um resumo por categoria. Explique a fórmula."

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

Regras de borda:
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

---

### Fase 6 — Autenticação e sincronização com Supabase (final / opcional)
**Objetivo:** contas de usuário e backup na nuvem.

- Auth local → migrar para Supabase Auth (RF01).
- Sincronização SQLite ↔ Supabase (PostgreSQL) quando houver internet.

**Critério de pronto:** login funciona e os dados locais sobem para a nuvem ao reconectar.

> Só entrar aqui depois que todo o núcleo (Fases 1–5) estiver estável. Se o tempo apertar, esta fase pode ficar como "trabalho futuro" no TCC.

---

### Fora do núcleo (podem ficar de fora do projeto final)
- **RF07 — Geração do plano de ação corretiva.**
- **RF08 — Exportação de relatórios em PDF.**

Deixe estes por último. Se implementados, viram diferencial; se não, ficam documentados como trabalhos futuros.

---

## 5. Mapa Fase → Requisito → Cronograma

| Fase | Requisitos | Mês previsto (cronograma da proposta) |
|---|---|---|
| 0 — Setup | — | Jun |
| 1 — Dados da RDC | base p/ RF03 | Jun |
| 2 — Perfil + checklist | RF02, RF03 | Ago |
| 3 — Execução da inspeção | RF06, RF09 | Ago |
| 4 — Score | RF04 | Ago |
| 5 — Periodicidade | RF05 | Set |
| 6 — Auth + Supabase | RF01 | Set/Out |
| Fora do núcleo | RF07, RF08 | Out (se houver tempo) |

---

## 6. Como conduzir cada fase com o Claude Code

1. **Uma fase por vez.** Só comece a próxima quando a anterior estiver testada no celular/emulador.
2. **Peça explicações.** Como você é iniciante, sempre peça que o Claude Code explique o que cada arquivo faz.
3. **Teste antes de avançar.** Cada fase tem um "critério de pronto" — não pule.
4. **Commit por fase.** Faça um commit no Git ao fim de cada fase para conseguir voltar atrás se algo quebrar.
5. **Traga o seed pronto.** A Fase 1 (dados da RDC) rende muito mais se você e eu estruturarmos os itens aqui no chat antes.

---

## 7. Próximo passo

O ponto de partida real do projeto é a **Fase 1**: estruturar a RDC 216 em categorias e itens. Como você tem a norma mas ainda não a organizou, o próximo passo é fazermos isso juntos — definir a taxonomia de categorias e o formato de cada item — para gerar o seed que alimenta todas as fases seguintes.
