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
- **`docs/proposta/COMPROMISSOS_PROPOSTA.md`** — o que a proposta do TCC
  prometeu à banca (requisitos, objetivos, escopo, cronograma), extraído do
  PDF da proposta que está na mesma pasta. É a régua do agente `fiscal`.
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
8. **Fiscalize antes de fechar uma entrega.** Ao terminar uma fase ou
   entrega, e antes de sugerir o commit, rode o agente **`fiscal`**
   (`.claude/agents/fiscal.md`). Ele compara o código com a proposta do
   TCC (`docs/proposta/COMPROMISSOS_PROPOSTA.md`) e com este plano, e é
   somente leitura. Divergência que ele marcar como "não documentada" é
   resolvida antes do commit: ou se corrige o código, ou se registra a
   decisão aqui.
9. **Commits sem coautoria.** Não acrescente `Co-Authored-By` (nem outra linha
   de atribuição ao Claude) nas mensagens de commit ou de PR. O autor é o
   João Lucas. Os commits antigos que já têm a linha ficam como estão.

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
    expediente. (Desde a v11, com horário de funcionamento cadastrado, a
    inspeção continua aberta o dia todo, mas cada ETAPA só aceita
    resposta na sua janela — ver "Janelas de horário da diária".)
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
- **Fase 5 — concluída.** Periodicidade e alertas (RF05), **sem tabela nova**:
  o plano previa `status_trilha`, mas a última conclusão já está em
  `inspecao.dia_local` e o intervalo editável em
  `estabelecimento.periodicidade_auditoria_dias`. Vencimento é sempre
  DERIVADO, nunca gravado.
  - `db/datas.ts` — contas de data puras (soma, diferença, dia local).
  - `db/vencimento.ts` — a regra pura de situação (em dia / vence em breve /
    vencida / nunca feita). Os dois são puros de propósito: compilam e são
    testáveis fora do aparelho, e é onde moram os casos de borda.
  - `db/periodicidade.ts` — lê o banco e chama a regra; guarda os intervalos
    (diária 1, periódica do estabelecimento, semestral 180) e as
    antecedências de alerta (0 / 7 / 30 dias).
  - `db/notificacoes.ts` — alertas **locais** do `expo-notifications`
    (confirmado: local funciona no Expo Go; só push remoto no Android exige
    development build). O agendamento é sempre recriado do zero — cancela
    tudo e reagenda — para não haver uma segunda verdade sobre o que está
    agendado. Roda na abertura do app (`app/_layout.tsx`) e ao concluir uma
    inspeção.
  - Telas: cartão "Prazos" no Início, selo de vencimento em cada trilha de
    Nova Inspeção, e campo de periodicidade da auditoria no cadastro.
  - Há um botão "Testar alerta agora" no Início, que dispara a notificação
    real em 5 segundos — para demonstrar sem esperar o vencimento.
- **Resumo em tópicos (schema v5).** Cada item tem `topicos: string[]` no
  `data/rdc216.ts` — 1 a 3 frases curtas com o essencial, que é o que aparece
  no checklist. O texto integral da norma fica atrás do botão "Ver texto da
  norma". Os tópicos são reescrita nossa, não texto da RDC; por isso o
  original continua acessível a um toque. Guardados como JSON num TEXT: a
  regra aqui é *vira tabela o que o SQL precisa cruzar*, e tópicos só são
  exibidos, nunca filtrados.
- **`expo-notifications` não pode ser importado no topo de um arquivo.** Ele
  lança erro no PRÓPRIO import no Expo Go do Android (SDK 53+), derrubando o
  app. Em `db/notificacoes.ts` ele é carregado com `require` dentro de um
  `try`; onde não existe, os alertas ficam desligados e o app roda inteiro.
  Não use `executionEnvironment` para detectar: ele devolve `storeClient`
  tanto no Expo Go quanto num development build.
- **Notificação de inspeção em andamento (feito, testado no aparelho).**
  Fora dos RFs da proposta (ampliação de escopo pequena, pedida pelo autor).
  Enquanto uma inspeção está aberta, uma notificação FIXA na barra mostra
  "12 de 32 respondidos" e o toque leva de volta a ela (diária → aba Hoje;
  as outras → `/inspecao?trilha=`). Pedido do autor, para quem sai do app
  no meio. Tudo em `db/notificacoes.ts`:
  - Canal próprio `andamento`, importância BAIXA: não toca nem pula na
    tela; o handler também esconde o banner dela com o app aberto.
  - Identificador fixo por trilha: mostrar de novo SUBSTITUI, não empilha.
  - Progresso como barra de TEXTO (`▰▱`) — o `expo-notifications` não
    expõe a barra nativa do Android. No Android 14+ o usuário consegue
    dispensar mesmo a notificação fixa; ela volta na próxima resposta.
    Não afirmar que ela "não pode ser removida".
  - Não sai quando a tela desmonta (sair no meio é o caso de uso); sai ao
    concluir. Ao abrir/voltar ao app, `limparAndamentoOrfao` tira as que
    perderam o sentido — mesma regra de retomada do `iniciarInspecao`
    (a diária de outro dia não é retomada).
  - Todas as chamadas passam por uma FILA: sem ela, o "remover" do
    concluir podia chegar antes do último "mostrar" e a notificação
    voltava presa depois da inspeção concluída.
  - Não pede permissão no meio da inspeção; usa a já pedida na abertura.
- **Atendimento dos itens e faixa da RDC 275/2002 (feito).** O app passou a
  ter DOIS percentuais sobre a mesma inspeção, e a distinção é deliberada:
  - `score` — **ponderado** (`PESO_CRITICO`). Régua interna, serve para
    priorizar o que consertar.
  - `atendimento` — **contagem simples**, cada item valendo um. É a única
    métrica comparável com a lista de verificação da RDC 275/2002, que não
    tem peso. Sai das contagens que o `SELECT_PESOS` já trazia: **nenhum SQL
    novo, nenhuma migração** — o score continua derivado, nunca gravado.
  - `db/faixa.ts` — módulo **puro** (padrão do `vencimento.ts`) com
    `atendimentoDosItens()` e `faixaRdc275()`. Os grupos são literais da
    norma: 76–100 / 51–75 / 0–50. Testado em `tests/faixa.test.js`, onde os
    limites são escritos à mão de propósito — são da norma, não nossos.
  - Aparece **só na auditoria periódica** (`app/resultado.tsx`), porque é a
    inspeção estrutural completa, o análogo da lista da 275. Carimbar
    "Grupo 1" numa rotina diária de 12 verificações seria inventar.
  - **Ressalvas que valem para o TCC, e que estão nos comentários do
    `db/faixa.ts`:** (a) a RDC 275/2002 é de estabelecimentos
    produtores/industrializadores — indústria; a RDC 216/2004 não pontua nem
    classifica, então a faixa é critério **adaptado**, e a tela declara isso;
    há precedente na literatura (Ferreira et al., Rev Inst Adolfo Lutz
    2011;70(2):230-5, aplica as faixas a UANs, inclusive por bloco);
    (b) a norma oferece a coluna "não se aplica" e **não diz** o que fazer
    com ela — mantê-la fora do numerador e do denominador é interpretação
    nossa preenchendo lacuna.
  - O roteiro de inspeção de serviços de alimentação do município do Rio
    (sobre a própria RDC 216) gradua requisito a requisito em
    Imprescindível / Necessário / Recomendável — é o precedente de VISA para
    o nosso `critico`. Ele usa **três** níveis e nós usamos dois; migrar para
    três é trabalho futuro e não foi feito (custaria reclassificar os 89
    itens do `rdc216.ts`; o comentário do `PESO_CRITICO` já prevê o caminho).
  - **Decidido NÃO fazer: score geral composto** entre as trilhas. Nenhuma
    norma, roteiro de VISA ou artigo combina inspeções de periodicidades
    diferentes num número, e os pesos seriam arbitrários. O "score geral do
    estabelecimento" é o **atendimento da última auditoria periódica**; as
    quatro leituras continuam como estão.
- **Sequência de dias na aba Hoje (feito).** Cartão no estilo "streak":
  quantos dias seguidos a diária foi CONCLUÍDA, com recorde e uma tira da
  **semana atual, de segunda a domingo**, com a inicial do dia embaixo de
  cada bolinha (era uma janela móvel dos últimos sete dias, e ninguém
  sabia qual bolinha era qual; os dias depois de hoje aparecem só com o
  contorno). Mede **adesão à rotina**, não conformidade — são
  perguntas diferentes, e por isso o número não se mistura com o score (dá
  para ter 95% fazendo a diária duas vezes por semana).
  - `db/sequencia.ts` — regra **pura** (padrão do `vencimento.ts`);
    `sequenciaDiaria()` em `db/consultas.ts` só lê os dias e chama.
    **Sem tabela nova:** a verdade já está em `inspecao.dia_local`.
  - **A contagem vai até ONTEM quando a diária de hoje ainda não fechou.**
    A diária fica aberta o dia todo; zerar o número às 8h da manhã seria
    mentira. O estado vira `em_risco`, que é onde a tela passa quase todo o
    expediente, e a nota pede a ação.
  - Fica no `Prelude` de `app/index.tsx` — a única parte que aparece nos
    TRÊS estados da aba. No corpo da tela, sumiria justamente durante as
    horas em que ela está mais em uso. Ordem: identificação → atrasos →
    sequência; o atraso é chamado para agir e vem antes do estímulo.
- **Ferramentas de teste (andaime, só `__DEV__`).** Botões na aba
  Estabelecimento que só aparecem com o app rodando pelo Metro; no app
  instalado somem. Servem para testar e demonstrar o que não se fabrica
  pelo uso normal numa noite só. Funções em `db/consultas.ts`:
  - `apagarDiariaDeHoje` — "Refazer a diária de hoje": apaga a diária de
    hoje (e as ações que ela gerou) para poder repeti-la no mesmo dia.
  - `gerarDiariasDeTeste` — "Gerar histórico": diárias concluídas nos 14
    dias ABERTOS anteriores a hoje que ainda não têm diária.
  - `completarSemanaDeTeste` — "Completar a semana": diária de segunda
    até hoje, **inclusive dia fechado** — que pela regra da sequência
    conta, então a corrida ganha dias que o estabelecimento real não
    teria. Aceitável num andaime.
  - `apagarDadosDeTeste` — "Apagar dados de teste": remove todas as
    fabricadas, e só elas.
  - **As fabricadas são gravadas com `inspecao.modo = 'teste'`** (rótulo
    "Teste" no histórico). Sem a marca, eram indistinguíveis das reais e
    não havia como tirá-las (achado do `fiscal`). A marca mora na
    inspeção, e não na `meta`, para sobreviver à ida e volta do backup.
    `modo` é TEXT sem restrição dos dois lados, então não houve migração.
  - **Enquanto existem, entram em tudo**: histórico, rotina do mês,
    sequência, recorde e score (em parte dos dias há um inadequado
    corrigido na hora, que derruba o score de propósito). E sobem no
    backup se houver conta. O "Apagar dados de teste" passa pelos
    gatilhos da v10, então a exclusão também chega à nuvem.
  - Não geram ações (não chamam `gerarAcoesDaInspecao`): o plano de ação
    não recebe itens inventados.
  - **Para a banca:** demonstrar com histórico fabricado não é evidência
    de uso. Se usar, dizer, e de preferência num estabelecimento sem
    conta de backup.
- **Dias de funcionamento (schema v6, feito).** O cadastro pergunta em que
  dias da semana o estabelecimento abre, e o app para de cobrar a diária
  nas folgas. Era o defeito que feirante e ambulante (2 dos 6 perfis)
  sofriam todo dia.
  - **A representação:** máscara de 7 caracteres `'0'/'1'` em
    `estabelecimento.dias_funcionamento`, indexada pelo **`Date.getDay()`**
    — posição 0 é domingo. Mesma numeração do JavaScript de propósito:
    qualquer outra criaria uma conversão a mais, que é onde entra o erro de
    um dia. TEXT e não tabela pela regra de sempre (o SQL só lê).
  - `db/funcionamento.ts` — módulo **puro**. `normalizarFuncionamento` é
    deliberadamente defensivo: NULL (linha pré-v6), tamanho errado, lixo ou
    **só zeros** caem no padrão `'1111111'`. O caso "só zeros" não é
    preciosismo — sem ele `proximoDiaAberto` roda para sempre dentro de um
    render.
  - **NULL = abre todo dia**, então a migração não muda o comportamento de
    ninguém que já usava o app.
  - **Onde a máscara entra, em UM lugar cada:**
    `calcularVencimento` empurra o vencimento caído em dia fechado para o
    próximo dia aberto — e isso sozinho resolve as três trilhas, porque
    `diasParaVencer` e a situação derivam do vencimento;
    `db/sequencia.ts` pula o dia fechado ao contar; `quandoAlertar` empurra
    o lembrete do atrasado para não tocar na folga.
  - **A ORDEM DA REGRA na sequência:** pergunta-se pelo REGISTRO antes do
    calendário. Diária feita conta sempre (inclusive num dia fechado — quem
    abriu excepcionalmente e inspecionou fez o certo); dia fechado sem
    diária é pulado; só dia ABERTO sem diária quebra. A ordem inversa foi
    escrita primeiro e um teste pegou.
  - **Abrir num dia fechado:** a aba Hoje troca o cartão de abertura por
    "Hoje não é dia de expediente" + botão "Abri hoje — fazer a inspeção".
    Não esconde, oferece. O estado fica **só na tela**, nunca no banco: a
    inspeção concluída já é o registro de que houve expediente, e uma
    segunda marca poderia discordar dela.
  - Zero dia marcado trava o botão de salvar do cadastro: sem expediente não
    há rotina diária e toda conta de prazo perde o chão.
- **Plano de ação corretiva — RF07 (schemas v8 e v9, feito).** Feito antes da
  Fase 6 por decisão do autor: fecha o ciclo "inspeciono → vejo o que falhou
  → sei o que fazer" sem depender de rede, e a Fase 6 pode virar trabalho
  futuro.
  - **Tabela `acao`**: o que fazer (`descricao`) e até quando (`prazo`, dia
    local). É conteúdo do usuário, então é gravada; a **situação** (atrasada
    / vence hoje / no prazo) é DERIVADA, em `db/acao.ts` — módulo puro,
    padrão do `vencimento.ts`, testado em `tests/acao.test.js`.
  - **Uma ação ABERTA por item e estabelecimento**, garantida por índice
    único parcial (`WHERE status = 'aberta'`). O mesmo item inadequado em
    cinco diárias é uma coisa só a consertar; depois de concluída, o item
    pode ganhar ação nova. `salvarAcao` cria ou atualiza a aberta — o
    formulário é um só para criar e editar.
  - **O APP GERA O PLANO.** Ao concluir a inspeção (`concluirInspecao` →
    `gerarAcoesDaInspecao`), cada item inadequado sem ação aberta ganha uma,
    com prazo sugerido. `INSERT OR IGNORE` + o índice único: a segunda
    geração para o mesmo item é ignorada e não sobrescreve o que o usuário
    ajustou. (Começou como "sugerida, um toque cria"; o autor mudou para
    automática — o "Criar ação" manual ficou só para inspeções antigas ou
    ação excluída.)
  - **Correção imediata ≠ ação corretiva (schema v9).** Gerar ação para
    todo inadequado da DIÁRIA enchia o plano de coisas resolvidas no
    momento (touca, bancada suja). A área de segurança de alimentos separa
    correção imediata de ação corretiva planejada, e o plano é para a
    segunda. Por isso o inadequado da diária tem "Corrigi na hora"
    (`resposta.corrigido_na_hora`); marcado, não vira ação. Regras puras
    em `db/acao.ts`: `aceitaCorrecaoNaHora` (só a diária — periódica e
    semestral são estruturais) e `precisaDeAcao`, que ignora a marca fora
    da diária mesmo que ela chegue ao banco.
    - **O score NÃO muda** com a marca: o item estava inadequado no
      momento, e esconder isso do número seria maquiar a inspeção
      (testado em `tests/score.test.js`).
    - A marca mora NA RESPOSTA, não numa ação concluída na hora: é um fato
      da inspeção. Sair de "inadequado" apaga a marca — no upsert do
      `salvarResposta` e na tela.
    - A v9 acrescentou coluna em `resposta`: os testes que faziam
      `INSERT INTO resposta VALUES (...)` sem nomear colunas quebraram e
      foram corrigidos. **Sempre nomeie as colunas.**
  - **O texto gerado diz O QUE atingir, não COMO consertar:**
    `descricaoGerada` = "Adequar ao item X da RDC 216: <tópicos>". O "como"
    (trocar a borracha, chamar o técnico) depende do caso e não está na
    norma; escrevê-lo seria inventar conteúdo técnico (regra 4). O usuário
    edita para acrescentar. Se um dia houver orientação de correção por
    item, ela entra como DADO revisado em `data/rdc216.ts`, não em código.
  - **Outras decisões do autor:** **só dois campos**; e o encerramento é
    **manual, com sugestão** — se o item sai adequado numa inspeção POSTERIOR à criação,
    o plano sugere concluir, mas não conclui sozinho (uma diária rápida não
    prova que a obra foi feita). A sugestão olha a ÚLTIMA avaliação do item;
    "não observado" não conta como avaliação. Testado sobre o SQL real em
    `tests/acao-consultas.test.js`.
  - **Prazo sugerido é decisão do app:** crítico → hoje, demais → 7 dias
    (`PRAZO_PADRAO_CRITICO`, `PRAZO_PADRAO`). Atalhos: hoje / 7 / 30 dias,
    empurrados para o próximo dia ABERTO pela máscara de funcionamento.
  - Telas: `app/acao.tsx` (formulário), `app/plano-acao.tsx` (atrasadas →
    abertas → concluídas dos últimos 30 dias), seção "Itens a corrigir" em
    `app/resultado.tsx`, cartão "Plano de ação" na aba Conformidade.
  - **As rotas escondidas das abas continuam montadas** depois que se sai
    delas: o formulário usa um contador de foco como `key` para nascer de
    novo a cada visita, senão traria o texto digitado no item anterior.
  - Fora desta entrega: alerta de prazo de ação (`expo-notifications`) e
    ação atrasada no prelúdio da aba Hoje.
- **Fase 6 mínima — RF01 (schema v10) — concluída.** Testada no aparelho
  contra o Supabase real em 27/09/2026.
  Login **opcional** +
  backup de **mão única** no Supabase. A mão única é a recomendação do
  plano (6.7); o login OPCIONAL é decisão nossa e **diverge do texto do
  P-RF01**, que fala em login "para que ele possa acessar o aplicativo".
  Motivo: offline-first (regra 1) — um app que exige login trava o
  feirante sem sinal na primeira abertura, e os dados pertencem ao
  estabelecimento, não a uma conta. O texto do TCC precisa ser ajustado
  (plano, seção 7). O app abre e funciona inteiro sem conta; a conta só
  liga o backup.
  - **Supabase Storage não é usado.** A proposta (P-TEC-2) cita
    "armazenamento de arquivos"; o app só usa Auth e Postgres. Candidato
    natural a usá-lo é o PDF do RF08 — decidir ao implementá-lo; senão,
    vira trabalho futuro no texto.
  - Projeto Supabase criado e `supabase/schema.sql` aplicado. Roteiro
    no aparelho aprovado pelo autor em 27/09/2026: uso sem conta, criar
    conta + backup, backup automático ao concluir, modo avião (app
    inteiro offline e subida ao voltar), restauração depois de "Limpar
    dados" e "Backup parado" com outra conta.
  - **Sem as chaves, `supabase` é null** (`db/supabase.ts`) e o app roda
    igual. As chaves ficam em `.env.local` (fora do git; modelo em
    `.env.example`). O SQL da nuvem, com RLS, está em
    `supabase/schema.sql` — colar no SQL Editor do Supabase.
  - **Schema v10 por GATILHOS, sem mexer em nenhuma escrita do
    `db/consultas.ts`:** `uuid` ao lado do id em `estabelecimento`,
    `inspecao` e `acao` (resposta e item_oculto têm chave natural);
    `atualizado_em` em todas as cinco, carimbado por gatilho em todo
    INSERT/UPDATE; e cada DELETE anotado em `sync_exclusao`, em vez da
    lápide do plano (que mexeria em toda leitura). O gatilho respeita
    uuid/carimbo que já vêm preenchidos — é o que a restauração usa.
  - **É o primeiro bloco de migração MONTADO por funções**, por isso o
    `SCHEMA_V10` é exportado: o `migrarAte` dos testes lê os blocos
    antigos como texto e este só existe compilado.
  - `db/backup.ts` — a parte **testável** (recebe o banco): monta o
    pacote do que mudou já com os uuids no lugar dos ids, confirma o envio
    e restaura. `db/sincronizacao.ts` — só transporta; **nenhuma função
    lança erro**, e ninguém do núcleo importa. Testado em
    `tests/backup.test.js`, inclusive a ida e volta completa.
  - **Um aparelho, uma conta.** Depois do primeiro backup, os uuids do
    aparelho pertencem na nuvem àquela conta, e a RLS recusaria o upsert
    de outra — para sempre. Por isso o dono fica gravado na `meta`
    (`dono_backup`, gravado ANTES do primeiro envio e na restauração), e
    o backup de outra conta volta como `outra_conta`, com aviso na tela,
    em vez de falhar calado. Achado do `fiscal`: a primeira versão dizia
    que "outra conta recebe tudo", e um teste que só olhava o pacote
    confirmava a mentira.
  - **Exclusões sobem ANTES das linhas**: item ocultado, reexibido e
    ocultado de novo tem exclusão anotada e linha viva ao mesmo tempo.
  - **Restauração só em aparelho vazio** (celular novo). Juntar dados dos
    dois lados é sincronização de duas mãos — trabalho futuro. Com mais
    de um estabelecimento na conta, vem o alterado por último. Ela roda
    na tela de quem JÁ está logado (`Restaurar`, em `app/conta.tsx`), com
    "Tentar de novo"; o cadastro do zero só é oferecido quando a nuvem
    responde que a conta está vazia — depois de uma falha, criaria um
    segundo estabelecimento na conta.
  - **A paginação da restauração ordena pela chave como desempate.** A
    v10 carimbou todas as linhas antigas com o MESMO instante; ordenar só
    por `atualizado_em` repetiria ou pularia linhas entre as páginas.
  - Dispara ao abrir o app, ao VOLTAR ao app (`AppState` — é o "ao
    reconectar" do plano, sem `expo-network`), ao mudar o cadastro e ao
    concluir uma inspeção (`fazerBackup()`, sem `await`), e no botão da tela
    `app/conta.tsx`. Portas: cartão "Conta e backup" na aba
    Estabelecimento e link no cadastro do primeiro acesso.
  - Dependências novas são JS puro (`@supabase/supabase-js`,
    `react-native-url-polyfill`); a sessão fica no `localStorage` do
    próprio expo-sqlite. **Não deve exigir build nativo novo** (a
    confirmar no aparelho).
  - **APK do EAS sai com o backup DESLIGADO** se as variáveis
    `EXPO_PUBLIC_SUPABASE_*` não forem configuradas no EAS: o `.env.local`
    fica fora do git e não vai para o servidor de build.
- **Pedidos do orientador (reunião de 20/10/2026).** Fora dos RFs da
  proposta — ampliação de escopo pedida pelo ORIENTADOR, decidida com o
  autor no mesmo dia. Quatro entregas, nesta ordem, todas antes do RF08
  (para o PDF já nascer com horários e pendências):
  1. horário de funcionamento + janelas que travam cada etapa da diária
     (**feita** — ver abaixo);
  2. pendências: o item que perde a janela sem resposta vira pendência,
     contada À PARTE (no dia e no mês, por etapa) — **não entra no score**,
     pela mesma razão da sequência: não verificar ≠ verificar e estar
     errado. Derivada, nunca gravada;
  3. notificação local quando cada etapa abre (só em dia aberto, e não se
     a etapa já foi feita), no agendamento de `db/notificacoes.ts`;
  4. plano de ação PRONTO para um item só, como exemplo (o orientador
     sugeriu um catálogo por item e reconheceu que para os 89 seria
     demais). Catálogo local em `data/`, levado ao SQLite pelo seed.
     Sugestão: `prep_11` (óleo), em que a própria RDC diz a correção. O
     texto dos passos vem do autor, com fonte (regra 4).
- **Janelas de horário da diária (schema v11, feito — entrega 1 acima).**
  - O cadastro ganhou **horário de abertura e de fechamento**, opcionais,
    em `estabelecimento.hora_abertura` / `hora_fechamento` ('HH:MM'
    local). **NULL = sem horário = sem janela**: quem já usava o app não
    acorda com item travado.
  - `db/janela.ts` — módulo **puro** (padrão do `vencimento.ts`), testado
    em `tests/janela.test.js` com as bordas escritas à mão. As janelas,
    com o fim exclusivo: antes de abrir `[00:00, abertura+30)`, serviço
    `[abertura, fechamento)`, fechamento `[fechamento−30, 24:00)`. As
    **tolerâncias de 30 min são decisão do app** (`TOLERANCIA_ABERTURA`,
    `ANTECEDENCIA_FECHAMENTO`), e as janelas se sobrepõem nas bordas de
    propósito.
  - **Fora da janela o item fica TRAVADO**: dá para ver a resposta, não
    para mudar — inclusive o "Corrigi na hora" e o "não se aplica". A
    trava vale por BLOCO (na diária a chave do bloco é o `momento`, nos
    dois modos). O botão desabilitado é a primeira barreira; a hora é
    conferida de novo NO TOQUE (`foraDaJanela`), porque o relógio da tela
    só anda a cada 15 s. A REGRA mora no `janela.ts`; quem a APLICA é a
    tela, e não o `salvarResposta`, que continua sem saber de relógio
    nem de horário. Hoje a tela de execução é a única porta de escrita
    de resposta pelo usuário — se surgir outra, ela tem que chamar a
    mesma regra.
  - **A meia-noite não reabre a diária de ontem** (achado do `fiscal`,
    que bloqueou o primeiro commit). O relógio volta a 00:00, e com a aba
    Hoje aberta na tela a etapa "antes de abrir" da diária de ontem
    voltava a aceitar resposta. `situacaoDaEtapa` pergunta antes o DIA da
    inspeção (`inspecao.dia_local`): dia passado, tudo encerrado; só no
    próprio dia o relógio decide. O relógio da tela acompanha dia e
    minuto.
  - Cada resposta mostra **a hora em que foi dada** ("Respondido às
    07:12"), lida de `resposta.respondida_em`, que já existia desde a v3.
    Trocar a resposta troca a hora — vale a última decisão. **Só na tela
    de execução**: o resultado e o histórico ainda não mostram a hora,
    embora o dado esteja no banco. O PDF do RF08 deve trazê-la.
  - **Não suportado:** fechamento depois da meia-noite (a diária é presa
    ao `dia_local`) e horário diferente por dia da semana. Trabalho
    futuro. O cadastro recusa o fechamento antes da abertura e orienta a
    **deixar o horário em branco** — e não a pôr 23:59, que deixaria a
    etapa de fechamento com meia hora e a limpeza de quem fecha à 1h
    sempre fora dela.
  - Expediente mínimo de 1 hora, para as duas tolerâncias caberem.
  - **A trava é de boa-fé, e isso precisa estar no texto do TCC.** O
    relógio que manda é o do aparelho, e o horário pode ser editado ou
    apagado a qualquer momento, valendo na hora — apagar às 15h destrava o
    "antes de abrir". O app registra e orienta; não fiscaliza contra quem
    quer burlar.
  - **Decidir antes da entrega 2:** se as pendências forem derivadas do
    horário ATUAL do estabelecimento, mudar o horário reescreve as
    pendências do passado — o oposto do `total_itens` congelado. A
    alternativa é congelar o par de horários na inspeção, na abertura,
    como já se faz com `modo` e `dia_local`. E as diárias fabricadas pelas
    ferramentas de teste gravam todas as respostas às 18h, inclusive as de
    "antes de abrir": vão parecer feitas fora da janela.
  - **Supabase:** as duas colunas foram acrescentadas ao
    `supabase/schema.sql`, com `alter table ... add column if not
    exists` (o arquivo pode ser rodado de novo sem perigo). **Rodar o
    arquivo de novo no SQL Editor.** Sem isso, o backup PARA INTEIRO, e
    não só o estabelecimento: a migração v11 não carimba
    `atualizado_em`, então nada muda até o cadastro ser editado — mas, a
    partir daí, o estabelecimento é a primeira tabela enviada, a nuvem
    recusa a coluna desconhecida, o envio aborta e o marcador não avança;
    nenhuma inspeção posterior sobe. A única pista é a mensagem na tela
    Conta. A restauração de um backup anterior à v11 entra sem horário
    (testado).
- **Próxima: entregas 2 a 4 dos pedidos do orientador, depois o RF08** —
  exportação em PDF. Depois, revisar o texto do TCC contra o que foi
  construído (ver seção 7 do plano).
- **Redesenho da navegação (feito).** As abas eram Início, Nova Inspeção e
  Histórico. Dois defeitos: o cartão de prazos do Início listava as três
  trilhas e cada linha levava a Nova Inspeção, que listava as três trilhas de
  novo (um menu apontando para outro menu); e a rotina diária, usada várias
  vezes por dia, ficava a três toques — a mesma distância da auditoria, que
  roda uma vez por mês. As abas agora são **três perguntas**:
  - **Hoje** (`app/index.tsx`) — "o que eu faço agora?". A aba não aponta
    para a diária: **ela é a diária**. Tem três estados — não iniciada
    (cartão de abertura, onde se escolhe Rotina ou Completa), em andamento
    (a lista) e concluída (o resumo do dia). O toque de abrir existe porque
    `iniciarInspecao` GRAVA: sem ele, abrir o app num domingo deixaria uma
    diária vazia no histórico.
  - **Conformidade** (`app/conformidade.tsx`) — "como estou?". As quatro
    leituras mais o histórico, que foi absorvido e **separado por trilha**:
    numa lista corrida as ~26 diárias do mês afogam a única auditoria.
  - **Estabelecimento** (`app/estabelecimento.tsx`) — "como o app está
    configurado?". Cadastro, resumo do checklist, periodicidade da auditoria,
    itens ocultos do RF09 e o "Testar alerta agora" (andaime de demonstração,
    que saiu da tela principal).
  - `/nova-inspecao` continua existindo como rota `href: null`, aberta pelo
    "+" do header da aba Hoje. É por onde se começa a periódica ou a
    semestral fora de hora. **A diária não tem início por lá** — ela mora em
    Hoje, e duas portas para o mesmo começo era o defeito original.
  - `app/historico.tsx` foi removido.
  - A execução saiu de `app/inspecao.tsx` para
    **`components/ExecucaoInspecao.tsx`**, porque tem dois donos: a aba Hoje
    e a rota `/inspecao`. A tela que hospeda injeta o `prelude` (o que vem
    acima da lista) e o `headerExtra` (o botão que divide o header com o
    "recolher tudo" — o slot é um só, e duas chamadas a `setOptions`
    apagariam uma à outra).
  - O redesenho não encostou em `db/` nem em `store/`: os 60 testes passaram
    sem alteração. **Mantenha a regra de negócio fora das telas** — é o que
    tornou isto barato.
  - Pendente: `/nova-inspecao` é uma tela empurrada, não uma folha modal.
    Modal de verdade exige reestruturar em Stack + `(tabs)/`, que não foi
    feito. O mockup do fluxo está em `docs/mockup/`.
- **Medidor de score (feito).** O score aparece como arco de 240° com degradê
  e um marcador na posição da nota, em `components/MedidorScore.tsx` — usado
  na tela de resultado e no cartão "Dia concluído" da aba Hoje. Só desenha:
  o número vem pronto do `db/consultas.ts`, como no resto do app.
  - **O SVG não tem degradê que acompanha a curva.** O arco usa um degradê
    RETO, da esquerda para a direita, e o efeito sai certo porque a abertura
    fica embaixo: ponta esquerda rosa, topo âmbar, ponta direita verde.
  - **O âmbar (`medidorMeio`) existe só para isso.** A paleta não tem
    amarelo, e o degradê direto do rosa ao verde passa por um cinza
    barrento no meio. Ele não vira cor de texto nem de selo em lugar nenhum.
  - **Score `null` é arco cinza, sem marcador, com "—" no lugar do número.**
    Nunca 0%: "nada avaliado" e "tudo inadequado" são coisas diferentes, e é
    a mesma distinção que o `db/consultas.ts` faz ao devolver `null` em vez
    de zero quando o denominador é zero.
  - O arco é moldura; quem gradua continua sendo a **faixa** do app (cortes
    90/70), que dá a cor do número. O degradê é contínuo de propósito — se
    ele tivesse três blocos de cor, viraria uma segunda escala competindo
    com a faixa.
  - Depende de `react-native-svg`, instalado com `npx expo install` (versão
    casada com o SDK). Roda no Expo Go, sem development build.
- **Ícones do app (feito).** A marca (escudo + garfo + folha) mora em
  `assets/fonte/marca.svg` e os PNGs de `assets/` são GERADOS dela por
  `npm run icones` — não são sete imagens editadas à mão, são a mesma marca
  em sete recortes. O SVG usa `currentColor`, então um arquivo só serve ao
  ícone branco sobre azul, ao azul sobre claro e ao monocromático.
  - A rasterização usa o **Chrome/Edge já instalado** (`--headless
    --screenshot`), para não acrescentar dependência nativa (`sharp`) ao
    projeto. O script roda no PC e não entra no bundle.
  - **O escudo é traço, com o miolo vazado.** É isso que faz o ícone de
    notificação funcionar: o Android achata o ícone da barra de status em
    branco pelo ALFA, e um quadrado azul cheio viraria um borrão sólido.
  - O `foreground` do adaptativo ocupa só 46% do lado porque o launcher
    recorta o ícone na forma dele e só garante os ~66% centrais.
  - **Ícone é recurso NATIVO.** Trocar o PNG não muda nada no aparelho com o
    Metro rodando — exige build novo no EAS.
- Paleta da marca em `theme/cores.ts` (primária #006DB2, azul). Nenhuma tela escreve
  hexadecimal direto.
- Migrações são versionadas por `PRAGMA user_version` (ver `VERSAO_SCHEMA`).
  Ao editar `data/rdc216.ts`, suba a `VERSAO_SEED` em `db/seed.ts`.
  Colunas novas entram sempre num bloco `SCHEMA_Vn` novo, nunca editando um
  bloco antigo. `ALTER TABLE` acrescenta a coluna no FIM da tabela: use
  sempre colunas nomeadas no INSERT.
- **SUBA A `VERSAO_SCHEMA` E ACRESCENTE O BLOCO NA MESMA GRAVAÇÃO DO
  ARQUIVO.** Com o Metro rodando, o app recarrega a cada gravação: se a
  versão subir primeiro e o bloco entrar depois, existe um instante em que
  o `migrar()` não tem o que executar e mesmo assim carimba a versão nova.
  O aparelho fica com a versão sem as colunas dela, e o
  `if (versaoAtual >= VERSAO_SCHEMA) return` fecha a porta para sempre —
  nenhum reload conserta, porque o estado está no banco. **Foi o que
  aconteceu na v6** (`no such column: dias_funcionamento`), e a saída foi a
  v7: um bloco de REPARO, com guarda em `PRAGMA table_info`, porque editar
  o bloco v6 não alcançaria quem já tem `user_version = 6`. Versão gravada
  num aparelho é passado: só se avança por cima dela. Os dois estados
  possíveis estão testados em `tests/schema.test.js`.
