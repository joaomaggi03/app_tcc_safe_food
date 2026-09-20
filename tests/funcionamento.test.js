/**
 * tests/funcionamento.test.js
 * ---------------------------------------------------------------
 * Os dias em que o estabelecimento abre (db/funcionamento.ts).
 *
 * Duas coisas moram aqui. A primeira é o ALINHAMENTO da máscara com o
 * `Date.getDay()`: se a posição 0 deixar de ser domingo, tudo o que
 * depende dela erra por um dia e em silêncio — a sequência, o
 * vencimento da diária e o horário do alerta.
 *
 * A segunda é a NORMALIZAÇÃO. O valor vem do banco e pode ser NULL
 * (linha anterior ao schema v6), ter tamanho errado ou ser só zeros — e
 * uma máscara sem nenhum dia aberto travaria `proximoDiaAberto` num laço
 * infinito dentro de um render.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { funcionamento } = require('./_apoio/modulos');

const {
  abreNoDia,
  alternarDia,
  FUNCIONAMENTO_PADRAO,
  normalizarFuncionamento,
  proximoDiaAberto,
  totalDiasAbertos,
} = funcionamento();

// Setembro de 2026: 13 é domingo, 14 segunda … 19 sábado.
const DOMINGO = '2026-09-13';
const SEGUNDA = '2026-09-14';
const SABADO = '2026-09-19';

// ---------------------------------------------------------------
// ALINHAMENTO COM O Date.getDay()
// ---------------------------------------------------------------

test('a posição 0 da máscara é domingo', () => {
  assert.equal(abreNoDia('1000000', DOMINGO), true);
  assert.equal(abreNoDia('1000000', SEGUNDA), false);
});

test('a posição 6 da máscara é sábado', () => {
  assert.equal(abreNoDia('0000001', SABADO), true);
  assert.equal(abreNoDia('0000001', DOMINGO), false);
});

test('fechado só aos domingos: abre em todos os outros dias', () => {
  const mascara = '0111111';

  assert.equal(abreNoDia(mascara, DOMINGO), false);
  for (let n = 1; n <= 6; n++) {
    const dia = `2026-09-${13 + n}`;
    assert.equal(abreNoDia(mascara, dia), true, `${dia} deveria estar aberto`);
  }
});

// ---------------------------------------------------------------
// NORMALIZAÇÃO — tudo que for inválido vira "abre todo dia"
// ---------------------------------------------------------------

test('NULL vira abre-todo-dia: é a linha anterior ao schema v6', () => {
  assert.equal(normalizarFuncionamento(null), FUNCIONAMENTO_PADRAO);
  assert.equal(normalizarFuncionamento(undefined), FUNCIONAMENTO_PADRAO);
  assert.equal(abreNoDia(null, DOMINGO), true, 'quem já usava o app não vê nada mudar');
});

test('máscara de tamanho errado ou com lixo cai no padrão', () => {
  assert.equal(normalizarFuncionamento(''), FUNCIONAMENTO_PADRAO);
  assert.equal(normalizarFuncionamento('111'), FUNCIONAMENTO_PADRAO);
  assert.equal(normalizarFuncionamento('11111111'), FUNCIONAMENTO_PADRAO);
  assert.equal(normalizarFuncionamento('seg-sex'), FUNCIONAMENTO_PADRAO);
});

test('máscara sem nenhum dia aberto cai no padrão', () => {
  // Não é preciosismo: sem esta regra, `proximoDiaAberto` não teria
  // resposta e o laço rodaria para sempre dentro de um render.
  assert.equal(normalizarFuncionamento('0000000'), FUNCIONAMENTO_PADRAO);
});

test('uma máscara válida atravessa intacta', () => {
  assert.equal(normalizarFuncionamento('0111110'), '0111110');
});

// ---------------------------------------------------------------
// PRÓXIMO DIA ABERTO
// ---------------------------------------------------------------

test('o dia já aberto é ele mesmo', () => {
  assert.equal(proximoDiaAberto(SEGUNDA, '0111111'), SEGUNDA);
});

test('domingo fechado empurra para segunda', () => {
  assert.equal(proximoDiaAberto(DOMINGO, '0111111'), SEGUNDA);
});

test('quem só abre no sábado espera a semana inteira', () => {
  // O feirante de um dia só: domingo cai no sábado seguinte.
  assert.equal(proximoDiaAberto(DOMINGO, '0000001'), SABADO);
});

test('o pulo atravessa a virada do mês', () => {
  // 30/09/2026 é quarta; quem só abre sexta cai em 02/10.
  assert.equal(proximoDiaAberto('2026-09-30', '0000010'), '2026-10-02');
});

// ---------------------------------------------------------------
// EDIÇÃO E CONTAGEM (a tela de cadastro)
// ---------------------------------------------------------------

test('alternar liga e desliga o mesmo dia', () => {
  assert.equal(alternarDia('1111111', 0), '0111111');
  assert.equal(alternarDia('0111111', 0), '1111111');
});

test('o total de dias abertos conta os uns', () => {
  assert.equal(totalDiasAbertos('1111111'), 7);
  assert.equal(totalDiasAbertos('0111110'), 5);
  assert.equal(totalDiasAbertos('0000001'), 1);
  assert.equal(totalDiasAbertos(null), 7, 'NULL é abre-todo-dia');
});
