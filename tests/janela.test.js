/**
 * tests/janela.test.js
 * ---------------------------------------------------------------
 * A janela de horário de cada etapa da diária (db/janela.ts).
 *
 * O que está em jogo são as BORDAS. Um item travado um minuto antes da
 * hora impede o usuário de responder o que devia; travado um minuto
 * depois, aceita uma resposta fora de hora. Por isso os limites aqui são
 * escritos à mão, minuto a minuto, e não recalculados com a mesma conta
 * do módulo.
 *
 * Exemplo usado em quase tudo: abre às 07:00, fecha às 22:00.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { janela } = require('./_apoio/modulos');

const {
  formatarHora,
  janelaDoMomento,
  lerHora,
  lerHorarios,
  normalizarHora,
  problemaNosHorarios,
  situacaoDaEtapa,
  situacaoDaJanela,
} = janela();

const h = (texto) => lerHora(texto);
const HORARIOS = lerHorarios('07:00', '22:00');

// ---------------------------------------------------------------
// LEITURA E ESCRITA DA HORA
// ---------------------------------------------------------------

test('lerHora só aceita HH:MM válido', () => {
  assert.equal(lerHora('00:00'), 0);
  assert.equal(lerHora('07:30'), 450);
  assert.equal(lerHora('23:59'), 1439);
  assert.equal(lerHora('24:00'), null);
  assert.equal(lerHora('07:60'), null);
  assert.equal(lerHora('7:30'), null, 'o banco grava sempre com dois dígitos');
  assert.equal(lerHora(null), null);
  assert.equal(lerHora(''), null);
});

test('formatarHora devolve dois dígitos', () => {
  assert.equal(formatarHora(0), '00:00');
  assert.equal(formatarHora(450), '07:30');
  assert.equal(formatarHora(1439), '23:59');
});

test('normalizarHora entende o que se digita no teclado numérico', () => {
  assert.equal(normalizarHora('7'), '07:00');
  assert.equal(normalizarHora('07'), '07:00');
  assert.equal(normalizarHora('730'), '07:30');
  assert.equal(normalizarHora('0730'), '07:30');
  assert.equal(normalizarHora('7:30'), '07:30');
  assert.equal(normalizarHora(' 22:00 '), '22:00');
  assert.equal(normalizarHora('2200'), '22:00');
});

test('normalizarHora recusa o que não é hora', () => {
  assert.equal(normalizarHora(''), null);
  assert.equal(normalizarHora('25'), null);
  assert.equal(normalizarHora('760'), null, '7h60 não existe');
  assert.equal(normalizarHora('12345'), null);
  assert.equal(normalizarHora('sete'), null);
});

// ---------------------------------------------------------------
// VALIDAÇÃO DO CADASTRO
// ---------------------------------------------------------------

test('sem horário nenhum é válido: o estabelecimento não informou', () => {
  assert.equal(problemaNosHorarios(null, null), null);
});

test('meio horário não serve', () => {
  assert.match(problemaNosHorarios('07:00', null), /fechamento/);
  assert.match(problemaNosHorarios(null, '22:00'), /abertura/);
});

test('fechamento antes ou igual à abertura é recusado (depois da meia-noite não é aceito)', () => {
  // Orienta a deixar em branco, e NÃO a pôr 23:59: com 23:59 a etapa de
  // fechamento duraria meia hora e a limpeza de quem fecha à 1h nunca caberia.
  assert.match(problemaNosHorarios('18:00', '01:00'), /em branco/);
  assert.match(problemaNosHorarios('07:00', '07:00'), /depois da abertura/);
});

test('o expediente tem que ter ao menos uma hora, para as tolerâncias caberem', () => {
  assert.match(problemaNosHorarios('07:00', '07:59'), /1 hora/);
  assert.equal(problemaNosHorarios('07:00', '08:00'), null);
});

test('lerHorarios trata par quebrado como "sem horário", sem travar nada', () => {
  assert.equal(lerHorarios(null, null), null);
  assert.equal(lerHorarios('07:00', null), null);
  assert.equal(lerHorarios('lixo', '22:00'), null);
  assert.equal(lerHorarios('22:00', '07:00'), null, 'invertido não vira janela');
  assert.deepEqual(lerHorarios('07:00', '22:00'), { abertura: 420, fechamento: 1320 });
});

// ---------------------------------------------------------------
// AS TRÊS JANELAS
// ---------------------------------------------------------------

test('as janelas do exemplo, escritas à mão', () => {
  assert.deepEqual(janelaDoMomento('abertura', HORARIOS), { inicio: 0, fim: h('07:30') });
  assert.deepEqual(janelaDoMomento('servico', HORARIOS), { inicio: h('07:00'), fim: h('22:00') });
  assert.deepEqual(janelaDoMomento('fechamento', HORARIOS), { inicio: h('21:30'), fim: 1440 });
});

test('antes de abrir: aberta de madrugada até 07:29, encerrada às 07:30', () => {
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('00:00')), 'aberta');
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('06:45')), 'aberta');
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('07:29')), 'aberta', 'tolerância de 30 min');
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('07:30')), 'encerrada');
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('15:00')), 'encerrada');
});

test('serviço: ainda não às 06:59, aberta das 07:00 às 21:59, encerrada às 22:00', () => {
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('06:59')), 'ainda_nao');
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('07:00')), 'aberta');
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('21:59')), 'aberta');
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('22:00')), 'encerrada');
});

test('fechamento: ainda não às 21:29, aberta das 21:30 até o fim do dia', () => {
  assert.equal(situacaoDaJanela('fechamento', HORARIOS, h('12:00')), 'ainda_nao');
  assert.equal(situacaoDaJanela('fechamento', HORARIOS, h('21:29')), 'ainda_nao');
  assert.equal(situacaoDaJanela('fechamento', HORARIOS, h('21:30')), 'aberta', '30 min antes');
  assert.equal(situacaoDaJanela('fechamento', HORARIOS, h('23:59')), 'aberta');
});

test('nas bordas as janelas se sobrepõem, de propósito', () => {
  // 07:15 — a porta já abriu, mas a conferência de abertura ainda vale.
  assert.equal(situacaoDaJanela('abertura', HORARIOS, h('07:15')), 'aberta');
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('07:15')), 'aberta');
  // 21:45 — o serviço não acabou, mas a limpeza já pode ser marcada.
  assert.equal(situacaoDaJanela('servico', HORARIOS, h('21:45')), 'aberta');
  assert.equal(situacaoDaJanela('fechamento', HORARIOS, h('21:45')), 'aberta');
});

test('no expediente mínimo de 1 hora as tolerâncias se encostam sem se cruzar', () => {
  const curto = lerHorarios('10:00', '11:00');
  assert.equal(situacaoDaJanela('abertura', curto, h('10:29')), 'aberta');
  assert.equal(situacaoDaJanela('abertura', curto, h('10:30')), 'encerrada');
  assert.equal(situacaoDaJanela('fechamento', curto, h('10:29')), 'ainda_nao');
  assert.equal(situacaoDaJanela('fechamento', curto, h('10:30')), 'aberta');
});

/**
 * ACHADO DO FISCAL: o relógio volta a 00:00 à meia-noite. Com a tela
 * aberta, a diária de ontem reabria o "antes de abrir" de madrugada.
 */
test('inspeção de um dia que já passou: todas as etapas encerradas', () => {
  const ONTEM = '2026-10-19';
  const HOJE = '2026-10-20';
  for (const momento of ['abertura', 'servico', 'fechamento']) {
    assert.equal(
      situacaoDaEtapa(momento, HORARIOS, ONTEM, HOJE, h('00:05')),
      'encerrada',
      `${momento}: a madrugada de hoje não reabre a diária de ontem`,
    );
  }
});

test('no próprio dia, quem decide é o relógio', () => {
  const HOJE = '2026-10-20';
  assert.equal(situacaoDaEtapa('abertura', HORARIOS, HOJE, HOJE, h('07:29')), 'aberta');
  assert.equal(situacaoDaEtapa('abertura', HORARIOS, HOJE, HOJE, h('07:30')), 'encerrada');
  assert.equal(situacaoDaEtapa('servico', HORARIOS, HOJE, HOJE, h('06:59')), 'ainda_nao');
});

test('relógio do aparelho voltando atrás não abre nada antes da hora', () => {
  assert.equal(
    situacaoDaEtapa('fechamento', HORARIOS, '2026-10-21', '2026-10-20', h('23:00')),
    'ainda_nao',
  );
});

test('sem horário, nem a virada do dia trava — o comportamento de antes', () => {
  assert.equal(situacaoDaEtapa('abertura', null, '2026-10-19', '2026-10-20', 5), 'aberta');
});

test('sem horário cadastrado tudo fica aberto o dia todo, como antes', () => {
  for (const momento of ['abertura', 'servico', 'fechamento']) {
    for (const minuto of [0, h('07:00'), h('15:00'), 1439]) {
      assert.equal(situacaoDaJanela(momento, null, minuto), 'aberta', `${momento} às ${minuto}`);
    }
  }
});
