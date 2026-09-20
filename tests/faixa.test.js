/**
 * tests/faixa.test.js
 * ---------------------------------------------------------------
 * O atendimento dos itens e a faixa da RDC 275/2002 (db/faixa.ts).
 *
 * Duas coisas moram aqui: os LIMITES exatos das faixas — que vêm do
 * texto da norma e não podem escorregar — e a diferença entre o
 * percentual por contagem simples e o score ponderado, que é a razão de
 * este módulo existir.
 *
 * Os limites são escritos à mão de propósito, e não lidos das
 * constantes: se alguém mudar PISO_GRUPO_1 para 75, o teste TEM que
 * quebrar. É o oposto do score.test.js, que importa PESO_CRITICO porque
 * ali o número é decisão nossa e pode mudar — aqui ele é da norma.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { faixa } = require('./_apoio/modulos');

const { atendimentoDosItens, faixaRdc275, PISO_GRUPO_1, PISO_GRUPO_2 } = faixa();

// ---------------------------------------------------------------
// ATENDIMENTO DOS ITENS
// ---------------------------------------------------------------

test('atendimento é contagem simples: adequados sobre avaliados', () => {
  assert.equal(atendimentoDosItens(8, 10), 80);
  assert.equal(atendimentoDosItens(10, 10), 100);
  assert.equal(atendimentoDosItens(0, 10), 0);
});

test('sem itens avaliados devolve null, não zero', () => {
  // Mesma regra do score: "não verificado" não é "reprovou tudo".
  assert.equal(atendimentoDosItens(0, 0), null);
  assert.equal(atendimentoDosItens(0, -1), null);
});

test('o atendimento IGNORA o peso do item crítico', () => {
  // Este é o teste que justifica o módulo. Uma inspeção com um crítico
  // reprovado e um comum adequado: o score ponderado cai muito (o
  // crítico vale PESO_CRITICO), mas o atendimento é 1 de 2 = 50%,
  // porque a lista da RDC 275 não tem peso nenhum.
  assert.equal(atendimentoDosItens(1, 2), 50);
});

test('arredonda para inteiro, para a tela e a faixa nunca discordarem', () => {
  // 2/3 = 66,66… — se a faixa fosse calculada sobre o valor cru e a
  // tela mostrasse o arredondado, os dois poderiam cair em grupos
  // diferentes num caso de borda.
  assert.equal(atendimentoDosItens(2, 3), 67);
  assert.equal(atendimentoDosItens(1, 3), 33);
});

// ---------------------------------------------------------------
// FAIXAS DA RDC 275/2002 — Anexo II, item D
// ---------------------------------------------------------------

test('os pisos das faixas são os da norma: 76 e 51', () => {
  assert.equal(PISO_GRUPO_1, 76);
  assert.equal(PISO_GRUPO_2, 51);
});

test('Grupo 1 é de 76 a 100% de atendimento dos itens', () => {
  assert.equal(faixaRdc275(100), 1);
  assert.equal(faixaRdc275(76), 1);
});

test('Grupo 2 é de 51 a 75%', () => {
  assert.equal(faixaRdc275(75), 2);
  assert.equal(faixaRdc275(51), 2);
});

test('Grupo 3 é de 0 a 50%', () => {
  assert.equal(faixaRdc275(50), 3);
  assert.equal(faixaRdc275(0), 3);
});

test('os limites exatos não escorregam de grupo', () => {
  // Um a mais e um a menos em cada fronteira. É onde este tipo de
  // função erra, e é o que dá para conferir contra o texto da norma.
  assert.equal(faixaRdc275(75), 2, '75 ainda é Grupo 2');
  assert.equal(faixaRdc275(76), 1, '76 já é Grupo 1');
  assert.equal(faixaRdc275(50), 3, '50 ainda é Grupo 3');
  assert.equal(faixaRdc275(51), 2, '51 já é Grupo 2');
});

test('sem atendimento não há classificação — null entra, null sai', () => {
  // Grupo 3 aqui seria uma acusação falsa: quem não verificou nada não
  // é o mesmo que quem verificou e reprovou.
  assert.equal(faixaRdc275(null), null);
});

test('a inspeção sem nada avaliado atravessa as duas funções como null', () => {
  assert.equal(faixaRdc275(atendimentoDosItens(0, 0)), null);
});
