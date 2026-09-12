/**
 * tests/inspecao.test.js
 * ---------------------------------------------------------------
 * As regras de abertura e conclusão de uma inspeção.
 *
 * A mais sutil é a da diária: ela é PRESA AO DIA. Uma inspeção deixada
 * aberta ontem não pode ser retomada hoje, senão as respostas de dois
 * expedientes se misturam num registro só e o "score do dia" perde o
 * sentido. Auditoria periódica não tem essa trava — 60 itens podem
 * legitimamente levar dois dias.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema, seed } = require('./_apoio/modulos');
const { sqlQueContem } = require('./_apoio/consultas');

const { migrar } = schema();
const { semear } = seed();

const HOJE = '2026-09-12';
const ONTEM = '2026-09-11';

function banco() {
  const db = bancoVazio();
  migrar(db);
  semear(db);
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T','restaurante','2026-09-01',30)`,
  );
  return db;
}

function abrir(db, trilha, dia) {
  db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, modo, data_inicio, dia_local, status)
     VALUES (1, ?, 'completa', ?, ?, 'em_andamento')`,
    trilha,
    `${dia}T10:00:00.000Z`,
    dia,
  );
  return db.getFirstSync('SELECT last_insert_rowid() AS id').id;
}

/** A mesma condição de retomada que o `iniciarInspecao` usa. */
const RETOMAVEL = sqlQueContem("AND (trilha <> 'diario' OR dia_local = ?)");

const retomavel = (db, trilha, hoje) => db.getFirstSync(RETOMAVEL, 1, trilha, hoje);

test('a diária de ontem não é retomada hoje', () => {
  const db = banco();
  abrir(db, 'diario', ONTEM);

  assert.equal(retomavel(db, 'diario', HOJE), null, 'abrir hoje começa uma inspeção nova');

  const deHoje = abrir(db, 'diario', HOJE);
  assert.equal(retomavel(db, 'diario', HOJE).id, deHoje, 'a de hoje, sim, é retomada');

  assert.equal(
    db.getFirstSync("SELECT COUNT(*) AS n FROM inspecao WHERE status='em_andamento'").n,
    2,
    'a de ontem segue no histórico, honestamente marcada como não concluída',
  );
});

test('a auditoria periódica pode atravessar dias', () => {
  const db = banco();
  const id = abrir(db, 'periodico', ONTEM);

  assert.equal(
    retomavel(db, 'periodico', HOJE).id,
    id,
    'uma auditoria de 60 itens leva mais de um dia, e isso é legítimo',
  );
});

test('concluir carimba data, dia local e o tamanho do checklist', () => {
  const db = banco();
  const id = abrir(db, 'diario', HOJE);

  db.runSync(sqlQueContem("SET status = 'concluida'"), 'agora', HOJE, 12, id);

  const linha = db.getFirstSync('SELECT * FROM inspecao WHERE id = ?', id);
  assert.equal(linha.status, 'concluida');
  assert.equal(linha.data_conclusao, 'agora');
  assert.equal(linha.dia_local, HOJE);
  assert.equal(linha.total_itens, 12, 'o tamanho é congelado para o histórico não mudar depois');
});

/**
 * `dia_local` é gravado na ABERTURA — é o dia a que a inspeção se
 * refere. O COALESCE na conclusão só cobre linhas criadas antes do
 * schema v4; ele não pode sobrescrever o dia de uma inspeção que
 * atravessou a meia-noite.
 */
test('concluir depois da meia-noite não muda o dia da inspeção', () => {
  const db = banco();
  const id = abrir(db, 'diario', ONTEM);

  db.runSync(sqlQueContem("SET status = 'concluida'"), 'agora', HOJE, 12, id);

  assert.equal(
    db.getFirstSync('SELECT dia_local FROM inspecao WHERE id = ?', id).dia_local,
    ONTEM,
    'o expediente aconteceu ontem, mesmo tendo sido fechado depois da meia-noite',
  );
});

test('concluir uma inspeção já concluída não a altera de novo', () => {
  const db = banco();
  const id = abrir(db, 'diario', HOJE);
  const concluir = sqlQueContem("SET status = 'concluida'");

  db.runSync(concluir, 'primeira', HOJE, 10, id);
  db.runSync(concluir, 'segunda', HOJE, 99, id);

  const linha = db.getFirstSync('SELECT * FROM inspecao WHERE id = ?', id);
  assert.equal(linha.data_conclusao, 'primeira', 'o WHERE só pega inspeção em andamento');
  assert.equal(linha.total_itens, 10);
});

test('a última conclusão de cada trilha é o que zera o relógio (RF05)', () => {
  const db = banco();
  const concluir = sqlQueContem("SET status = 'concluida'");

  for (const dia of ['2026-09-08', '2026-09-10', '2026-09-09']) {
    const id = abrir(db, 'diario', dia);
    db.runSync(concluir, `${dia}T20:00:00.000Z`, dia, 12, id);
  }
  abrir(db, 'diario', HOJE); // em andamento não conta

  const ultima = db.getFirstSync(
    `SELECT MAX(dia_local) AS dia FROM inspecao
      WHERE estabelecimento_id = 1 AND trilha = 'diario' AND status = 'concluida'`,
  ).dia;

  assert.equal(ultima, '2026-09-10', 'vale a data mais recente, não a última inserida');
});
