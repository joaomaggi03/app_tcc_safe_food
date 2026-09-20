/**
 * tests/schema.test.js
 * ---------------------------------------------------------------
 * As migrações do banco (db/schema.ts).
 *
 * O teste chama a função `migrar()` REAL, a mesma que roda no celular,
 * contra um SQLite de verdade. Não há reimplementação aqui — se a
 * migração quebrar, este arquivo quebra junto.
 *
 * O QUE ESTÁ EM JOGO
 * Migração é a única parte do app que roda no aparelho de alguém que já
 * tem dados. Um erro aqui não dá tela vermelha: ele apaga o cadastro, o
 * histórico de inspeções ou as respostas de quem já usava o app. Por
 * isso os testes percorrem cada caminho de atualização, e não só a
 * instalação nova.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { bancoVazio } = require('./_apoio/banco');
const { schema, seed } = require('./_apoio/modulos');

const { migrar, VERSAO_SCHEMA } = schema();
const { semear, precisaSemear, VERSAO_SEED } = seed();

function versao(db) {
  return db.getFirstSync('PRAGMA user_version').user_version;
}

function tabelas(db) {
  return db
    .getAllSync("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .map((linha) => linha.name);
}

function colunas(db, tabela) {
  return db.getAllSync(`PRAGMA table_info(${tabela})`).map((c) => c.name);
}

test('instalação nova cria o schema inteiro', () => {
  const db = bancoVazio();
  migrar(db);

  assert.equal(versao(db), VERSAO_SCHEMA, 'a versão fica gravada no PRAGMA');

  for (const esperada of [
    'perfil',
    'categoria',
    'item',
    'item_aplicabilidade',
    'estabelecimento',
    'inspecao',
    'resposta',
    'item_oculto',
    'meta',
  ]) {
    assert.ok(tabelas(db).includes(esperada), `faltou a tabela ${esperada}`);
  }

  assert.ok(colunas(db, 'item').includes('momento'), 'item.momento (v4)');
  assert.ok(colunas(db, 'item').includes('topicos'), 'item.topicos (v5)');
  assert.ok(colunas(db, 'inspecao').includes('dia_local'), 'inspecao.dia_local (v4)');
  assert.ok(colunas(db, 'estabelecimento').includes('cidade'), 'estabelecimento.cidade (v2)');
});

test('migrar é idempotente: rodar de novo não muda nada', () => {
  const db = bancoVazio();
  migrar(db);
  const antes = tabelas(db);

  migrar(db);
  migrar(db);

  assert.deepEqual(tabelas(db), antes);
  assert.equal(versao(db), VERSAO_SCHEMA);
});

/**
 * O caso que mais importa: alguém com o app instalado numa versão
 * antiga. Simulamos parando a migração numa versão intermediária,
 * gravando dados do usuário, e então migrando até o fim.
 */
test('atualizar de qualquer versão anterior preserva os dados do usuário', () => {
  for (let de = 1; de < VERSAO_SCHEMA; de++) {
    const db = bancoVazio();

    // Sobe só até a versão `de`, como estaria o aparelho antigo.
    db.execSync(`PRAGMA user_version = 0`);
    migrarAte(db, de);
    assert.equal(versao(db), de, `preparação para a v${de}`);

    // Dados que o usuário criaria nessa versão.
    db.runSync("INSERT INTO perfil VALUES ('restaurante','Restaurante','d',30,1)");
    db.runSync(
      `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
       VALUES ('Cantina da Ana','restaurante','2026-08-01',30)`,
    );

    if (de >= 3) {
      db.runSync(
        `INSERT INTO categoria VALUES ('preparo','Preparação','4.8',0,1)`,
      );
      db.runSync(
        `INSERT INTO item (id, categoria_id, codigo_rdc, texto, frequencia, critico, peso, ordem)
         VALUES ('i1','preparo','4.8.8','texto','diario',1,2,1)`,
      );
      db.runSync(
        `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status)
         VALUES (1,'diario','2026-08-02T10:00:00.000Z','concluida')`,
      );
      db.runSync("INSERT INTO resposta VALUES (1,'i1','adequado','2026-08-02T10:01:00.000Z')");
      db.runSync("INSERT INTO item_oculto VALUES (1,'i1','2026-08-02T10:02:00.000Z')");
    }

    migrar(db);

    assert.equal(versao(db), VERSAO_SCHEMA, `v${de} chegou à versão final`);
    assert.equal(
      db.getFirstSync('SELECT nome FROM estabelecimento').nome,
      'Cantina da Ana',
      `v${de}: o estabelecimento sobreviveu`,
    );

    if (de >= 3) {
      assert.equal(
        db.getFirstSync('SELECT status FROM inspecao').status,
        'concluida',
        `v${de}: a inspeção sobreviveu`,
      );
      assert.equal(
        db.getFirstSync('SELECT resposta FROM resposta').resposta,
        'adequado',
        `v${de}: a resposta sobreviveu`,
      );
      assert.equal(
        db.getFirstSync('SELECT COUNT(*) AS n FROM item_oculto').n,
        1,
        `v${de}: o item oculto (RF09) sobreviveu`,
      );
    }
  }
});

/**
 * Sobe o schema até uma versão intermediária, executando os mesmos
 * blocos que `migrar()` executaria. Precisa existir porque `migrar()`
 * sempre vai até o fim — não há como pedir "pare na v3".
 */
function migrarAte(db, alvo) {
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'db', 'schema.ts'),
    'utf8',
  );

  for (let v = 1; v <= alvo; v++) {
    const bloco = new RegExp('const SCHEMA_V' + v + ' = `([\\s\\S]*?)`;').exec(fonte);
    assert.ok(bloco, `bloco SCHEMA_V${v} não encontrado em db/schema.ts`);
    db.execSync(bloco[1]);
  }
  db.execSync(`PRAGMA user_version = ${alvo}`);
}

test('as travas CHECK barram valores inválidos', () => {
  const db = bancoVazio();
  migrar(db);
  db.runSync("INSERT INTO perfil VALUES ('restaurante','R','d',30,1)");
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('T','restaurante','2026-09-01',30)`,
  );
  db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio) VALUES (1,'diario','x')`,
  );

  assert.throws(
    () =>
      db.runSync(
        `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio) VALUES (1,'anual','x')`,
      ),
    /CHECK/,
    'trilha inexistente deve ser rejeitada',
  );

  assert.throws(
    () => db.runSync("INSERT INTO resposta VALUES (1,'i1','talvez','x')"),
    /CHECK|FOREIGN/,
    'resposta fora das quatro do RF06 deve ser rejeitada',
  );
});

// ---------------------------------------------------------------
// SEED
// ---------------------------------------------------------------

test('o seed carrega a norma inteira e é idempotente', () => {
  const db = bancoVazio();
  migrar(db);

  assert.equal(precisaSemear(db), true, 'banco novo precisa de seed');
  semear(db);
  assert.equal(precisaSemear(db), false, 'depois de semear, não precisa mais');

  const contar = (t) => db.getFirstSync(`SELECT COUNT(*) AS n FROM ${t}`).n;
  const itens = contar('item');

  assert.equal(contar('perfil'), 6);
  assert.equal(contar('categoria'), 12);
  assert.ok(itens > 80, 'o catálogo tem os itens da RDC');
  assert.ok(contar('item_aplicabilidade') > itens, 'cada item vale para vários perfis');

  // Rodar de novo não duplica nem perde nada.
  semear(db);
  assert.equal(contar('item'), itens);
  assert.equal(
    db.getFirstSync("SELECT valor FROM meta WHERE chave='versao_seed'").valor,
    String(VERSAO_SEED),
  );
});

/**
 * O seed é reexecutado sempre que a `VERSAO_SEED` sobe. Ele não pode
 * levar junto o trabalho do usuário — essa é a diferença entre tabelas
 * de catálogo e tabelas de dados.
 */
test('recarregar a norma não apaga os dados do usuário', () => {
  const db = bancoVazio();
  migrar(db);
  semear(db);

  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('Padaria do Zé','padaria','2026-08-01',30)`,
  );
  db.runSync(
    `INSERT INTO inspecao (estabelecimento_id, trilha, data_inicio, status)
     VALUES (1,'diario','2026-08-02T10:00:00.000Z','concluida')`,
  );

  semear(db);

  assert.equal(db.getFirstSync('SELECT nome FROM estabelecimento').nome, 'Padaria do Zé');
  assert.equal(db.getFirstSync('SELECT COUNT(*) AS n FROM inspecao').n, 1);
});

test('o seed grava os tópicos como JSON legível de volta', () => {
  const db = bancoVazio();
  migrar(db);
  semear(db);

  const linhas = db.getAllSync('SELECT id, topicos FROM item');
  for (const linha of linhas) {
    assert.ok(linha.topicos, `${linha.id} foi gravado sem tópicos`);
    const lista = JSON.parse(linha.topicos);
    assert.ok(Array.isArray(lista) && lista.length > 0, `${linha.id}: tópicos vazios no banco`);
  }
});

/**
 * INCIDENTE REAL (v6): o aparelho respondeu "no such column:
 * dias_funcionamento" ao salvar o cadastro.
 *
 * A causa não era a migração — era o Metro. `db/index.ts` guarda a
 * conexão numa variável de módulo e só chama `migrar()` ao abrir o
 * banco; o Fast Refresh recarregou `db/consultas.ts` (que já escrevia na
 * coluna nova) sem reavaliar `db/index.ts`, então o app ficou com SQL
 * novo sobre uma conexão migrada antes da v6 existir. Um reload completo
 * resolveu.
 *
 * O teste fica porque a dúvida foi legítima: ele prova que a coluna
 * NASCE na atualização a partir da versão anterior, e não só na
 * instalação nova — que é a parte que ninguém consegue conferir de
 * cabeça quando o app dá erro na mão do usuário.
 */
test('a atualização da v5 cria dias_funcionamento, e a linha antiga fica NULL', () => {
  const db = bancoVazio();

  db.execSync('PRAGMA user_version = 0');
  migrarAte(db, 5);

  db.runSync("INSERT INTO perfil VALUES ('feirante','Feirante','d',30,1)");
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('Banca do Zé','feirante','2026-08-01',30)`,
  );
  assert.ok(!colunas(db, 'estabelecimento').includes('dias_funcionamento'), 'preparação: v5');

  migrar(db);

  assert.ok(
    colunas(db, 'estabelecimento').includes('dias_funcionamento'),
    'a coluna do schema v6 tem que existir depois de migrar',
  );

  const linha = db.getFirstSync('SELECT nome, dias_funcionamento FROM estabelecimento');
  assert.equal(linha.nome, 'Banca do Zé');
  assert.equal(
    linha.dias_funcionamento,
    null,
    'NULL na linha antiga — lido como "abre todo dia", igual ao comportamento anterior',
  );
});

/**
 * O ESTADO TORTO que deu origem à v7 — reproduzido.
 *
 * O aparelho ficou com `user_version = 6` e sem a coluna
 * `dias_funcionamento`, porque a VERSAO_SCHEMA subiu para 6 numa
 * gravação do arquivo e o bloco da v6 só entrou na seguinte; o Metro
 * recarregou no meio e o `migrar()` daquele instante não tinha o que
 * executar, mas ainda assim carimbou a versão.
 *
 * A partir daí o `if (versaoAtual >= VERSAO_SCHEMA) return` fechava a
 * porta: nenhum reload consertava, porque o problema estava gravado no
 * banco. Este teste prova que a v7 reabre a porta — e o seguinte, que
 * ela não estraga quem migrou direito.
 */
test('a v7 repara o aparelho que ficou na v6 sem a coluna', () => {
  const db = bancoVazio();

  db.execSync('PRAGMA user_version = 0');
  migrarAte(db, 5);
  db.runSync("INSERT INTO perfil VALUES ('feirante','Feirante','d',30,1)");
  db.runSync(
    `INSERT INTO estabelecimento (nome, perfil_id, data_cadastro, periodicidade_auditoria_dias)
     VALUES ('Banca do Zé','feirante','2026-08-01',30)`,
  );

  // O carimbo sem a coluna: exatamente o que o app fez no celular.
  db.execSync('PRAGMA user_version = 6');
  assert.ok(!colunas(db, 'estabelecimento').includes('dias_funcionamento'), 'preparação');

  migrar(db);

  assert.ok(
    colunas(db, 'estabelecimento').includes('dias_funcionamento'),
    'a v7 tem que criar a coluna que ficou faltando',
  );
  assert.equal(versao(db), VERSAO_SCHEMA);
  assert.equal(
    db.getFirstSync('SELECT nome FROM estabelecimento').nome,
    'Banca do Zé',
    'e sem levar junto os dados de quem estava testando',
  );
});

test('a v7 não faz nada em quem já tem a coluna', () => {
  // O outro aparelho: migrou certo até a v6. O ALTER repetido daria
  // "duplicate column name" e quebraria a abertura do app, por isso o
  // bloco pergunta antes.
  const db = bancoVazio();

  db.execSync('PRAGMA user_version = 0');
  migrarAte(db, 6);
  assert.ok(colunas(db, 'estabelecimento').includes('dias_funcionamento'), 'preparação');

  assert.doesNotThrow(() => migrar(db), 'a v7 não pode tentar criar a coluna de novo');
  assert.equal(versao(db), VERSAO_SCHEMA);
});
