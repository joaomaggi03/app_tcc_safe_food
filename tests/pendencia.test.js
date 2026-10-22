/**
 * tests/pendencia.test.js
 * ---------------------------------------------------------------
 * As pendências da diária (db/pendencia.ts).
 *
 * Pendência = item previsto, sem resposta, cuja etapa encerrou. O que
 * importa testar é QUANDO a etapa encerra (janela, conclusão, virada do
 * dia) e o que NÃO é pendência (qualquer resposta, inclusive "não
 * observado"; etapa ainda aberta).
 *
 * Exemplo: abre às 07:00, fecha às 22:00, diária de 20/10.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { janela, pendencia } = require('./_apoio/modulos');

const { lerHora, lerHorarios } = janela();
const { contarPendencias, etapaEncerrada, somarPendencias, semPendencias } = pendencia();

const HORARIOS = lerHorarios('07:00', '22:00');
const HOJE = '2026-10-20';
const h = (texto) => lerHora(texto);

const PREVISTOS = [
  { id: 'a1', momento: 'abertura' },
  { id: 'a2', momento: 'abertura' },
  { id: 's1', momento: 'servico' },
  { id: 's2', momento: 'servico' },
  { id: 'f1', momento: 'fechamento' },
];

function entrada(extra) {
  return {
    previstos: PREVISTOS,
    respondidos: new Set(),
    concluida: false,
    horarios: HORARIOS,
    dia: HOJE,
    hoje: HOJE,
    minuto: h('12:00'),
    ...extra,
  };
}

test('ao meio-dia, só a etapa "antes de abrir" encerrou', () => {
  const p = contarPendencias(entrada({ respondidos: new Set(['a1']) }));
  assert.deepEqual(p.porEtapa, { abertura: 1, servico: 0, fechamento: 0 });
  assert.equal(p.total, 1);
});

test('às 07:29 nada é pendência ainda (tolerância de 30 min)', () => {
  assert.equal(contarPendencias(entrada({ minuto: h('07:29') })).total, 0);
  assert.equal(contarPendencias(entrada({ minuto: h('07:30') })).total, 2);
});

test('qualquer resposta tira a pendência — inclusive "não observado"', () => {
  // A regra olha se HÁ resposta, não qual: "não observado" é ter olhado.
  const p = contarPendencias(entrada({ respondidos: new Set(['a1', 'a2']) }));
  assert.equal(p.total, 0);
});

test('às 22:00 o serviço encerra; o fechamento segue aberto até a meia-noite', () => {
  const p = contarPendencias(entrada({ minuto: h('22:00') }));
  assert.deepEqual(p.porEtapa, { abertura: 2, servico: 2, fechamento: 0 });
});

test('concluir encerra todas as etapas, mesmo antes da hora', () => {
  const p = contarPendencias(
    entrada({ concluida: true, minuto: h('21:00'), respondidos: new Set(['a1', 's1']) }),
  );
  assert.deepEqual(p.porEtapa, { abertura: 1, servico: 1, fechamento: 1 });
  assert.equal(p.total, 3);
});

test('a diária de ontem largada aberta: tudo o que faltou é pendência', () => {
  const p = contarPendencias(entrada({ dia: '2026-10-19', minuto: h('08:00') }));
  assert.equal(p.total, 5);
});

test('sem horário, nada é pendência enquanto o dia está aberto', () => {
  const p = contarPendencias(entrada({ horarios: null, minuto: h('23:59') }));
  assert.equal(p.total, 0);
});

test('sem horário, a conclusão e a virada do dia ainda geram pendência', () => {
  assert.equal(contarPendencias(entrada({ horarios: null, concluida: true })).total, 5);
  assert.equal(contarPendencias(entrada({ horarios: null, dia: '2026-10-19' })).total, 5);
});

test('item respondido que não está entre os previstos não conta para nada', () => {
  const p = contarPendencias(entrada({ concluida: true, respondidos: new Set(['x9']) }));
  assert.equal(p.total, 5);
});

test('etapaEncerrada: as três portas', () => {
  const base = { horarios: HORARIOS, dia: HOJE, hoje: HOJE, minuto: h('12:00') };
  assert.equal(etapaEncerrada('servico', { ...base, concluida: false }), false);
  assert.equal(etapaEncerrada('servico', { ...base, concluida: true }), true);
  assert.equal(etapaEncerrada('servico', { ...base, concluida: false, dia: '2026-10-19' }), true);
  assert.equal(etapaEncerrada('abertura', { ...base, concluida: false }), true);
});

test('etapasCompletas: completa quando todos os itens dela têm resposta', () => {
  const { etapasCompletas } = pendencia();
  const nada = etapasCompletas(PREVISTOS, new Set());
  assert.deepEqual([...nada], [], 'nenhuma etapa com item respondido');

  const abertura = etapasCompletas(PREVISTOS, new Set(['a1', 'a2', 's1']));
  assert.deepEqual([...abertura].sort(), ['abertura'], 'serviço ainda falta s2');

  const semFechamento = etapasCompletas(
    PREVISTOS.filter((i) => i.momento !== 'fechamento'),
    new Set(),
  );
  assert.ok(semFechamento.has('fechamento'), 'etapa sem item previsto conta como completa');
});

test('somarPendencias junta o mês por etapa', () => {
  const soma = somarPendencias([
    { total: 2, porEtapa: { abertura: 2, servico: 0, fechamento: 0 } },
    { total: 3, porEtapa: { abertura: 1, servico: 1, fechamento: 1 } },
  ]);
  assert.deepEqual(soma, { total: 5, porEtapa: { abertura: 3, servico: 1, fechamento: 1 } });
  assert.deepEqual(somarPendencias([]), semPendencias());
});
