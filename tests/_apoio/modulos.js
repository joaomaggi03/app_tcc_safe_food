/**
 * tests/_apoio/modulos.js
 * ---------------------------------------------------------------
 * Carrega os módulos TypeScript do app dentro do Node.
 *
 * O `npm test` compila antes (ver o script `pretest` no package.json) os
 * arquivos que NÃO dependem do React Native nem do expo-sqlite em tempo
 * de execução:
 *
 *   data/rdc216.ts         a norma estruturada
 *   data/rotina-diaria.ts  a rotina guiada
 *   db/datas.ts            contas de data
 *   db/faixa.ts            atendimento dos itens e faixa da RDC 275
 *   db/funcionamento.ts    os dias em que o estabelecimento abre
 *   db/vencimento.ts       a regra de vencimento
 *   db/schema.ts           as migrações
 *   db/seed.ts             a carga do catálogo
 *
 * Os dois últimos importam o expo-sqlite apenas como TIPO, e `import
 * type` some na compilação — por isso rodam aqui.
 *
 * FICA DE FORA: `db/consultas.ts`, que importa `db/index.ts` e com ele o
 * expo-sqlite de verdade. As consultas continuam sendo testadas pelo SQL
 * que executam, e não chamando as funções. Mudar isso exigiria injetar a
 * conexão em vez de importá-la — mexer no código de produção só para
 * viabilizar teste, decisão que não foi tomada.
 */

const path = require('node:path');
const fs = require('node:fs');

const RAIZ = path.resolve(__dirname, '..', '..');
const COMPILADO = path.join(RAIZ, 'tests', '.compilado');

function exigir(caminhoRelativo) {
  const arquivo = path.join(COMPILADO, caminhoRelativo);
  if (!fs.existsSync(arquivo)) {
    throw new Error(
      `Módulo compilado não encontrado: ${caminhoRelativo}\n` +
        'Rode `npm test` (que compila antes) em vez de chamar o node direto.',
    );
  }
  return require(arquivo);
}

/** Lê um arquivo do projeto como texto — para os testes de convenção. */
function lerFonte(caminhoRelativo) {
  return fs.readFileSync(path.join(RAIZ, caminhoRelativo), 'utf8');
}

/** Todos os arquivos .ts/.tsx do app (sem node_modules e sem os testes). */
function arquivosDoApp() {
  const encontrados = [];
  const ignorar = new Set(['node_modules', 'tests', '.expo', '.git', 'dist']);

  (function varrer(dir) {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignorar.has(entrada.name)) continue;
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) varrer(completo);
      else if (/\.tsx?$/.test(entrada.name)) {
        encontrados.push(path.relative(RAIZ, completo).replace(/\\/g, '/'));
      }
    }
  })(RAIZ);

  return encontrados;
}

module.exports = {
  RAIZ,
  lerFonte,
  arquivosDoApp,
  rdc216: () => exigir('data/rdc216.js'),
  rotinaDiaria: () => exigir('data/rotina-diaria.js'),
  datas: () => exigir('db/datas.js'),
  faixa: () => exigir('db/faixa.js'),
  funcionamento: () => exigir('db/funcionamento.js'),
  vencimento: () => exigir('db/vencimento.js'),
  schema: () => exigir('db/schema.js'),
  seed: () => exigir('db/seed.js'),
};
