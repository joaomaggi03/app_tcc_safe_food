/**
 * tests/backup.test.js
 * ---------------------------------------------------------------
 * O lado local do backup na nuvem (RF01): os gatilhos do schema v10 e o
 * `db/backup.ts`, contra um SQLite de verdade — sem rede e sem conta.
 *
 * O que está em jogo é silencioso: uma escrita que não carimba o
 * `atualizado_em` é um dado que nunca sobe, e ninguém percebe até o dia
 * em que o celular se perde. Por isso os testes passam pelas escritas
 * que o app REALMENTE faz (upsert de resposta, INSERT OR IGNORE de
 * ação, DELETE de item oculto).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema, backup } = require('./_apoio/modulos');

const { migrar } = schema();
const {
  montarPacote,
  confirmarEnvio,
  lerMarcador,
  restaurar,
  aparelhoVazio,
  donoDoAparelho,
  definirDono,
  tamanhoDoPacote,
  TABELAS_BACKUP,
} = backup();

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const USUARIO = 'usuario-1';

/** Catálogo mínimo + um estabelecimento. */
function cenario() {
  const db = bancoVazio();
  migrar(db);
  db.runSync(
    `INSERT INTO perfil (id, nome, descricao, periodicidade_auditoria_dias, ordem)
     VALUES ('restaurante','R','d',30,1)`,
  );
  db.runSync(
    `INSERT INTO categoria (id, nome, codigo_rdc, pop_obrigatorio, ordem)
     VALUES ('preparo','Preparação','4.8',0,1)`,
  );
  for (const id of ['i1', 'i2']) {
    db.runSync(
      `INSERT INTO item (id, categoria_id, codigo_rdc, texto, frequencia, critico, peso, ordem)
       VALUES (?, 'preparo', '4.8.1', 'texto', 'diario', 0, 1, 1)`,
      id,
    );
  }
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('Cantina','restaurante','2026-09-01',30)`,
  );
  return db;
}

function novaInspecao(db) {
  return db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status, dia_local)
     VALUES (1, 'diario', '2026-09-02T10:00:00.000Z', 'em_andamento', '2026-09-02')`,
  ).lastInsertRowId;
}

/** O mesmo upsert do `salvarResposta` em db/consultas.ts. */
function responder(db, inspecaoId, itemId, resposta) {
  db.runSync(
    `INSERT INTO resposta (inspecao_id, item_id, resposta, respondida_em)
     VALUES (?, ?, ?, '2026-09-02T10:05:00.000Z')
     ON CONFLICT (inspecao_id, item_id)
     DO UPDATE SET resposta = excluded.resposta, respondida_em = excluded.respondida_em`,
    inspecaoId,
    itemId,
    resposta,
  );
}

/** Força um carimbo antigo, para ver o gatilho trocá-lo. */
function envelhecer(db, tabela) {
  db.runSync(`UPDATE ${tabela} SET atualizado_em = '2000-01-01T00:00:00.000Z'`);
}

test('toda linha nova ganha uuid e carimbo, sem o app pedir', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  responder(db, inspecaoId, 'i1', 'adequado');

  const e = db.getFirstSync('SELECT uuid, atualizado_em FROM estabelecimento');
  const i = db.getFirstSync('SELECT uuid, atualizado_em FROM inspecao');
  const r = db.getFirstSync('SELECT atualizado_em FROM resposta');

  assert.match(e.uuid, FORMATO_UUID);
  assert.match(i.uuid, FORMATO_UUID);
  assert.notEqual(e.uuid, i.uuid);
  for (const carimbo of [e.atualizado_em, i.atualizado_em, r.atualizado_em]) {
    assert.match(carimbo, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  }
});

test('mudar a resposta (o upsert do app) renova o carimbo', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  responder(db, inspecaoId, 'i1', 'adequado');
  envelhecer(db, 'resposta');

  responder(db, inspecaoId, 'i1', 'inadequado');

  assert.notEqual(
    db.getFirstSync('SELECT atualizado_em FROM resposta').atualizado_em,
    '2000-01-01T00:00:00.000Z',
  );
});

// As linhas que já existiam antes da v10 são cobertas em tests/schema.test.js,
// no teste que atualiza o banco a partir de cada versão antiga.

test('o primeiro backup leva TUDO, inclusive o feito antes do login', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  responder(db, inspecaoId, 'i1', 'adequado');
  responder(db, inspecaoId, 'i2', 'inadequado');

  const pacote = montarPacote(db, null);

  assert.equal(pacote.linhas.estabelecimento.length, 1);
  assert.equal(pacote.linhas.inspecao.length, 1);
  assert.equal(pacote.linhas.resposta.length, 2);
  assert.equal(tamanhoDoPacote(pacote), 4);
});

test('as linhas sobem ligadas por uuid, não pelo id do aparelho', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  responder(db, inspecaoId, 'i1', 'adequado');

  const { linhas } = montarPacote(db, null);
  const e = linhas.estabelecimento[0];
  const i = linhas.inspecao[0];
  const r = linhas.resposta[0];

  assert.equal(i.estabelecimento_uuid, e.uuid);
  assert.equal(r.inspecao_uuid, i.uuid);
  for (const tabela of TABELAS_BACKUP) {
    for (const linha of linhas[tabela]) {
      assert.ok(!('id' in linha), `${tabela} não pode levar o id inteiro`);
      assert.ok(!('estabelecimento_id' in linha), `${tabela} não pode levar estabelecimento_id`);
    }
  }
});

test('depois de confirmado, o próximo backup leva só o que mudou', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  responder(db, inspecaoId, 'i1', 'adequado');

  const primeiro = montarPacote(db, lerMarcador(db, USUARIO));
  confirmarEnvio(db, USUARIO, primeiro);
  assert.equal(lerMarcador(db, USUARIO), primeiro.inicio);

  // Tudo o que já existia fica com carimbo anterior ao marcador.
  for (const t of ['estabelecimento', 'inspecao', 'resposta']) envelhecer(db, t);
  responder(db, inspecaoId, 'i2', 'inadequado');

  const segundo = montarPacote(db, lerMarcador(db, USUARIO));
  assert.equal(tamanhoDoPacote(segundo), 1);
  assert.equal(segundo.linhas.resposta[0].item_id, 'i2');
});

/**
 * UM APARELHO, UMA CONTA. Os uuids deste aparelho, depois do primeiro
 * backup, pertencem na nuvem à conta que o fez; a RLS recusaria qualquer
 * outra. O app guarda quem é o dono para parar o backup com um aviso, em
 * vez de falhar calado a cada tentativa. (Quem RECUSA é
 * db/sincronizacao.ts, que fala com a rede; aqui se testa o registro.)
 */
test('o aparelho nasce sem dono, e o dono gravado é lido de volta', () => {
  const db = cenario();
  assert.equal(donoDoAparelho(db), null);

  definirDono(db, USUARIO, 'ana@exemplo.com');
  assert.deepEqual(donoDoAparelho(db), { id: USUARIO, email: 'ana@exemplo.com' });
});

test('restaurar torna a conta de origem a dona do aparelho', () => {
  const origem = cenario();
  novaInspecao(origem);
  const { linhas } = montarPacote(origem, null);

  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  restaurar(
    destino,
    USUARIO,
    {
      estabelecimento: linhas.estabelecimento[0],
      inspecao: linhas.inspecao,
      resposta: [],
      item_oculto: [],
      acao: [],
    },
    'ana@exemplo.com',
  );

  assert.deepEqual(donoDoAparelho(destino), { id: USUARIO, email: 'ana@exemplo.com' });
});

test('apagar anota a exclusão, e confirmar o envio a esquece', () => {
  const db = cenario();
  const inspecaoId = novaInspecao(db);
  const uuidEstab = db.getFirstSync('SELECT uuid FROM estabelecimento').uuid;

  db.runSync(
    `INSERT INTO item_oculto (estabelecimento_id, item_id, ocultado_em)
     VALUES (1, 'i1', '2026-09-02T10:00:00.000Z')`,
  );
  db.runSync('DELETE FROM item_oculto WHERE estabelecimento_id = 1 AND item_id = ?', 'i1');

  db.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, inspecao_id, descricao, prazo, criada_em)
     VALUES (1, 'i2', ?, 'trocar', '2026-09-09', '2026-09-02T10:00:00.000Z')`,
    inspecaoId,
  );
  const uuidAcao = db.getFirstSync('SELECT uuid FROM acao').uuid;
  db.runSync('DELETE FROM acao');

  const pacote = montarPacote(db, null);
  assert.deepEqual(
    pacote.exclusoes.map((x) => [x.tabela, x.uuid, x.item_id]),
    [
      ['item_oculto', uuidEstab, 'i1'],
      ['acao', uuidAcao, null],
    ],
  );

  confirmarEnvio(db, USUARIO, pacote);
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM sync_exclusao').n, 0);
});

test('exclusão anotada DURANTE o envio fica para o próximo', () => {
  const db = cenario();
  db.runSync(
    `INSERT INTO item_oculto (estabelecimento_id, item_id, ocultado_em)
     VALUES (1, 'i1', 'x'), (1, 'i2', 'x')`,
  );
  db.runSync("DELETE FROM item_oculto WHERE item_id = 'i1'");
  const pacote = montarPacote(db, null);

  db.runSync("DELETE FROM item_oculto WHERE item_id = 'i2'"); // chega no meio
  confirmarEnvio(db, USUARIO, pacote);

  const restantes = db.getAllSync('SELECT item_id FROM sync_exclusao');
  assert.deepEqual(restantes.map((x) => x.item_id), ['i2']);
});

test('restaurar num aparelho vazio refaz o histórico, com os mesmos uuids', () => {
  // Origem: um aparelho com uma inspeção, respostas, item oculto e ação.
  const origem = cenario();
  const inspecaoId = novaInspecao(origem);
  responder(origem, inspecaoId, 'i1', 'adequado');
  responder(origem, inspecaoId, 'i2', 'inadequado');
  origem.runSync(
    `INSERT INTO item_oculto (estabelecimento_id, item_id, ocultado_em)
     VALUES (1, 'i1', '2026-09-02T10:00:00.000Z')`,
  );
  origem.runSync(
    `INSERT INTO acao (estabelecimento_id, item_id, inspecao_id, descricao, prazo, criada_em)
     VALUES (1, 'i2', ?, 'trocar', '2026-09-09', '2026-09-02T10:00:00.000Z')`,
    inspecaoId,
  );
  const { linhas } = montarPacote(origem, null);

  // Destino: aparelho novo, só com o catálogo.
  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  assert.ok(aparelhoVazio(destino));

  restaurar(destino, USUARIO, {
    estabelecimento: linhas.estabelecimento[0],
    inspecao: linhas.inspecao,
    resposta: linhas.resposta,
    item_oculto: linhas.item_oculto,
    acao: linhas.acao,
  });

  const depois = montarPacote(destino, null).linhas;
  for (const tabela of TABELAS_BACKUP) {
    assert.deepEqual(depois[tabela], linhas[tabela], `${tabela} voltou igual`);
  }
  // A ação continua presa à inspeção de onde saiu.
  assert.equal(
    destino.getFirstSync(
      'SELECT COUNT(*) AS n FROM acao a JOIN inspecao i ON i.id = a.inspecao_id',
    ).n,
    1,
  );
});

/**
 * v11: o horário de funcionamento sobe e volta. Sem isso, o celular novo
 * restaurado perderia a régua das janelas em silêncio — e a diária
 * passaria a aceitar tudo a qualquer hora.
 */
test('os horários de funcionamento vão e voltam no backup', () => {
  const origem = cenario();
  origem.runSync(
    "UPDATE estabelecimento SET hora_abertura = '07:00', hora_fechamento = '22:00'",
  );
  const { linhas } = montarPacote(origem, null);
  assert.equal(linhas.estabelecimento[0].hora_abertura, '07:00');

  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  restaurar(destino, USUARIO, {
    estabelecimento: linhas.estabelecimento[0],
    inspecao: [],
    resposta: [],
    item_oculto: [],
    acao: [],
  });

  const e = destino.getFirstSync('SELECT hora_abertura, hora_fechamento FROM estabelecimento');
  assert.deepEqual({ ...e }, { hora_abertura: '07:00', hora_fechamento: '22:00' });
});

/**
 * v12: o que as pendências precisam vai e volta com a inspeção. Sem os
 * itens previstos, a diária restaurada deixaria de ser contada.
 */
test('o horário e os itens previstos da diária vão e voltam no backup', () => {
  const origem = cenario();
  const id = novaInspecao(origem);
  origem.runSync(
    `UPDATE inspecao SET hora_abertura = '07:00', hora_fechamento = '22:00',
                         itens_previstos = '["i1","i2"]' WHERE id = ?`,
    id,
  );
  const { linhas } = montarPacote(origem, null);

  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  restaurar(destino, USUARIO, {
    estabelecimento: linhas.estabelecimento[0],
    inspecao: linhas.inspecao,
    resposta: [],
    item_oculto: [],
    acao: [],
  });

  const i = destino.getFirstSync(
    'SELECT hora_abertura, hora_fechamento, itens_previstos FROM inspecao',
  );
  assert.deepEqual(
    { ...i },
    { hora_abertura: '07:00', hora_fechamento: '22:00', itens_previstos: '["i1","i2"]' },
  );
});

test('um backup anterior à v11, sem os horários, restaura sem horário', () => {
  const origem = cenario();
  const { linhas } = montarPacote(origem, null);
  const { hora_abertura, hora_fechamento, ...antigo } = linhas.estabelecimento[0];

  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  restaurar(destino, USUARIO, {
    estabelecimento: antigo,
    inspecao: [],
    resposta: [],
    item_oculto: [],
    acao: [],
  });

  const e = destino.getFirstSync('SELECT hora_abertura, hora_fechamento FROM estabelecimento');
  assert.equal(e.hora_abertura, null);
  assert.equal(e.hora_fechamento, null);
});

test('depois de restaurar, o próximo backup não devolve tudo à nuvem', () => {
  const origem = cenario();
  novaInspecao(origem);
  const { linhas } = montarPacote(origem, null);

  const destino = cenario();
  destino.runSync('DELETE FROM estabelecimento');
  restaurar(destino, USUARIO, {
    estabelecimento: linhas.estabelecimento[0],
    inspecao: linhas.inspecao,
    resposta: [],
    item_oculto: [],
    acao: [],
  });

  // Os carimbos restaurados são os da nuvem, anteriores ao marcador.
  assert.equal(tamanhoDoPacote(montarPacote(destino, lerMarcador(destino, USUARIO))), 0);
});

test('restaurar por cima de dados existentes é recusado', () => {
  const db = cenario();
  const { linhas } = montarPacote(db, null);
  assert.throws(() =>
    restaurar(db, USUARIO, {
      estabelecimento: linhas.estabelecimento[0],
      inspecao: [],
      resposta: [],
      item_oculto: [],
      acao: [],
    }),
  );
});
