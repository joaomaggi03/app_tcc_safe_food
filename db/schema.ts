/**
 * db/schema.ts
 * ---------------------------------------------------------------
 * O DESENHO DO BANCO. Este arquivo só descreve as tabelas e cuida
 * das "migrações" — ele não insere dados (isso é o db/seed.ts).
 *
 * Duas ideias importantes aqui:
 *
 * 1) TABELAS DE CATÁLOGO x TABELAS DO USUÁRIO
 *    - Catálogo = a norma virada dado: `perfil`, `categoria`, `item`,
 *      `item_aplicabilidade`. Vêm do data/rdc216.ts e são reescritas
 *      sempre que o seed muda. Você nunca edita isso pelo app.
 *    - Usuário = o que a pessoa cria: `estabelecimento`, `inspecao`,
 *      `resposta`, `item_oculto`. O seed NUNCA toca nelas.
 *
 * 2) MIGRAÇÃO VERSIONADA
 *    O SQLite guarda um número inteiro chamado `user_version`. Usamos
 *    ele para saber qual versão do schema já está no aparelho. Quando
 *    uma fase futura precisar de tabelas novas (status_trilha...), você
 *    adiciona um bloco novo em `migrar()` e sobe a VERSAO_SCHEMA — os
 *    apps já instalados se atualizam sozinhos, sem perder os dados do
 *    usuário.
 */

import type { SQLiteDatabase } from 'expo-sqlite';

/** Suba este número sempre que adicionar/alterar tabelas em `migrar()`. */
export const VERSAO_SCHEMA = 11;

/**
 * Versão 1 do schema: catálogo da RDC 216 + o estabelecimento.
 *
 * Convenções adotadas:
 *  - IDs de catálogo são TEXT e vêm do seed ('restaurante', 'edif_01'...),
 *    o que mantém a rastreabilidade com o arquivo da norma.
 *  - Booleanos viram INTEGER 0/1 (o SQLite não tem tipo booleano).
 *  - Datas viram TEXT no formato 'AAAA-MM-DD' (ISO 8601). Nesse formato
 *    a comparação alfabética é igual à comparação cronológica, o que
 *    facilita as contas de vencimento da Fase 5.
 *  - `ordem` preserva a ordem em que as coisas aparecem no seed (que é a
 *    ordem da norma), já que SELECT sem ORDER BY não garante ordem.
 */
const SCHEMA_V1 = `
  -- Os 6 perfis de negócio (RF02).
  CREATE TABLE IF NOT EXISTS perfil (
    id                            TEXT PRIMARY KEY,
    nome                          TEXT    NOT NULL,
    descricao                     TEXT    NOT NULL,
    periodicidade_auditoria_dias  INTEGER NOT NULL,
    ordem                         INTEGER NOT NULL
  );

  -- Os 12 blocos temáticos da RDC (seções 4.1 a 4.12).
  CREATE TABLE IF NOT EXISTS categoria (
    id               TEXT PRIMARY KEY,
    nome             TEXT    NOT NULL,
    codigo_rdc       TEXT    NOT NULL,
    pop_obrigatorio  INTEGER NOT NULL DEFAULT 0,
    ordem            INTEGER NOT NULL
  );

  -- Cada exigência da norma.
  CREATE TABLE IF NOT EXISTS item (
    id                  TEXT PRIMARY KEY,
    categoria_id        TEXT    NOT NULL REFERENCES categoria(id),
    codigo_rdc          TEXT    NOT NULL,
    texto               TEXT    NOT NULL,
    frequencia          TEXT    NOT NULL
                          CHECK (frequencia IN ('diario', 'periodico', 'semestral')),
    critico             INTEGER NOT NULL DEFAULT 0,
    peso                INTEGER NOT NULL DEFAULT 1,
    -- Só preenchido nos itens de frequência legal fixa (água: 180 dias).
    periodicidade_dias  INTEGER,
    ordem               INTEGER NOT NULL
  );

  -- O FILTRO INTELIGENTE (RF03): quais itens aparecem para qual perfil.
  -- É uma tabela de ligação: uma linha por par item+perfil.
  CREATE TABLE IF NOT EXISTS item_aplicabilidade (
    item_id    TEXT NOT NULL REFERENCES item(id)   ON DELETE CASCADE,
    perfil_id  TEXT NOT NULL REFERENCES perfil(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, perfil_id)
  );

  -- O ESTABELECIMENTO do usuário. Dado do usuário: o seed não mexe aqui.
  -- É a âncora do app: inspeções, itens ocultos (RF09) e as trilhas de
  -- periodicidade (Fase 5) vão todos apontar para esta tabela.
  CREATE TABLE IF NOT EXISTS estabelecimento (
    id                            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                          TEXT NOT NULL,
    perfil_id                     TEXT NOT NULL REFERENCES perfil(id),
    -- Base de cálculo do primeiro vencimento na Fase 5, quando ainda não
    -- existe nenhuma inspeção concluída.
    data_cadastro                 TEXT NOT NULL,
    -- Copiado do perfil na criação, mas editável pelo usuário depois
    -- (a auditoria periódica é regra de negócio, não exigência legal).
    periodicidade_auditoria_dias  INTEGER NOT NULL
  );

  -- Índices: aceleram os JOINs que a Fase 2 vai fazer para montar o checklist.
  CREATE INDEX IF NOT EXISTS idx_item_categoria    ON item (categoria_id);
  CREATE INDEX IF NOT EXISTS idx_aplic_perfil      ON item_aplicabilidade (perfil_id);

  -- Guarda qual versão do seed já foi carregada (ver db/seed.ts).
  CREATE TABLE IF NOT EXISTS meta (
    chave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
  );
`;

/**
 * Versão 2: campos opcionais do estabelecimento.
 *
 * Repare que NÃO editamos o SCHEMA_V1 acima. Quem já tem o app instalado
 * está com `user_version = 1`: aquele bloco não roda de novo, e a coluna
 * nova nunca apareceria no aparelho dele. Toda alteração de schema entra
 * como um bloco NOVO — é o que faz o app se atualizar sem perder dados.
 *
 * `responsavel` conversa com a seção 4.12 da RDC (responsável pela
 * manipulação); `cidade` serve ao relatório. Ambos são opcionais: sem
 * NOT NULL, o SQLite aceita NULL nas linhas que já existem.
 */
const SCHEMA_V2 = `
  ALTER TABLE estabelecimento ADD COLUMN cidade      TEXT;
  ALTER TABLE estabelecimento ADD COLUMN responsavel TEXT;
`;

/**
 * Versão 3 (Fase 3): a EXECUÇÃO da inspeção (RF06) e o "Não se Aplica"
 * permanente (RF09). São três tabelas com papéis bem diferentes:
 *
 *  - `inspecao`    = o cabeçalho de um preenchimento (de quem, qual
 *                    trilha, quando começou, quando terminou).
 *  - `resposta`    = uma linha por item respondido dentro de uma inspeção.
 *  - `item_oculto` = os itens que o usuário disse que não se aplicam ao
 *                    negócio dele, e que somem das próximas inspeções.
 *
 * POR QUE `item_oculto` É UMA TABELA PRÓPRIA
 * Daria para deduzir os itens ocultos procurando a última resposta de
 * cada item. Mas uma tabela separada é melhor por dois motivos: a
 * consulta do checklist vira um NOT IN simples, em vez de uma subconsulta
 * com "última inspeção"; e o RF09 fica REVERSÍVEL — desocultar um item é
 * apagar uma linha, sem reescrever o histórico de inspeções.
 *
 * SOBRE AS DATAS AQUI
 * `data_cadastro` (v1) guarda só 'AAAA-MM-DD', mas em inspeção usamos o
 * timestamp ISO completo ('2026-09-05T14:03:21.000Z'). O motivo é ordenar
 * duas inspeções do mesmo dia. Como o timestamp COMEÇA pela data, as
 * comparações de vencimento da Fase 5 continuam funcionando igual, e
 * `substr(data_conclusao, 1, 10)` devolve a data pura quando precisar.
 */
const SCHEMA_V3 = `
  -- Um preenchimento do checklist, do início à conclusão.
  CREATE TABLE IF NOT EXISTS inspecao (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    estabelecimento_id  INTEGER NOT NULL REFERENCES estabelecimento(id) ON DELETE CASCADE,
    -- Qual das três trilhas de periodicidade está sendo preenchida.
    -- Já existe agora, na Fase 3, porque a Fase 5 se apoia nela.
    trilha              TEXT    NOT NULL
                          CHECK (trilha IN ('diario', 'periodico', 'semestral')),
    data_inicio         TEXT    NOT NULL,
    -- NULL enquanto a inspeção está em andamento.
    data_conclusao      TEXT,
    status              TEXT    NOT NULL DEFAULT 'em_andamento'
                          CHECK (status IN ('em_andamento', 'concluida'))
  );

  -- As quatro respostas do RF06, uma linha por item respondido.
  -- A chave primária composta impede o mesmo item de ser respondido duas
  -- vezes na mesma inspeção: trocar de opção ATUALIZA a linha existente.
  CREATE TABLE IF NOT EXISTS resposta (
    inspecao_id    INTEGER NOT NULL REFERENCES inspecao(id) ON DELETE CASCADE,
    item_id        TEXT    NOT NULL REFERENCES item(id),
    resposta       TEXT    NOT NULL
                     CHECK (resposta IN ('adequado', 'inadequado',
                                         'nao_se_aplica', 'nao_observado')),
    respondida_em  TEXT    NOT NULL,
    PRIMARY KEY (inspecao_id, item_id)
  );

  -- O RF09: itens que não se aplicam a ESTE estabelecimento.
  -- Ligado ao estabelecimento, e não ao perfil: dois restaurantes podem
  -- tomar decisões diferentes sobre o mesmo item.
  CREATE TABLE IF NOT EXISTS item_oculto (
    estabelecimento_id  INTEGER NOT NULL REFERENCES estabelecimento(id) ON DELETE CASCADE,
    item_id             TEXT    NOT NULL REFERENCES item(id),
    ocultado_em         TEXT    NOT NULL,
    PRIMARY KEY (estabelecimento_id, item_id)
  );

  CREATE INDEX IF NOT EXISTS idx_inspecao_estab ON inspecao (estabelecimento_id, status);
  CREATE INDEX IF NOT EXISTS idx_resposta_item  ON resposta (item_id);
`;

/**
 * Versão 4 (Fase 4): o que o score precisa saber.
 *
 * `item.momento` — em que ponto do expediente o item diário pode ser
 * verificado (ver `MomentoDia` em data/rdc216.ts). Coluna do catálogo:
 * quem preenche é o seed, por isso a `VERSAO_SEED` sobe junto.
 *
 * `inspecao.modo` — 'essencial' (só os itens críticos) ou 'completa'.
 * Guardado na inspeção para o histórico não comparar laranja com maçã:
 * 100% num essencial de 12 itens não é 100% num completo de 32.
 *
 * `inspecao.total_itens` — quantos itens o checklist tinha no momento
 * da conclusão. Precisa ser CONGELADO aqui: se fosse recontado depois,
 * ocultar um item (RF09) mudaria retroativamente o "22 de 32
 * observados" de uma inspeção antiga.
 *
 * `inspecao.dia_local` — a que DIA (no fuso do aparelho) a inspeção se
 * refere, gravado na ABERTURA. Duas razões. Primeira: `data_conclusao` é
 * UTC, e uma diária fechada às 21h30 no Brasil (UTC-3) já é o dia
 * seguinte em UTC — cairia no dia errado. Segunda: é o que prende a
 * diária ao seu dia, para uma inspeção deixada aberta ontem não ser
 * retomada hoje e misturar as respostas de dois expedientes.
 */
const SCHEMA_V4 = `
  ALTER TABLE item     ADD COLUMN momento     TEXT;
  ALTER TABLE inspecao ADD COLUMN modo        TEXT;
  ALTER TABLE inspecao ADD COLUMN total_itens INTEGER;
  ALTER TABLE inspecao ADD COLUMN dia_local   TEXT;

  CREATE INDEX IF NOT EXISTS idx_inspecao_dia ON inspecao (estabelecimento_id, trilha, dia_local);
`;

/**
 * Versão 5: o RESUMO EM TÓPICOS de cada item.
 *
 * Guardado como JSON num TEXT, e não numa tabela `item_topico`. A regra
 * que seguimos no projeto é: vira tabela o que o SQL precisa cruzar. Os
 * perfis viraram `item_aplicabilidade` porque o filtro (RF03) é um JOIN;
 * os tópicos nunca são filtrados nem ordenados — só exibidos, sempre
 * junto do item que os contém. Uma tabela aqui só acrescentaria um JOIN
 * a cada leitura do checklist, sem nada em troca.
 */
const SCHEMA_V5 = `
  ALTER TABLE item ADD COLUMN topicos TEXT;
`;

/**
 * v6: EM QUE DIAS DA SEMANA O ESTABELECIMENTO ABRE.
 *
 * Máscara de 7 caracteres '0'/'1' indexada pelo `Date.getDay()` —
 * posição 0 é domingo. '1111110' é "abre de domingo a sexta". A leitura
 * e as contas moram em `db/funcionamento.ts`.
 *
 * TEXT e não tabela pela regra de sempre: vira tabela o que o SQL
 * precisa cruzar, e esta máscara é lida inteira junto do estabelecimento
 * e nunca filtrada nem ordenada em SQL.
 *
 * Fica NULL nas linhas que já existem, e `normalizarFuncionamento` lê
 * NULL como "abre todo dia" — que é exatamente o comportamento anterior.
 * Ninguém que já usa o app vê a sequência mudar por causa da migração.
 */
const SCHEMA_V6 = `
  ALTER TABLE estabelecimento ADD COLUMN dias_funcionamento TEXT;
`;

/**
 * v7: REPARO da v6 — a mesma coluna, agora à prova de meio-caminho.
 *
 * INCIDENTE REAL. Durante o desenvolvimento, a `VERSAO_SCHEMA` subiu
 * para 6 numa gravação do arquivo e o bloco `if (versaoAtual < 6)` só
 * entrou na gravação seguinte. O Metro recarregou no meio: o app rodou
 * um `migrar()` que não tinha o que executar, e ainda assim gravou
 * `user_version = 6`. Resultado — versão 6 sem a coluna 6, e o
 * `if (versaoAtual >= VERSAO_SCHEMA) return` fechando a porta para
 * sempre. Nenhum reload conserta o que está gravado no banco.
 *
 * POR QUE UM BLOCO NOVO E NÃO UMA CORREÇÃO NO V6
 * Editar o V6 não alcançaria quem já está com `user_version = 6` — é a
 * mesma razão pela qual nenhum bloco antigo é editado neste arquivo. Um
 * número de versão, uma vez gravado num aparelho, é passado: só se
 * avança por cima dele.
 *
 * POR QUE ESTE É CONDICIONAL
 * Ele roda em dois aparelhos diferentes: o que ficou torto (não tem a
 * coluna) e o que migrou direito (tem). O SQLite não conhece
 * `ADD COLUMN IF NOT EXISTS`, então a pergunta é feita em código, com
 * `PRAGMA table_info`. É o primeiro bloco com guarda — os outros seis
 * são incondicionais porque nenhum deles repara nada.
 */
const SCHEMA_V7 = `
  ALTER TABLE estabelecimento ADD COLUMN dias_funcionamento TEXT;
`;

/**
 * v8: O PLANO DE AÇÃO CORRETIVA (RF07).
 *
 * Uma linha por ação: o que o usuário vai fazer para corrigir um item
 * que ficou inadequado, e até quando. É conteúdo do usuário, por isso é
 * gravado; a situação (atrasada, vence hoje) é DERIVADA do prazo, em
 * `db/acao.ts`, e não tem coluna.
 *
 * - `item_id` e não `resposta`: a ação corrige o ITEM no estabelecimento.
 *   Se o mesmo item sai inadequado em cinco diárias seguidas, continua
 *   sendo uma coisa só a consertar.
 * - `inspecao_id` é só a origem (de qual inspeção a ação saiu). Fica
 *   NULL se a inspeção for apagada, sem levar a ação junto.
 * - `prazo` é DIA LOCAL, como `inspecao.dia_local`: prazo é "até sexta",
 *   não um instante em UTC.
 *
 * O ÍNDICE ÚNICO PARCIAL é a regra "uma ação ABERTA por item": o SQLite
 * recusa a segunda. As concluídas ficam fora dele — o mesmo item pode ter
 * sido corrigido em março e voltar a precisar de ação em setembro.
 */
const SCHEMA_V8 = `
  CREATE TABLE IF NOT EXISTS acao (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    estabelecimento_id  INTEGER NOT NULL REFERENCES estabelecimento(id) ON DELETE CASCADE,
    item_id             TEXT    NOT NULL REFERENCES item(id),
    inspecao_id         INTEGER REFERENCES inspecao(id) ON DELETE SET NULL,
    descricao           TEXT    NOT NULL CHECK (length(trim(descricao)) > 0),
    prazo               TEXT    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'aberta'
                          CHECK (status IN ('aberta', 'concluida')),
    criada_em           TEXT    NOT NULL,
    concluida_em        TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_acao_aberta_por_item
    ON acao (estabelecimento_id, item_id) WHERE status = 'aberta';
`;

/**
 * v9: CORRIGIDO NA HORA — a correção imediata, na diária.
 *
 * Boa parte do que sai inadequado numa diária se resolve no momento:
 * funcionário sem touca, bancada suja, alimento fora da geladeira. Isso é
 * CORREÇÃO IMEDIATA, e não pede ação planejada com prazo. O plano de ação
 * (RF07) é para o que precisa de tempo, dinheiro ou terceiros.
 *
 * A marca fica NA RESPOSTA, e não numa ação concluída na hora, porque o
 * que ela registra é um fato da inspeção: "estava inadequado, e foi
 * corrigido ali". Por isso o SCORE NÃO MUDA — o item estava inadequado
 * naquele momento, e esconder isso do número seria maquiar a inspeção.
 *
 * 0/1, como `item.critico`. Coluna nova no FIM da tabela (ALTER TABLE):
 * todo INSERT em `resposta` precisa nomear as colunas.
 */
const SCHEMA_V9 = `
  ALTER TABLE resposta
    ADD COLUMN corrigido_na_hora INTEGER NOT NULL DEFAULT 0
      CHECK (corrigido_na_hora IN (0, 1));
`;

/** Um UUID v4 gerado pelo próprio SQLite, em texto ('8f1c…-4…-a…'). */
const NOVO_UUID = `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
  substr(lower(hex(randomblob(2))), 2) || '-' ||
  substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
  lower(hex(randomblob(6))))`;

/** Agora, em UTC ISO com milissegundos — o mesmo formato do `agoraISO()`. */
const AGORA = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

/**
 * Colunas e gatilhos de uma tabela com IDENTIDADE GLOBAL (`uuid`).
 *
 * O gatilho de INSERT só preenche quando a linha chega sem uuid — é o
 * caso de todo INSERT do app. A restauração de um backup traz o uuid e o
 * `atualizado_em` do servidor, e esses são respeitados.
 */
function comUuid(tabela: string): string {
  return `
  ALTER TABLE ${tabela} ADD COLUMN uuid          TEXT;
  ALTER TABLE ${tabela} ADD COLUMN atualizado_em TEXT;
  UPDATE ${tabela} SET uuid = ${NOVO_UUID}, atualizado_em = ${AGORA};
  CREATE UNIQUE INDEX IF NOT EXISTS idx_${tabela}_uuid ON ${tabela} (uuid);

  CREATE TRIGGER IF NOT EXISTS trg_${tabela}_novo AFTER INSERT ON ${tabela}
    WHEN NEW.uuid IS NULL
  BEGIN
    UPDATE ${tabela} SET uuid = ${NOVO_UUID}, atualizado_em = ${AGORA} WHERE rowid = NEW.rowid;
  END;
${gatilhoAlterado(tabela)}`;
}

/** Colunas e gatilhos de uma tabela de chave NATURAL (sem uuid). */
function semUuid(tabela: string): string {
  return `
  ALTER TABLE ${tabela} ADD COLUMN atualizado_em TEXT;
  UPDATE ${tabela} SET atualizado_em = ${AGORA};

  CREATE TRIGGER IF NOT EXISTS trg_${tabela}_novo AFTER INSERT ON ${tabela}
    WHEN NEW.atualizado_em IS NULL
  BEGIN
    UPDATE ${tabela} SET atualizado_em = ${AGORA} WHERE rowid = NEW.rowid;
  END;
${gatilhoAlterado(tabela)}`;
}

/**
 * Toda alteração carimba `atualizado_em` — a não ser que quem escreveu
 * tenha carimbado por conta própria (a restauração faz isso).
 */
function gatilhoAlterado(tabela: string): string {
  return `
  CREATE TRIGGER IF NOT EXISTS trg_${tabela}_alterado AFTER UPDATE ON ${tabela}
    WHEN NEW.atualizado_em IS OLD.atualizado_em
  BEGIN
    UPDATE ${tabela} SET atualizado_em = ${AGORA} WHERE rowid = NEW.rowid;
  END;`;
}

/**
 * v10: O QUE O BACKUP NA NUVEM PRECISA SABER (RF01, Fase 6).
 *
 * Três obstáculos do schema, descritos no plano (seção 6.2), resolvidos
 * sem mexer em nenhuma chave primária e sem tocar em nenhum INSERT,
 * UPDATE ou DELETE do `db/consultas.ts`:
 *
 * 1. IDENTIDADE GLOBAL. `estabelecimento`, `inspecao` e `acao` usam
 *    AUTOINCREMENT: o id 1 deste celular e o id 1 de outro são coisas
 *    diferentes. Elas ganham um `uuid` AO LADO do id — o app continua
 *    usando o inteiro por dentro, e o uuid só existe na fronteira com a
 *    nuvem. `resposta` e `item_oculto` não precisam: a chave delas já é
 *    natural (inspeção + item, estabelecimento + item).
 *
 * 2. O QUE MUDOU. Toda tabela de dado do usuário ganha `atualizado_em`,
 *    carimbado por GATILHO. Gatilho, e não código: com ele, nenhuma das
 *    escritas que já existem precisa lembrar de carimbar, e uma escrita
 *    nova escrita amanhã também não. Esquecer um carimbo seria um dado
 *    que nunca sobe — o tipo de erro que ninguém percebe até precisar
 *    do backup.
 *
 * 3. O QUE FOI APAGADO. O app apaga de verdade (ação excluída, item
 *    reexibido). Um DELETE não deixa rastro, e a nuvem nunca saberia.
 *    Em vez de trocar DELETE por "marcar como apagado" em todo o app
 *    (a lápide do plano, que mexeria em toda leitura), um gatilho anota
 *    cada exclusão em `sync_exclusao`, e o backup repassa. A anotação é
 *    apagada assim que a nuvem confirma.
 *
 * As linhas que JÁ EXISTEM recebem uuid e carimbo aqui mesmo: é isso que
 * faz as inspeções feitas antes do login subirem no primeiro backup.
 *
 * É o primeiro bloco MONTADO por funções (os gatilhos se repetem nas
 * cinco tabelas). Por isso é exportado: o auxiliar `migrarAte` dos testes
 * lê os blocos antigos como texto, e este só existe pronto depois de
 * compilado.
 */
export const SCHEMA_V10 = `
${comUuid('estabelecimento')}
${comUuid('inspecao')}
${comUuid('acao')}
${semUuid('resposta')}
${semUuid('item_oculto')}

  CREATE TABLE IF NOT EXISTS sync_exclusao (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tabela       TEXT NOT NULL,
    -- uuid da linha apagada; em item_oculto, o uuid do ESTABELECIMENTO.
    uuid         TEXT NOT NULL,
    -- Só em item_oculto, que não tem uuid próprio.
    item_id      TEXT,
    excluido_em  TEXT NOT NULL
  );

  CREATE TRIGGER IF NOT EXISTS trg_inspecao_apagada AFTER DELETE ON inspecao
  BEGIN
    INSERT INTO sync_exclusao (tabela, uuid, excluido_em)
    VALUES ('inspecao', OLD.uuid, ${AGORA});
  END;

  CREATE TRIGGER IF NOT EXISTS trg_acao_apagada AFTER DELETE ON acao
  BEGIN
    INSERT INTO sync_exclusao (tabela, uuid, excluido_em)
    VALUES ('acao', OLD.uuid, ${AGORA});
  END;

  CREATE TRIGGER IF NOT EXISTS trg_item_oculto_apagado AFTER DELETE ON item_oculto
  BEGIN
    INSERT INTO sync_exclusao (tabela, uuid, item_id, excluido_em)
    SELECT 'item_oculto', e.uuid, OLD.item_id, ${AGORA}
      FROM estabelecimento e WHERE e.id = OLD.estabelecimento_id;
  END;
`;

/**
 * v11: O HORÁRIO DE FUNCIONAMENTO — a régua das janelas da diária.
 *
 * Pedido do orientador (20/10/2026): saber se cada etapa da diária foi
 * feita na hora certa. A regra mora em `db/janela.ts`; aqui só nascem as
 * duas colunas, em 'HH:MM' no horário local.
 *
 * NULL nas linhas antigas = sem horário = sem janela, e tudo continua
 * aberto o dia todo, como antes. Ninguém que já usava o app acorda com
 * itens travados que nunca pediu para travar.
 *
 * TEXT, e não minutos em INTEGER: é o formato que se lê no banco e no
 * backup sem conta nenhuma, e a conversão é uma linha no `janela.ts`.
 */
const SCHEMA_V11 = `
  ALTER TABLE estabelecimento ADD COLUMN hora_abertura   TEXT;
  ALTER TABLE estabelecimento ADD COLUMN hora_fechamento TEXT;
`;

/** Essa tabela já tem essa coluna? */
function temColuna(db: SQLiteDatabase, tabela: string, coluna: string): boolean {
  return db
    .getAllSync<{ name: string }>(`PRAGMA table_info(${tabela})`)
    .some((c) => c.name === coluna);
}

/**
 * Cria/atualiza as tabelas conforme a versão do schema no aparelho.
 *
 * Roda em toda abertura do app, mas cada bloco só executa uma vez:
 * se `user_version` já é 1, o bloco da v1 é pulado.
 */
export function migrar(db: SQLiteDatabase): void {
  const linha = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const versaoAtual = linha?.user_version ?? 0;

  if (versaoAtual >= VERSAO_SCHEMA) return;

  if (versaoAtual < 1) {
    db.execSync(SCHEMA_V1);
  }

  if (versaoAtual < 2) {
    db.execSync(SCHEMA_V2);
  }

  if (versaoAtual < 3) {
    db.execSync(SCHEMA_V3);
  }

  if (versaoAtual < 4) {
    db.execSync(SCHEMA_V4);
  }

  if (versaoAtual < 5) {
    db.execSync(SCHEMA_V5);
  }

  if (versaoAtual < 6) {
    db.execSync(SCHEMA_V6);
  }

  // A guarda é o ponto do bloco: ver o comentário do SCHEMA_V7.
  if (versaoAtual < 7) {
    if (!temColuna(db, 'estabelecimento', 'dias_funcionamento')) {
      db.execSync(SCHEMA_V7);
    }
  }

  if (versaoAtual < 8) {
    db.execSync(SCHEMA_V8);
  }

  if (versaoAtual < 9) {
    db.execSync(SCHEMA_V9);
  }

  if (versaoAtual < 10) {
    db.execSync(SCHEMA_V10);
  }

  if (versaoAtual < 11) {
    db.execSync(SCHEMA_V11);
  }

  // PRAGMA não aceita parâmetro (?), por isso a interpolação direta.
  // É seguro aqui porque VERSAO_SCHEMA é uma constante nossa, não entrada do usuário.
  db.execSync(`PRAGMA user_version = ${VERSAO_SCHEMA}`);
}
