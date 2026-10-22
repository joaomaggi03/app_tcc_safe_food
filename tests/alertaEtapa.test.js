/**
 * tests/alertaEtapa.test.js
 * ---------------------------------------------------------------
 * Quando avisar que cada etapa da diária abriu (db/alertaEtapa.ts).
 *
 * Exemplo: abre às 07:00, fecha às 22:00. Os alertas esperados são
 * 06:30 (antes de abrir), 07:00 (serviço) e 21:30 (fechamento) —
 * escritos à mão, e não recalculados com a conta do módulo.
 *
 * 20/10/2026 é uma terça-feira.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { alertaEtapa, janela } = require('./_apoio/modulos');

const { alertasDeEtapa, DIAS_A_FRENTE } = alertaEtapa();
const { lerHora, lerHorarios } = janela();

const h = (texto) => lerHora(texto);
const HORARIOS = lerHorarios('07:00', '22:00');
const TERCA = '2026-10-20';

function entrada(extra) {
  return {
    horarios: HORARIOS,
    diasFuncionamento: '1111111',
    hoje: TERCA,
    minutoAgora: h('05:00'),
    feitasHoje: new Set(),
    ...extra,
  };
}

const deHoje = (alertas) => alertas.filter((a) => a.dia === TERCA);

test('os três horários do dia: 06:30, 07:00 e 21:30', () => {
  const hoje = deHoje(alertasDeEtapa(entrada()));
  assert.deepEqual(
    hoje.map((a) => [a.momento, a.minuto]),
    [
      ['abertura', h('06:30')],
      ['servico', h('07:00')],
      ['fechamento', h('21:30')],
    ],
  );
});

test('sete dias, três alertas por dia aberto', () => {
  const alertas = alertasDeEtapa(entrada());
  assert.equal(alertas.length, DIAS_A_FRENTE * 3);
  assert.equal(alertas[alertas.length - 1].dia, '2026-10-26');
});

test('alerta de hoje que já passou não é agendado', () => {
  const hoje = deHoje(alertasDeEtapa(entrada({ minutoAgora: h('07:00') })));
  assert.deepEqual(hoje.map((a) => a.momento), ['fechamento'], '07:00 em ponto já passou');
});

test('etapa feita hoje não é avisada; amanhã volta', () => {
  const alertas = alertasDeEtapa(entrada({ feitasHoje: new Set(['abertura', 'servico']) }));
  assert.deepEqual(deHoje(alertas).map((a) => a.momento), ['fechamento']);
  assert.equal(alertas.filter((a) => a.dia === '2026-10-21').length, 3);
});

test('dia fechado não tem alerta', () => {
  // Máscara pelo Date.getDay(): fecha aos domingos (posição 0). 25/10 é domingo.
  const alertas = alertasDeEtapa(entrada({ diasFuncionamento: '0111111' }));
  assert.equal(alertas.filter((a) => a.dia === '2026-10-25').length, 0);
  assert.equal(alertas.length, 6 * 3);
});

test('sem horário cadastrado, nenhum alerta de etapa', () => {
  assert.deepEqual(alertasDeEtapa(entrada({ horarios: null })), []);
});

test('abertura antes das 00:30 não joga o alerta para o dia anterior', () => {
  const madrugada = lerHorarios('00:15', '10:00');
  const [primeiro] = alertasDeEtapa(entrada({ horarios: madrugada, minutoAgora: -1 }));
  assert.deepEqual([primeiro.momento, primeiro.dia, primeiro.minuto], ['abertura', TERCA, 0]);
});
