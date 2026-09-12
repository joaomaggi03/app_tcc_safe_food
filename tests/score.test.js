/**
 * tests/score.test.js
 * ---------------------------------------------------------------
 * O score de conformidade (RF04).
 *
 * A fórmula é extraída do `db/consultas.ts` e executada contra um SQLite
 * de verdade — inclusive o valor de `PESO_CRITICO`. Mudar a régua no
 * código muda o que este teste calcula, o que é o comportamento certo:
 * o teste confere a MECÂNICA (o que entra e o que fica de fora), não
 * decora os números.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema } = require('./_apoio/modulos');
const { SELECT_PESOS, PESO_CRITICO } = require('./_apoio/consultas');

const { migrar } = schema();

/** Um banco com itens controlados, para as contas serem previsíveis. */
function cenario(respostas) {
  const db = bancoVazio();
  migrar(db);

  db.runSync("INSERT INTO perfil VALUES ('restaurante','R','d',30,1)");
  db.runSync("INSERT INTO categoria VALUES ('preparo','Preparação','4.8',0,1)");
  db.runSync("INSERT INTO categoria VALUES ('mani','Manipuladores','4.6',0,2)");

  const itens = [
    ['c1', 'preparo', '4.8.8', 1, 2],
    ['n1', 'preparo', '4.8.6', 0, 1],
    ['n2', 'mani', '4.6.3', 0, 1],
    ['c2', 'mani', '4.6.4', 1, 2],
  ];
  for (const [id, cat, codigo, critico, peso] of itens) {
    db.runSync(
      `INSERT INTO item (id, categoria_id, codigo_rdc, texto, topicos, frequencia,
                         critico, peso, ordem)
       VALUES (?, ?, ?, 'texto', '[]', 'diario', ?, ?, 1)`,
      id,
      cat,
      codigo,
      critico,
      peso,
    );
  }

  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T','restaurante','2026-09-01',30)`,
  );
  db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, modo, data_inicio, status)
     VALUES (1,'diario','completa','2026-09-07T10:00:00.000Z','em_andamento')`,
  );

  for (const [item, resposta] of Object.entries(respostas)) {
    db.runSync('INSERT INTO resposta VALUES (1, ?, ?, ?)', item, resposta, 'x');
  }

  return db;
}

function somas(db) {
  return db.getFirstSync(
    `SELECT ${SELECT_PESOS}
       FROM resposta r JOIN item it ON it.id = r.item_id
      WHERE r.inspecao_id = 1`,
  );
}

const score = (s) =>
  s.peso_avaliado > 0 ? Math.round((100 * s.peso_adequado) / s.peso_avaliado) : null;

test('tudo adequado dá 100%', () => {
  const s = somas(cenario({ c1: 'adequado', n1: 'adequado', n2: 'adequado', c2: 'adequado' }));
  assert.equal(score(s), 100);
  assert.equal(s.avaliados, 4);
  assert.equal(s.criticos_adequados, 2);
});

test('tudo inadequado dá 0%, e não null', () => {
  const s = somas(cenario({ c1: 'inadequado', n1: 'inadequado' }));
  assert.equal(score(s), 0, '0% é nota; null é ausência de avaliação');
});

/**
 * A diferença entre "não conforme" e "não verificado". Tratar item não
 * observado como reprovado puniria a honestidade; como aprovado,
 * premiaria quem não olha.
 */
test('"não observado" e "não se aplica" ficam fora da conta', () => {
  const s = somas({ ...cenario({ n1: 'adequado', n2: 'nao_observado', c2: 'nao_se_aplica' }) });

  assert.equal(s.avaliados, 1, 'só o adequado entrou');
  assert.equal(s.nao_observados, 1);
  assert.equal(s.nao_se_aplica, 1);
  assert.equal(score(s), 100, 'o que não foi avaliado não derruba a nota');
  assert.equal(s.criticos_avaliados, 0, 'o crítico marcado como não se aplica saiu');
});

test('inspeção sem nada avaliado devolve null, não zero', () => {
  const s = somas(cenario({ c1: 'nao_observado', n1: 'nao_observado' }));
  assert.equal(s.peso_avaliado, 0);
  assert.equal(score(s), null, '"sem itens avaliados" é diferente de "nota zero"');
});

/**
 * O peso do crítico é a única régua de severidade do app. Este teste
 * amarra a mecânica: um crítico reprovado tem que custar mais caro que
 * um item comum reprovado, qualquer que seja o valor da constante.
 */
test('item crítico pesa mais que item comum na queda da nota', () => {
  const comumFalhou = somas(cenario({ c1: 'adequado', c2: 'adequado', n1: 'inadequado' }));
  const criticoFalhou = somas(cenario({ c1: 'adequado', n1: 'adequado', c2: 'inadequado' }));

  assert.ok(
    score(criticoFalhou) < score(comumFalhou),
    `crítico reprovado (${score(criticoFalhou)}%) tem que doer mais que comum (${score(comumFalhou)}%)`,
  );

  // E o quanto: o peso efetivo do crítico é PESO_CRITICO, não o peso do seed.
  const so = somas(cenario({ c1: 'adequado', n1: 'inadequado' }));
  assert.equal(so.peso_avaliado, PESO_CRITICO + 1);
  assert.equal(so.peso_adequado, PESO_CRITICO);
});

test('o score por categoria separa onde a nota caiu', () => {
  const db = cenario({ c1: 'adequado', n1: 'inadequado', n2: 'adequado', c2: 'inadequado' });

  const linhas = db.getAllSync(
    `SELECT c.id AS categoria, ${SELECT_PESOS}
       FROM resposta r
       JOIN item it     ON it.id = r.item_id
       JOIN categoria c ON c.id  = it.categoria_id
      WHERE r.inspecao_id = 1
      GROUP BY c.id
      ORDER BY c.ordem`,
  );

  const porCategoria = Object.fromEntries(linhas.map((l) => [l.categoria, score(l)]));

  // preparo: crítico ok (peso PESO_CRITICO) + comum falhou (peso 1)
  assert.equal(porCategoria.preparo, Math.round((100 * PESO_CRITICO) / (PESO_CRITICO + 1)));
  // manipuladores: comum ok (1) + crítico falhou (PESO_CRITICO)
  assert.equal(porCategoria.mani, Math.round(100 / (1 + PESO_CRITICO)));
  assert.ok(porCategoria.mani < porCategoria.preparo, 'a categoria com crítico falho é pior');
});

/**
 * O score parte da tabela `resposta`, e não do checklist atual. É o que
 * o torna reprodutível: ocultar um item amanhã (RF09) não pode mudar a
 * nota de uma inspeção de ontem.
 */
test('ocultar um item depois não altera o score já registrado', () => {
  const db = cenario({ c1: 'adequado', n1: 'inadequado' });
  const antes = score(somas(db));

  db.runSync("INSERT INTO item_oculto VALUES (1,'n1','2026-09-08T10:00:00.000Z')");

  assert.equal(score(somas(db)), antes, 'o score de arquivo é imutável');
});
