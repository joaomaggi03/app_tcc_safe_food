/**
 * tests/reincidencia.test.js
 * ---------------------------------------------------------------
 * A REINCIDÊNCIA (db/reincidencia.ts): o item que já saiu inadequado nas
 * inspeções anteriores da mesma trilha.
 *
 * Duas partes:
 *  - a regra pura (contar, "na última", o grupo da rotina guiada) e o
 *    texto do selo (theme/rotulos.ts);
 *  - o SQL real do `db/consultas.ts` contra um SQLite de verdade: QUAIS
 *    inspeções contam como anteriores. É lá que mora o que dá errado —
 *    olhar a inspeção atual, uma de outra trilha ou uma do futuro.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { reincidencia, schema } = require('./_apoio/modulos');
const { constante } = require('./_apoio/consultas');
const rotulos = require('./.compilado/theme/rotulos.js');

const { reincidencias, reincidenciaDoGrupo, janelaDaTrilha, JANELA_DIARIA } = reincidencia();
const { textoReincidencia, textoReincidenciaDoGrupo } = rotulos;
const { migrar } = schema();

// ---------------------------------------------------------------
// REGRA PURA
// ---------------------------------------------------------------

test('a janela é de 7 diárias e de 1 nas outras trilhas', () => {
  assert.equal(JANELA_DIARIA, 7);
  assert.equal(janelaDaTrilha('diario'), 7);
  assert.equal(janelaDaTrilha('periodico'), 1);
  assert.equal(janelaDaTrilha('semestral'), 1);
});

test('conta em quantas das anteriores o item falhou e marca a última', () => {
  // Da mais recente para a mais antiga.
  const r = reincidencias([['a', 'b'], [], ['a'], ['c']], 7);
  assert.deepEqual(r.a, { vezes: 2, de: 4, naUltima: true });
  assert.deepEqual(r.b, { vezes: 1, de: 4, naUltima: true });
  assert.deepEqual(r.c, { vezes: 1, de: 4, naUltima: false });
  assert.equal(r.d, undefined, 'item que nunca falhou não aparece');
});

test('só as inspeções dentro da janela contam', () => {
  const anteriores = [[], [], [], [], [], [], [], ['velho']];
  assert.equal(reincidencias(anteriores, 7).velho, undefined);
  assert.deepEqual(reincidencias(anteriores, 8).velho, { vezes: 1, de: 8, naUltima: false });
});

test('sem inspeções anteriores, nada é reincidente', () => {
  assert.deepEqual(reincidencias([], 7), {});
});

test('item repetido na mesma inspeção conta uma vez', () => {
  assert.equal(reincidencias([['a', 'a']], 7).a.vezes, 1);
});

test('no grupo da rotina vale o item que mais falhou; no empate, o da última', () => {
  const porItem = {
    x: { vezes: 1, de: 7, naUltima: false },
    y: { vezes: 3, de: 7, naUltima: false },
    z: { vezes: 3, de: 7, naUltima: true },
  };
  assert.deepEqual(reincidenciaDoGrupo(['x', 'y', 'z'], porItem), porItem.z);
  assert.deepEqual(reincidenciaDoGrupo(['x'], porItem), porItem.x);
  assert.equal(reincidenciaDoGrupo(['nenhum'], porItem), null);
});

test('o texto do selo diz quantas vezes e em qual trilha', () => {
  assert.equal(
    textoReincidencia({ vezes: 3, de: 7, naUltima: true }, 'diario'),
    'Inadequado em 3 das últimas 7 diárias',
  );
  assert.equal(
    textoReincidencia({ vezes: 1, de: 7, naUltima: true }, 'diario'),
    'Inadequado na última diária',
  );
  assert.equal(
    textoReincidencia({ vezes: 1, de: 5, naUltima: false }, 'diario'),
    'Inadequado em 1 das últimas 5 diárias',
  );
  assert.equal(
    textoReincidencia({ vezes: 1, de: 1, naUltima: true }, 'periodico'),
    'Inadequado na auditoria anterior',
  );
  assert.equal(
    textoReincidencia({ vezes: 1, de: 1, naUltima: true }, 'semestral'),
    'Inadequado na semestral anterior',
  );
});

test('na verificação da rotina, o selo diz que é UM item dela', () => {
  assert.equal(
    textoReincidenciaDoGrupo({ vezes: 3, de: 7, naUltima: true }, 'diario'),
    'Um item desta verificação: inadequado em 3 das últimas 7 diárias',
  );
});

// ---------------------------------------------------------------
// O SQL: quais inspeções contam como anteriores
// ---------------------------------------------------------------

const SQL = constante('SELECT_INADEQUADOS_ANTERIORES');

function cenario() {
  const db = bancoVazio();
  migrar(db);
  db.runSync("INSERT INTO perfil VALUES ('restaurante','R','d',30,1)");
  db.runSync("INSERT INTO categoria VALUES ('preparo','Preparação','4.8',0,1)");
  for (const [id, ordem] of [['a', 1], ['b', 2]]) {
    db.runSync(
      `INSERT INTO item (id, categoria_id, codigo_rdc, texto, topicos, frequencia, critico, peso, ordem)
       VALUES (?, 'preparo', '4.8.1', 'texto', '["resumo"]', 'diario', 0, 1, ?)`,
      id,
      ordem,
    );
  }
  for (const nome of ['T', 'Outro']) {
    db.runSync(
      `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
       VALUES (?, 'restaurante', '2026-09-01', 30)`,
      nome,
    );
  }
  return db;
}

function inspecao(
  db,
  { dia, respostas = { b: 'adequado' }, trilha = 'diario', est = 1, status = 'concluida', corrigido = false, hora = '09:00' },
) {
  const { lastInsertRowId: id } = db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status, dia_local)
     VALUES (?, ?, ?, ?, ?)`,
    est,
    trilha,
    `${dia}T${hora}:00.000Z`,
    status,
    dia,
  );
  for (const [item, resposta] of Object.entries(respostas)) {
    db.runSync(
      `INSERT INTO resposta (inspecao_id, item_id, resposta, respondida_em, corrigido_na_hora)
       VALUES (?, ?, ?, 'x', ?)`,
      id,
      item,
      resposta,
      corrigido ? 1 : 0,
    );
  }
  return id;
}

/** Executa o SQL real e devolve, por inspeção, os itens inadequados. */
function anteriores(db, atualId, janela = 7) {
  const atual = db.getFirstSync('SELECT * FROM inspecao WHERE id = ?', atualId);
  const linhas = db.getAllSync(
    SQL,
    atual.estabelecimento_id,
    atual.trilha,
    atual.id,
    atual.dia_local,
    atual.dia_local,
    atual.data_inicio,
    atual.data_inicio,
    atual.id,
    janela,
  );
  const porInspecao = new Map();
  for (const l of linhas) {
    const itens = porInspecao.get(l.inspecao_id) ?? [];
    if (l.item_id) itens.push(l.item_id);
    porInspecao.set(l.inspecao_id, itens);
  }
  return [...porInspecao.values()];
}

test('SQL: só as inspeções ANTERIORES contam, da mais recente para a mais antiga', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-20', respostas: { a: 'inadequado' } });
  inspecao(db, { dia: '2026-10-21', respostas: { a: 'adequado', b: 'inadequado' } });
  const atual = inspecao(db, { dia: '2026-10-22', respostas: { a: 'inadequado' } });
  inspecao(db, { dia: '2026-10-23', respostas: { a: 'inadequado' } }); // futura: não conta

  const lista = anteriores(db, atual);
  assert.deepEqual(lista, [['b'], ['a']]);
  assert.deepEqual(reincidencias(lista, 7).a, { vezes: 1, de: 2, naUltima: false });
});

test('SQL: a inspeção sem nenhum inadequado entra no "de"', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-20', respostas: { a: 'inadequado' } });
  inspecao(db, { dia: '2026-10-21', respostas: { a: 'adequado' } });
  const atual = inspecao(db, { dia: '2026-10-22' });

  assert.deepEqual(reincidencias(anteriores(db, atual), 7).a, { vezes: 1, de: 2, naUltima: false });
});

test('SQL: outra trilha e outro estabelecimento não contam', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-20', respostas: { a: 'inadequado' }, trilha: 'periodico' });
  inspecao(db, { dia: '2026-10-21', respostas: { a: 'inadequado' }, est: 2 });
  const atual = inspecao(db, { dia: '2026-10-22' });

  assert.deepEqual(anteriores(db, atual), []);
});

test('SQL: a janela limita quantas anteriores são lidas', () => {
  const db = cenario();
  for (let d = 10; d <= 19; d += 1) {
    inspecao(db, { dia: `2026-10-${d}`, respostas: { a: 'inadequado' } });
  }
  const atual = inspecao(db, { dia: '2026-10-20' });

  const lista = anteriores(db, atual, 7);
  assert.equal(lista.length, 7);
  assert.deepEqual(reincidencias(lista, 7).a, { vezes: 7, de: 7, naUltima: true });
});

test('SQL: "corrigido na hora" conta como inadequado', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-21', respostas: { a: 'inadequado' }, corrigido: true });
  const atual = inspecao(db, { dia: '2026-10-22' });

  assert.equal(reincidencias(anteriores(db, atual), 7).a.naUltima, true);
});

test('SQL: a diária largada aberta num dia passado também conta', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-21', respostas: { a: 'inadequado' }, status: 'em_andamento' });
  const atual = inspecao(db, { dia: '2026-10-22' });

  assert.equal(reincidencias(anteriores(db, atual), 7).a.vezes, 1);
});

test('SQL: no mesmo dia, vale a hora de início, e não o id (duas auditorias no mesmo dia)', () => {
  const db = cenario();
  // A da tarde foi gravada PRIMEIRO (id menor), como acontece depois de
  // uma restauração do backup, que não preserva a ordem dos ids.
  const tarde = inspecao(db, { dia: '2026-10-22', trilha: 'periodico', hora: '15:00' });
  const manha = inspecao(db, {
    dia: '2026-10-22', respostas: { a: 'inadequado' }, trilha: 'periodico', hora: '08:00',
  });

  assert.deepEqual(anteriores(db, tarde, 1), [['a']]);
  assert.deepEqual(anteriores(db, manha, 1), []);
});

test('SQL: a diária largada VAZIA não conta, nem toma o lugar da última', () => {
  const db = cenario();
  inspecao(db, { dia: '2026-10-20', respostas: { a: 'inadequado' } });
  inspecao(db, { dia: '2026-10-21', respostas: {}, status: 'em_andamento' }); // aberta por engano
  const atual = inspecao(db, { dia: '2026-10-22' });

  assert.deepEqual(reincidencias(anteriores(db, atual), 7).a, { vezes: 1, de: 1, naUltima: true });
});
