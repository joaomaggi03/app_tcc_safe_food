/**
 * tests/_apoio/consultas.js
 * ---------------------------------------------------------------
 * O SQL do `db/consultas.ts`, extraído do próprio arquivo.
 *
 * POR QUE EXTRAIR EM VEZ DE IMPORTAR
 * O `db/consultas.ts` importa `db/index.ts`, que importa o `expo-sqlite`
 * de verdade — nada disso roda fora do aparelho. Então não dá para
 * chamar `scoreDaInspecao()` aqui.
 *
 * A saída é ler o SQL do arquivo-fonte e executá-lo contra um SQLite de
 * verdade. Não é tão bom quanto chamar a função (a montagem dos
 * parâmetros em TypeScript fica sem cobertura), mas garante o que mais
 * importa: que a CONSULTA esteja correta, e que ela continue correta
 * quando o schema mudar. Se alguém renomear uma coluna, estes testes
 * quebram.
 *
 * Tornar as funções chamáveis exigiria injetar a conexão em vez de
 * importá-la — mudança no código de produção motivada só por teste, que
 * não foi feita.
 */

const fs = require('node:fs');
const path = require('node:path');

const FONTE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'db', 'consultas.ts'),
  'utf8',
);

/** Lê uma constante de template literal do consultas.ts, já resolvida. */
function constante(nome, substituicoes = {}) {
  const achado = new RegExp('const ' + nome + ' = `([\\s\\S]*?)`;').exec(FONTE);
  if (!achado) throw new Error(`constante ${nome} não encontrada em db/consultas.ts`);

  let sql = achado[1];
  for (const [chave, valor] of Object.entries(substituicoes)) {
    sql = sql.split('${' + chave + '}').join(valor);
  }

  const pendente = /\$\{(\w+)\}/.exec(sql);
  if (pendente) throw new Error(`falta substituir \${${pendente[1]}} em ${nome}`);

  return sql;
}

/**
 * Acha, no consultas.ts, o comando SQL que contém um trecho.
 *
 * Serve para o SQL que está embutido dentro de uma função, e não numa
 * constante nomeada — como o upsert de resposta. O teste continua
 * executando o comando REAL do app, em vez de uma cópia que poderia
 * envelhecer sozinha.
 */
function sqlQueContem(trecho) {
  const encontrados = [...FONTE.matchAll(/`([^`]*?)`/g)]
    .map((m) => m[1])
    .filter((sql) => sql.includes(trecho));

  if (encontrados.length === 0) throw new Error(`nenhum SQL com: ${trecho}`);
  if (encontrados.length > 1) throw new Error(`trecho ambíguo (${encontrados.length}): ${trecho}`);
  return encontrados[0];
}

/** O valor numérico de uma constante exportada (ex.: PESO_CRITICO). */
function numero(nome) {
  const achado = new RegExp('export const ' + nome + ' = (\\d+);').exec(FONTE);
  if (!achado) throw new Error(`constante ${nome} não encontrada`);
  return Number(achado[1]);
}

const PESO_CRITICO = numero('PESO_CRITICO');
const PESO_EFETIVO = constante('PESO_EFETIVO', { PESO_CRITICO });
const SELECT_PESOS = constante('SELECT_PESOS', { PESO_EFETIVO });

module.exports = { FONTE, constante, numero, sqlQueContem, PESO_CRITICO, SELECT_PESOS };
