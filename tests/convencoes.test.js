/**
 * tests/convencoes.test.js
 * ---------------------------------------------------------------
 * As convenções do projeto, verificadas no código-fonte.
 *
 * Estes testes não exercitam comportamento: eles proíbem PADRÕES que já
 * causaram bug aqui ou que o CLAUDE.md define como regra. É a diferença
 * entre testar o que se sabe que quebra e impedir que a mesma classe de
 * erro volte por outro caminho.
 *
 * Cada um nasceu de um problema real, e o comentário diz qual.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { lerFonte, arquivosDoApp } = require('./_apoio/modulos');

const ARQUIVOS = arquivosDoApp();

function procurar(padrao, filtro = () => true) {
  const achados = [];

  for (const arquivo of ARQUIVOS) {
    if (!filtro(arquivo)) continue;

    lerFonte(arquivo)
      .split('\n')
      .forEach((linha, i) => {
        // Comentários explicam a regra; só o código a viola.
        const semComentario = linha.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
        if (padrao.test(semComentario)) achados.push(`${arquivo}:${i + 1}  ${linha.trim()}`);
      });
  }

  return achados;
}

test('os arquivos do app foram encontrados', () => {
  assert.ok(ARQUIVOS.length > 10, 'a varredura não achou os fontes — o teste seria vazio');
  assert.ok(ARQUIVOS.includes('db/consultas.ts'));
  assert.ok(ARQUIVOS.includes('app/inspecao.tsx'));
});

/**
 * BUG REAL: `hojeISO()` montava a data com `toISOString()`, que devolve
 * UTC. Quem cadastrava depois das 21h no Brasil recebia a data de
 * amanhã, e o primeiro vencimento das três trilhas saía deslocado.
 *
 * Data do banco é sempre DIA LOCAL, via `diaLocalISO()`. Bug de fuso não
 * se pega testando data — se pega proibindo o padrão.
 */
test('nenhuma data é derivada de toISOString, que é UTC', () => {
  const achados = procurar(/toISOString\(\)\s*\.\s*slice/);
  assert.deepEqual(achados, [], `use diaLocalISO() de db/datas.ts:\n${achados.join('\n')}`);
});

/**
 * Regra do CLAUDE.md: a paleta mora em theme/cores.ts, e nenhuma tela
 * escreve hexadecimal direto. Já foi violada uma vez, por um
 * `shadowColor: '#000'`.
 */
test('nenhuma cor hexadecimal fora do theme', () => {
  const achados = procurar(/['"]#[0-9a-fA-F]{3,8}['"]/, (a) => a !== 'theme/cores.ts');
  assert.deepEqual(achados, [], `mova para theme/cores.ts:\n${achados.join('\n')}`);
});

/**
 * BUG REAL: o `expo-notifications` lança erro no PRÓPRIO import no Expo
 * Go do Android (SDK 53+). Um import de topo derruba o app inteiro na
 * abertura — foi o que aconteceu. Ele só pode ser carregado sob demanda,
 * dentro de um try, em db/notificacoes.ts.
 */
test('expo-notifications nunca é importado no topo de um arquivo', () => {
  const achados = procurar(
    /^\s*import\s+(?!type\b)[^;]*from\s+['"]expo-notifications['"]/,
  );
  assert.deepEqual(
    achados,
    [],
    `use o require dentro do try em db/notificacoes.ts:\n${achados.join('\n')}`,
  );
});

/**
 * Regra do CLAUDE.md: as telas chamam funções de db/, nunca escrevem
 * SQL. É o que mantém a regra de negócio fora da navegação — que o autor
 * ainda pretende redesenhar.
 */
test('nenhuma tela escreve SQL', () => {
  const achados = procurar(
    /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/i,
    (a) => a.startsWith('app/') || a.startsWith('components/'),
  );
  assert.deepEqual(achados, [], `mova para db/consultas.ts:\n${achados.join('\n')}`);
});

/**
 * As migrações são versionadas: cada alteração de schema entra num bloco
 * NOVO e sobe a VERSAO_SCHEMA. Editar um bloco antigo não roda no
 * aparelho de quem já tem o app — a coluna simplesmente nunca aparece
 * lá.
 */
test('a VERSAO_SCHEMA acompanha a quantidade de blocos de migração', () => {
  const fonte = lerFonte('db/schema.ts');
  const blocos = [...fonte.matchAll(/const SCHEMA_V(\d+) = `/g)].map((m) => Number(m[1]));
  const versao = Number(/export const VERSAO_SCHEMA = (\d+);/.exec(fonte)[1]);

  assert.deepEqual(
    blocos,
    Array.from({ length: blocos.length }, (_, i) => i + 1),
    'os blocos têm que ser numerados em sequência, sem buraco',
  );
  assert.equal(versao, blocos.length, 'criou um bloco novo e esqueceu de subir a VERSAO_SCHEMA');

  for (const v of blocos) {
    // O `db.execSync(SCHEMA_Vn)` tem que aparecer DEPOIS do seu próprio
    // `versaoAtual < n` e ANTES do guarda da versão seguinte — é o que
    // prova que o bloco está no lugar certo.
    //
    // Antes esta expressão exigia o execSync colado no `{` do guarda.
    // Afrouxou para caber uma guarda interna: o SCHEMA_V7 é um REPARO e
    // só roda se a coluna não existir (ver o comentário dele). O que o
    // teste garante continua o mesmo — nenhum bloco fica órfão.
    assert.match(
      fonte,
      new RegExp(
        `versaoAtual < ${v}\\)(?:(?!versaoAtual <)[\\s\\S])*?db\\.execSync\\(SCHEMA_V${v}\\)`,
      ),
      `o bloco SCHEMA_V${v} existe mas não é executado por migrar()`,
    );
  }
});

/**
 * `ALTER TABLE` acrescenta a coluna no FIM da tabela. Um INSERT
 * posicional passa a gravar no campo errado depois de qualquer migração
 * — em silêncio. Por isso todo INSERT no seed nomeia as colunas.
 */
test('todo INSERT do seed nomeia as colunas', () => {
  const fonte = lerFonte('db/seed.ts');
  const inserts = [...fonte.matchAll(/INSERT(?: OR REPLACE)? INTO\s+(\w+)\s*([\s\S]{0,80})/g)];

  assert.ok(inserts.length > 0, 'nenhum INSERT encontrado — o teste estaria vazio');

  for (const [, tabela, depois] of inserts) {
    assert.match(
      depois,
      /^\s*\(/,
      `INSERT em ${tabela} sem lista de colunas: quebra na próxima ALTER TABLE`,
    );
  }
});
