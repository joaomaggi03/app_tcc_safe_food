/**
 * tests/checklist.test.js
 * ---------------------------------------------------------------
 * O checklist filtrado (RF03), o "não se aplica" (RF09) e a gravação
 * das respostas (RF06).
 *
 * Roda sobre o catálogo REAL — o seed completo da RDC 216 —, e não sobre
 * itens inventados. É o que permite afirmar coisas como "um food truck
 * enxerga menos itens que um restaurante" com o número que o app vai
 * mostrar de fato.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema, seed, rdc216 } = require('./_apoio/modulos');
const { sqlQueContem } = require('./_apoio/consultas');

const { migrar } = schema();
const { semear } = seed();
const { PERFIS } = rdc216();

function bancoSemeado() {
  const db = bancoVazio();
  migrar(db);
  semear(db);
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T','restaurante','2026-09-01',30)`,
  );
  return db;
}

/** A mesma ordenação por momento que o `checklistDoPerfil` usa. */
const ORDEM_MOMENTO = `CASE i.momento
         WHEN 'abertura'   THEN 0
         WHEN 'servico'    THEN 1
         WHEN 'fechamento' THEN 2
         ELSE 3
       END, c.ordem, i.ordem`;

function checklist(db, { perfil, trilha, estabelecimento, somenteCriticos, porMomento } = {}) {
  const condicoes = ['a.perfil_id = ?'];
  const parametros = [perfil];

  if (trilha) {
    condicoes.push('i.frequencia = ?');
    parametros.push(trilha);
  }
  if (estabelecimento !== undefined) {
    condicoes.push('i.id NOT IN (SELECT item_id FROM item_oculto WHERE estabelecimento_id = ?)');
    parametros.push(estabelecimento);
  }
  if (somenteCriticos) condicoes.push('i.critico = 1');

  return db.getAllSync(
    `SELECT i.id, i.momento, i.frequencia, i.topicos, c.ordem AS ordem_categoria
       FROM item i
       JOIN item_aplicabilidade a ON a.item_id = i.id
       JOIN categoria c           ON c.id      = i.categoria_id
      WHERE ${condicoes.join(' AND ')}
      ORDER BY ${porMomento ? ORDEM_MOMENTO : 'c.ordem, i.ordem'}`,
    ...parametros,
  );
}

test('o filtro por perfil (RF03) entrega listas diferentes por tipo de negócio', () => {
  const db = bancoSemeado();

  const tamanhos = Object.fromEntries(
    PERFIS.map((p) => [p.id, checklist(db, { perfil: p.id }).length]),
  );

  for (const [perfil, total] of Object.entries(tamanhos)) {
    assert.ok(total > 0, `${perfil} ficou sem nenhum item`);
  }

  assert.ok(
    tamanhos.restaurante > tamanhos.ambulante,
    'um restaurante tem mais exigências que um ambulante — é o ponto do filtro inteligente',
  );
  assert.ok(tamanhos.restaurante > tamanhos.food_truck);
});

test('a trilha recorta o checklist, e as três somam o total do perfil', () => {
  const db = bancoSemeado();

  const total = checklist(db, { perfil: 'restaurante' }).length;
  const soma = ['diario', 'periodico', 'semestral'].reduce(
    (acc, trilha) => acc + checklist(db, { perfil: 'restaurante', trilha }).length,
    0,
  );

  assert.equal(soma, total, 'todo item pertence a exatamente uma trilha');
});

test('a diária sai na ordem do expediente, não na da norma', () => {
  const db = bancoSemeado();
  const linhas = checklist(db, { perfil: 'restaurante', trilha: 'diario', porMomento: true });

  const posicao = { abertura: 0, servico: 1, fechamento: 2 };
  let anterior = -1;

  for (const linha of linhas) {
    const atual = posicao[linha.momento];
    assert.ok(atual >= anterior, `${linha.id} quebrou a ordem dos momentos`);
    anterior = atual;
  }

  assert.deepEqual(
    [...new Set(linhas.map((l) => l.momento))],
    ['abertura', 'servico', 'fechamento'],
    'os três momentos aparecem, nesta ordem',
  );
});

test('o modo essencial mostra só os críticos, e é subconjunto do completo', () => {
  const db = bancoSemeado();

  const completo = checklist(db, { perfil: 'restaurante', trilha: 'diario' }).map((l) => l.id);
  const criticos = checklist(db, {
    perfil: 'restaurante',
    trilha: 'diario',
    somenteCriticos: true,
  }).map((l) => l.id);

  assert.ok(criticos.length > 0 && criticos.length < completo.length);
  for (const id of criticos) {
    assert.ok(completo.includes(id), `${id} não está no checklist completo`);
  }
});

/**
 * RF09. O item some das PRÓXIMAS inspeções e o efeito é reversível —
 * apagar a linha o traz de volta, sem tocar no histórico.
 */
test('"não se aplica" esconde o item, e reexibir o traz de volta', () => {
  const db = bancoSemeado();

  const antes = checklist(db, { perfil: 'restaurante', estabelecimento: 1 }).length;
  const alvo = checklist(db, { perfil: 'restaurante', estabelecimento: 1 })[0].id;

  db.runSync('INSERT OR IGNORE INTO item_oculto VALUES (1, ?, ?)', alvo, 'x');
  const depois = checklist(db, { perfil: 'restaurante', estabelecimento: 1 });

  assert.equal(depois.length, antes - 1);
  assert.ok(!depois.some((l) => l.id === alvo), 'o item ocultado sumiu');

  // Marcar de novo não duplica.
  db.runSync('INSERT OR IGNORE INTO item_oculto VALUES (1, ?, ?)', alvo, 'y');
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM item_oculto').n, 1);

  db.runSync('DELETE FROM item_oculto WHERE estabelecimento_id = 1 AND item_id = ?', alvo);
  assert.equal(checklist(db, { perfil: 'restaurante', estabelecimento: 1 }).length, antes);
});

test('ocultar para um estabelecimento não afeta outro', () => {
  const db = bancoSemeado();
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('Outro','restaurante','2026-09-01',30)`,
  );

  const alvo = checklist(db, { perfil: 'restaurante' })[0].id;
  db.runSync('INSERT INTO item_oculto VALUES (1, ?, ?)', alvo, 'x');

  const doPrimeiro = checklist(db, { perfil: 'restaurante', estabelecimento: 1 }).length;
  const doSegundo = checklist(db, { perfil: 'restaurante', estabelecimento: 2 }).length;

  assert.equal(doSegundo, doPrimeiro + 1, 'a decisão é por estabelecimento, não por perfil');
});

test('o checklist carrega os tópicos junto, prontos para a tela', () => {
  const db = bancoSemeado();

  for (const linha of checklist(db, { perfil: 'restaurante' })) {
    const topicos = JSON.parse(linha.topicos);
    assert.ok(Array.isArray(topicos) && topicos.length > 0, `${linha.id} sem resumo`);
  }
});

// ---------------------------------------------------------------
// RESPOSTAS (RF06)
// ---------------------------------------------------------------

test('responder duas vezes o mesmo item atualiza, não duplica', () => {
  const db = bancoSemeado();
  db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, modo, data_inicio, status)
     VALUES (1,'diario','rotina','2026-09-07T10:00:00.000Z','em_andamento')`,
  );

  const item = checklist(db, { perfil: 'restaurante', trilha: 'diario' })[0].id;
  const upsert = sqlQueContem('ON CONFLICT (inspecao_id, item_id)');

  for (const resposta of ['adequado', 'inadequado', 'nao_observado']) {
    db.runSync(upsert, 1, item, resposta, 'x');
  }

  const linhas = db.getAllSync('SELECT resposta FROM resposta WHERE inspecao_id = 1');
  assert.equal(linhas.length, 1, 'a chave composta impede duplicata');
  assert.equal(linhas[0].resposta, 'nao_observado', 'vale a última resposta');
});
