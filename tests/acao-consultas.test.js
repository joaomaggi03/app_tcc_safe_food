/**
 * tests/acao-consultas.test.js
 * ---------------------------------------------------------------
 * O SQL do plano de ação (RF07), extraído do `db/consultas.ts` e
 * executado contra um SQLite de verdade — o mesmo arranjo do
 * score.test.js (ver tests/_apoio/consultas.js).
 *
 * Duas consultas têm regra dentro delas, e é isso que se testa aqui:
 *  - as PENDÊNCIAS de uma inspeção (só inadequados, críticos primeiro,
 *    com a ação aberta de cada um);
 *  - a SUGESTÃO DE CONCLUIR (`adequado_em`), que olha só a ÚLTIMA
 *    avaliação do item depois que a ação foi criada.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema } = require('./_apoio/modulos');
const { constante, sqlQueContem } = require('./_apoio/consultas');

const { migrar } = schema();

const SELECT_ACAO = constante('SELECT_ACAO');
const SQL_PENDENCIAS = sqlQueContem('a.prazo AS acao_prazo');

/** Três itens: um crítico e dois comuns, numa categoria só. */
function cenario() {
  const db = bancoVazio();
  migrar(db);

  db.runSync("INSERT INTO perfil VALUES ('restaurante','R','d',30,1)");
  db.runSync("INSERT INTO categoria VALUES ('preparo','Preparação','4.8',0,1)");
  for (const [id, critico, ordem] of [
    ['comum1', 0, 1],
    ['critico', 1, 2],
    ['comum2', 0, 3],
  ]) {
    db.runSync(
      `INSERT INTO item (id, categoria_id, codigo_rdc, texto, topicos, frequencia,
                         critico, peso, ordem)
       VALUES (?, 'preparo', '4.8.1', 'texto', '["resumo"]', 'diario', ?, 1, ?)`,
      id,
      critico,
      ordem,
    );
  }
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T','restaurante','2026-09-01',30)`,
  );
  return db;
}

/** Uma inspeção CONCLUÍDA em `dia`, às 10h UTC, com as respostas dadas. */
function inspecao(db, dia, respostas, status = 'concluida') {
  // O node:sqlite chama o id de `lastInsertRowid`; o expo-sqlite, de
  // `lastInsertRowId`. O adaptador não traduz esse campo.
  const { lastInsertRowid } = db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, data_conclusao,
                           status, dia_local)
     VALUES (1, 'diario', ?, ?, ?, ?)`,
    `${dia}T09:00:00.000Z`,
    status === 'concluida' ? `${dia}T10:00:00.000Z` : null,
    status,
    dia,
  );
  const id = Number(lastInsertRowid);
  for (const [item, resposta] of Object.entries(respostas)) {
    db.runSync(
      'INSERT INTO resposta (inspecao_id, item_id, resposta, respondida_em) VALUES (?, ?, ?, ?)',
      id,
      item,
      resposta,
      'x',
    );
  }
  return id;
}

/** Uma ação para o item, criada em `dia` às 12h UTC. */
function acao(db, item, dia, status = 'aberta') {
  db.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, descricao, prazo, status, criada_em,
                       concluida_em)
     VALUES (1, ?, 'corrigir', '2026-09-30', ?, ?, ?)`,
    item,
    status,
    `${dia}T12:00:00.000Z`,
    status === 'concluida' ? `${dia}T13:00:00.000Z` : null,
  );
}

function adequadoEm(db) {
  return db.getFirstSync(`${SELECT_ACAO} WHERE a.status = 'aberta'`).adequado_em;
}

// ---------------------------------------------------------------
// PENDÊNCIAS DA INSPEÇÃO
// ---------------------------------------------------------------

test('pendências são só os inadequados, com o crítico primeiro', () => {
  const db = cenario();
  const id = inspecao(db, '2026-09-10', {
    comum1: 'inadequado',
    critico: 'inadequado',
    comum2: 'adequado',
  });

  const itens = db.getAllSync(SQL_PENDENCIAS, id).map((p) => p.item_id);
  assert.deepEqual(itens, ['critico', 'comum1']);
});

test('pendência com ação aberta traz a ação; sem ação, vem null', () => {
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado', comum2: 'inadequado' });
  acao(db, 'comum1', '2026-09-10');

  const porItem = Object.fromEntries(db.getAllSync(SQL_PENDENCIAS, id).map((p) => [p.item_id, p]));
  assert.equal(porItem.comum1.acao_prazo, '2026-09-30');
  assert.equal(porItem.comum2.acao_id, null);
});

test('ação já CONCLUÍDA não conta: o item volta a pedir ação', () => {
  // Corrigido em agosto, inadequado de novo em setembro.
  const db = cenario();
  acao(db, 'comum1', '2026-08-01', 'concluida');
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado' });

  assert.equal(db.getAllSync(SQL_PENDENCIAS, id)[0].acao_id, null);
});

// ---------------------------------------------------------------
// SUGESTÃO DE CONCLUIR
// ---------------------------------------------------------------

test('item adequado numa inspeção posterior sugere concluir, com o dia', () => {
  const db = cenario();
  inspecao(db, '2026-09-10', { comum1: 'inadequado' });
  acao(db, 'comum1', '2026-09-10');
  inspecao(db, '2026-09-12', { comum1: 'adequado' });

  assert.equal(adequadoEm(db), '2026-09-12');
});

test('sem inspeção posterior, não há sugestão', () => {
  const db = cenario();
  inspecao(db, '2026-09-10', { comum1: 'inadequado' });
  acao(db, 'comum1', '2026-09-10');

  assert.equal(adequadoEm(db), null);
});

test('inspeção ANTERIOR à ação não conta, mesmo adequada', () => {
  // Adequado na segunda, quebrou na terça, ação criada na terça: o
  // "adequado" de segunda não resolve nada.
  const db = cenario();
  inspecao(db, '2026-09-08', { comum1: 'adequado' });
  acao(db, 'comum1', '2026-09-09');

  assert.equal(adequadoEm(db), null);
});

test('vale a ÚLTIMA avaliação: adequado e depois inadequado não sugere', () => {
  const db = cenario();
  acao(db, 'comum1', '2026-09-10');
  inspecao(db, '2026-09-11', { comum1: 'adequado' });
  inspecao(db, '2026-09-12', { comum1: 'inadequado' });

  assert.equal(adequadoEm(db), null);
});

test('"não observado" depois do adequado não apaga a sugestão', () => {
  // Não observar não é reprovar: a última AVALIAÇÃO continua sendo o adequado.
  const db = cenario();
  acao(db, 'comum1', '2026-09-10');
  inspecao(db, '2026-09-11', { comum1: 'adequado' });
  inspecao(db, '2026-09-12', { comum1: 'nao_observado' });

  assert.equal(adequadoEm(db), '2026-09-11');
});

test('inspeção ainda em andamento não gera sugestão', () => {
  const db = cenario();
  acao(db, 'comum1', '2026-09-10');
  inspecao(db, '2026-09-11', { comum1: 'adequado' }, 'em_andamento');

  assert.equal(adequadoEm(db), null);
});

// ---------------------------------------------------------------
// GERAÇÃO AUTOMÁTICA DO PLANO
// ---------------------------------------------------------------

const SQL_GERAR = sqlQueContem('INSERT OR IGNORE INTO acao');

function gerar(db, item, inspecaoId, descricao = 'gerada') {
  return db.runSync(SQL_GERAR, 1, item, inspecaoId, descricao, '2026-09-27', 'agora').changes;
}

test('a geração cria a ação do item inadequado', () => {
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado' });

  assert.equal(gerar(db, 'comum1', id), 1);
  assert.equal(db.getFirstSync('SELECT descricao FROM acao').descricao, 'gerada');
});

test('gerar de novo para o mesmo item NÃO duplica nem apaga o que o usuário ajustou', () => {
  // Cinco diárias seguidas com o mesmo item inadequado: uma ação só, e
  // com o texto que o usuário escreveu depois da primeira geração.
  const db = cenario();
  const primeira = inspecao(db, '2026-09-10', { comum1: 'inadequado' });
  gerar(db, 'comum1', primeira);
  db.runSync("UPDATE acao SET descricao = 'chamar o técnico'");

  const segunda = inspecao(db, '2026-09-11', { comum1: 'inadequado' });
  assert.equal(gerar(db, 'comum1', segunda), 0, 'a segunda geração é ignorada');

  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM acao').n, 1);
  assert.equal(db.getFirstSync('SELECT descricao FROM acao').descricao, 'chamar o técnico');
});

test('depois de concluída, o item volta a ganhar ação na próxima geração', () => {
  const db = cenario();
  acao(db, 'comum1', '2026-08-01', 'concluida');
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado' });

  assert.equal(gerar(db, 'comum1', id), 1);
});

// ---------------------------------------------------------------
// CORRIGIDO NA HORA (schema v9)
// ---------------------------------------------------------------

const SQL_MARCAR = sqlQueContem('SET corrigido_na_hora = ?');
const SQL_UPSERT = sqlQueContem('ON CONFLICT (inspecao_id, item_id)');

function corrigido(db, inspecaoId, item) {
  return db.getFirstSync(
    'SELECT corrigido_na_hora AS c FROM resposta WHERE inspecao_id = ? AND item_id = ?',
    inspecaoId,
    item,
  ).c;
}

test('a pendência traz a marca de corrigido na hora', () => {
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado', comum2: 'inadequado' });
  db.runSync(SQL_MARCAR, 1, id, 'comum1');

  const porItem = Object.fromEntries(db.getAllSync(SQL_PENDENCIAS, id).map((p) => [p.item_id, p]));
  assert.equal(porItem.comum1.corrigido_na_hora, 1);
  assert.equal(porItem.comum2.corrigido_na_hora, 0);
});

test('só se marca como corrigido o que está inadequado', () => {
  // O `AND resposta = 'inadequado'` é a trava no próprio banco.
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'adequado' });

  assert.equal(db.runSync(SQL_MARCAR, 1, id, 'comum1').changes, 0);
  assert.equal(corrigido(db, id, 'comum1'), 0);
});

test('trocar a resposta de inadequado para outra apaga a marca', () => {
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado' });
  db.runSync(SQL_MARCAR, 1, id, 'comum1');

  db.runSync(SQL_UPSERT, id, 'comum1', 'adequado', 'y');
  assert.equal(corrigido(db, id, 'comum1'), 0, 'adequado não pode carregar a marca');
});

test('responder inadequado de novo mantém a marca', () => {
  // Tocar duas vezes no mesmo botão não pode desfazer o que o usuário marcou.
  const db = cenario();
  const id = inspecao(db, '2026-09-10', { comum1: 'inadequado' });
  db.runSync(SQL_MARCAR, 1, id, 'comum1');

  db.runSync(SQL_UPSERT, id, 'comum1', 'inadequado', 'y');
  assert.equal(corrigido(db, id, 'comum1'), 1);
});
