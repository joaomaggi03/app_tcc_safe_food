/**
 * tests/planos.test.js
 * ---------------------------------------------------------------
 * Os planos de ação PRONTOS (entrega 4 dos pedidos do orientador):
 * o catálogo (`data/planos-acao.ts`), o SQL que filtra os passos por
 * perfil e RF09, e o texto da ação (`descricaoDaAcao`).
 *
 * O catálogo real tem um plano (prag_01), testado pelo resultado por
 * perfil. A REGRA do SQL é testada à parte, com passos de mentira no
 * lugar do catálogo, para não depender do conteúdo — e as guardas do
 * catálogo valem para os planos que entrarem depois.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { bancoVazio } = require('./_apoio/banco');
const { acao, rdc216, schema, seed } = require('./_apoio/modulos');
const { constante } = require('./_apoio/consultas');

const { PLANOS_PRONTOS } = require(path.join(__dirname, '.compilado', 'data', 'planos-acao.js'));
const { ITENS } = rdc216();
const { descricaoDaAcao, descricaoGerada } = acao();
const { migrar } = schema();
const { semear } = seed();

const SELECT_PASSOS = constante('SELECT_PASSOS_DO_PLANO');

// ---------------------------------------------------------------
// O CATÁLOGO — guardas para o conteúdo que vai entrar
// ---------------------------------------------------------------

test('todo plano aponta para itens que existem na norma', () => {
  const ids = new Set(ITENS.map((item) => item.id));
  for (const plano of PLANOS_PRONTOS) {
    assert.ok(ids.has(plano.itemId), `plano de item inexistente: ${plano.itemId}`);
    assert.ok(plano.passos.length > 0, `${plano.itemId}: plano sem passos`);
    for (const passo of plano.passos) {
      assert.ok(ids.has(passo.itemRelacionado), `${plano.itemId}: ${passo.itemRelacionado}?`);
    }
  }
});

/** Regra 4 do CLAUDE.md: complemento sem fonte é conteúdo inventado. */
test('todo passo diz a origem: artigo da RDC ou fonte do complemento', () => {
  for (const plano of PLANOS_PRONTOS) {
    for (const passo of plano.passos) {
      assert.ok(passo.texto.trim().length > 0, `${plano.itemId}: passo sem texto`);
      if (passo.origem.tipo === 'norma') {
        assert.match(passo.origem.codigoRdc, /^4\.\d+(\.\d+)?$/, `${plano.itemId}: código RDC`);
      } else {
        assert.ok(passo.origem.fonte.trim().length > 0, `${plano.itemId}: complemento sem fonte`);
      }
    }
  }
});

/**
 * Guarda contra citação inventada: o artigo de um passo da norma tem que
 * existir como código de algum item do `rdc216.ts`. Não pega citação
 * TROCADA (o 4.11.4 existe; o certo era o 4.11.6 — isso o `fiscal` pegou,
 * e conferir conteúdo é trabalho humano), mas pega código que não existe.
 */
test('todo artigo citado num passo existe no checklist do app', () => {
  const codigos = new Set(ITENS.map((item) => item.codigoRdc));
  for (const plano of PLANOS_PRONTOS) {
    for (const passo of plano.passos) {
      if (passo.origem.tipo !== 'norma') continue;
      assert.ok(codigos.has(passo.origem.codigoRdc), `${plano.itemId}: ${passo.origem.codigoRdc}?`);
    }
  }
});

test('um item tem no máximo um plano', () => {
  const vistos = PLANOS_PRONTOS.map((plano) => plano.itemId);
  assert.equal(new Set(vistos).size, vistos.length);
});

// ---------------------------------------------------------------
// O FILTRO POR PERFIL E RF09 (SQL real)
// ---------------------------------------------------------------

/** A norma inteira semeada (com o catálogo real) e um estabelecimento. */
function semeado(perfil) {
  const db = bancoVazio();
  migrar(db);
  semear(db);
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T', ?, '2026-10-01', 30)`,
    perfil,
  );
  return db;
}

/**
 * O CATÁLOGO REAL do prag_01, depois do seed: o restaurante recebe os 8
 * passos; feirante e ambulante, só os 3 dos itens que valem para eles
 * (4.3.1, 4.5.3 e o POP do 4.11.4) — a opção (b) decidida com o autor.
 */
test('catálogo real: restaurante recebe os 8 passos do prag_01', () => {
  const passos = semeado('restaurante').getAllSync(SELECT_PASSOS, 1, 'prag_01');
  assert.equal(passos.length, 8);
  assert.equal(passos[0].origem_ref, '4.3.1');
});

test('catálogo real: feirante e ambulante recebem só os passos que valem para eles', () => {
  for (const perfil of ['feirante', 'ambulante']) {
    const refs = semeado(perfil)
      .getAllSync(SELECT_PASSOS, 1, 'prag_01')
      .map((p) => p.origem_ref);
    assert.deepEqual(refs, ['4.3.1', '4.5.3', '4.11.6'], perfil);
  }
});

/** Passos de mentira no lugar do catálogo, para isolar a regra do SQL. */
function cenario(perfil) {
  const db = semeado(perfil);
  db.runSync('DELETE FROM plano_passo');
  const passos = [
    ['vale para todos', 'prag_01', 'norma', '4.3.1'],
    ['só fixos e food truck: telas', 'edif_04', 'norma', '4.1.4'],
    ['só fixos e food truck: empresa', 'prag_02', 'norma', '4.3.2'],
    ['complemento', 'prag_01', 'complemento', 'fonte de teste'],
  ];
  passos.forEach(([texto, relacionado, tipo, ref], ordem) => {
    db.runSync(
      `INSERT INTO plano_passo (item_id, ordem, texto, item_relacionado, origem_tipo, origem_ref)
       VALUES ('prag_01', ?, ?, ?, ?, ?)`,
      ordem,
      texto,
      relacionado,
      tipo,
      ref,
    );
  });
  return db;
}

const textos = (db) => db.getAllSync(SELECT_PASSOS, 1, 'prag_01').map((p) => p.texto);

test('restaurante recebe todos os passos, na ordem', () => {
  assert.deepEqual(textos(cenario('restaurante')), [
    'vale para todos',
    'só fixos e food truck: telas',
    'só fixos e food truck: empresa',
    'complemento',
  ]);
});

test('feirante recebe só os passos dos itens que valem para feirante', () => {
  assert.deepEqual(textos(cenario('feirante')), ['vale para todos', 'complemento']);
});

test('item marcado "não se aplica" (RF09) tira o passo dele', () => {
  const db = cenario('restaurante');
  db.runSync(
    `INSERT INTO item_oculto (estabelecimento_id, item_id, ocultado_em)
     VALUES (1, 'edif_04', '2026-10-21T10:00:00.000Z')`,
  );
  assert.ok(!textos(db).includes('só fixos e food truck: telas'));
  assert.equal(textos(db).length, 3);
});

test('item sem plano não tem passos', () => {
  assert.deepEqual(cenario('restaurante').getAllSync(SELECT_PASSOS, 1, 'prep_11'), []);
});

test('o banco recusa passo sem origem', () => {
  const db = cenario('restaurante');
  assert.throws(
    () =>
      db.runSync(
        `INSERT INTO plano_passo (item_id, ordem, texto, item_relacionado, origem_tipo, origem_ref)
         VALUES ('prag_01', 9, 'x', 'prag_01', 'complemento', '  ')`,
      ),
    /CHECK/,
  );
});

// ---------------------------------------------------------------
// O TEXTO DA AÇÃO
// ---------------------------------------------------------------

const ITEM = { codigo_rdc: '4.3.1', topicos: ['Local livre de pragas'] };

test('sem passos, a ação continua com o texto genérico de sempre', () => {
  assert.equal(descricaoDaAcao(ITEM, []), descricaoGerada(ITEM));
});

test('com passos, a ação lista cada um com a sua origem', () => {
  const texto = descricaoDaAcao(ITEM, [
    { texto: 'Fazer A', origem_tipo: 'norma', origem_ref: '4.3.2' },
    { texto: 'Fazer B', origem_tipo: 'complemento', origem_ref: 'Cartilha X' },
  ]);
  assert.equal(
    texto,
    'Plano para o item 4.3.1 da RDC 216:\n' +
      '1. Fazer A (RDC 4.3.2)\n' +
      '2. Fazer B (boa prática — fonte: Cartilha X)',
  );
});
