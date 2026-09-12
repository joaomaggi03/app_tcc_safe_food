/**
 * tests/datas.test.js
 * ---------------------------------------------------------------
 * As contas de data (db/datas.ts).
 *
 * É onde erro passa despercebido: virada de mês, ano bissexto, fuso
 * horário. Um deslize aqui desloca o vencimento de TODAS as trilhas sem
 * quebrar nada visivelmente — o app continua funcionando, só avisando no
 * dia errado.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { datas } = require('./_apoio/modulos');

const { somarDias, diferencaEmDias, diaLocalISO } = datas();

test('somarDias atravessa as viradas que costumam quebrar', () => {
  assert.equal(somarDias('2026-01-31', 1), '2026-02-01', '31 de janeiro + 1');
  assert.equal(somarDias('2026-02-28', 1), '2026-03-01', 'fevereiro de ano comum');
  assert.equal(somarDias('2024-02-28', 1), '2024-02-29', 'ano bissexto tem 29');
  assert.equal(somarDias('2024-02-29', 1), '2024-03-01', 'o dia extra vira março');
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01', 'vira o ano');
  assert.equal(somarDias('2026-09-07', 0), '2026-09-07', 'somar zero não move');
  assert.equal(somarDias('2026-03-01', -1), '2026-02-28', 'dias negativos voltam');
});

test('somarDias com os intervalos reais das trilhas', () => {
  assert.equal(somarDias('2026-09-07', 1), '2026-09-08', 'diária');
  assert.equal(somarDias('2026-09-07', 30), '2026-10-07', 'periódica padrão');
  assert.equal(somarDias('2026-09-07', 180), '2027-03-06', 'semestral (água)');
  assert.equal(
    somarDias('2023-10-01', 180),
    '2024-03-29',
    'semestral atravessando um fevereiro bissexto',
  );
});

test('diferencaEmDias conta dias inteiros, com sinal', () => {
  assert.equal(diferencaEmDias('2026-09-07', '2026-09-07'), 0, 'mesmo dia');
  assert.equal(diferencaEmDias('2026-09-07', '2026-09-08'), 1, 'amanhã');
  assert.equal(diferencaEmDias('2026-09-07', '2026-09-06'), -1, 'ontem = atraso');
  assert.equal(diferencaEmDias('2026-01-01', '2027-01-01'), 365, 'um ano comum');
  assert.equal(diferencaEmDias('2024-01-01', '2025-01-01'), 366, 'um ano bissexto');
});

/**
 * O teste mais valioso do arquivo: somar N dias e medir a diferença tem
 * que devolver N, em qualquer ponto do calendário. Um ano inteiro de
 * datas cobre viradas de mês, de ano e o horário de verão de uma vez —
 * sem precisar adivinhar quais datas são perigosas.
 */
test('somar e medir são operações inversas, dia após dia', () => {
  let dia = '2024-01-01';

  for (let n = 0; n < 400; n++) {
    assert.equal(diferencaEmDias(dia, somarDias(dia, 1)), 1, `+1 a partir de ${dia}`);
    assert.equal(diferencaEmDias(dia, somarDias(dia, 30)), 30, `+30 a partir de ${dia}`);
    assert.equal(diferencaEmDias(dia, somarDias(dia, 180)), 180, `+180 a partir de ${dia}`);
    dia = somarDias(dia, 1);
  }
});

/**
 * `toISOString()` devolveria a data em UTC: às 21h no Brasil já é o dia
 * seguinte lá. Esta é a classe de bug que deslocava o `data_cadastro` e,
 * com ele, o primeiro vencimento das três trilhas.
 */
test('diaLocalISO usa o fuso do aparelho, nunca UTC', () => {
  assert.equal(diaLocalISO(new Date(2026, 8, 7, 23, 30)), '2026-09-07', '23h30 ainda é hoje');
  assert.equal(diaLocalISO(new Date(2026, 8, 7, 0, 15)), '2026-09-07', '00h15 já é hoje');
  assert.equal(diaLocalISO(new Date(2026, 11, 31, 22, 0)), '2026-12-31', 'véspera de ano novo');
});
