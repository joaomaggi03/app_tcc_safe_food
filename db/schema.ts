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
export const VERSAO_SCHEMA = 5;

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

  // PRAGMA não aceita parâmetro (?), por isso a interpolação direta.
  // É seguro aqui porque VERSAO_SCHEMA é uma constante nossa, não entrada do usuário.
  db.execSync(`PRAGMA user_version = ${VERSAO_SCHEMA}`);
}
