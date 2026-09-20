/**
 * tests/sequencia.test.js
 * ---------------------------------------------------------------
 * A sequência de dias com diária concluída (db/sequencia.ts).
 *
 * O caso que mais importa aqui é o do dia em aberto: a diária fica
 * aberta o expediente inteiro e só é concluída no fechamento, então
 * durante a maior parte do dia "hoje" ainda não está no conjunto. Zerar
 * a sequência às 8h da manhã seria o bug mais fácil de cometer neste
 * arquivo — e o mais irritante de conviver.
 *
 * Como em vencimento.test.js, o "hoje" entra por parâmetro e as datas
 * são CALCULADAS a partir dele: contar trinta dias para trás de cabeça é
 * onde o teste erra antes do código.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { sequencia, datas } = require('./_apoio/modulos');

const { calcularSequencia } = sequencia();
const { somarDias } = datas();

const HOJE = '2026-09-16';
const haDias = (n) => somarDias(HOJE, -n);

/** Os dias de 'de' até 'ate' dias atrás, inclusive nas duas pontas. */
function corrida(de, ate) {
  const dias = [];
  for (let n = de; n <= ate; n++) dias.push(haDias(n));
  return dias;
}

// ---------------------------------------------------------------
// A CONTAGEM
// ---------------------------------------------------------------

test('dias seguidos terminando hoje contam todos', () => {
  const s = calcularSequencia(corrida(0, 4), HOJE);

  assert.equal(s.atual, 5);
  assert.equal(s.situacao, 'hoje_feita');
});

test('com a diária de hoje ainda aberta, a contagem vai até ontem', () => {
  // O CASO CENTRAL: são 8h da manhã, a diária de hoje nem começou, e a
  // pessoa fechou os últimos quatro dias. O número tem que ser 4 — não
  // zero — e o app tem que dizer que ela está em risco, não perdida.
  const s = calcularSequencia(corrida(1, 4), HOJE);

  assert.equal(s.atual, 4);
  assert.equal(s.situacao, 'em_risco');
});

test('um buraco no meio corta a sequência ali', () => {
  // Fez hoje, ontem, e depois um buraco anteontem.
  const s = calcularSequencia([haDias(0), haDias(1), haDias(3), haDias(4)], HOJE);

  assert.equal(s.atual, 2, 'a corrida atual é só hoje + ontem');
  assert.equal(s.recorde, 2);
});

test('nem hoje nem ontem: a sequência está quebrada', () => {
  const s = calcularSequencia(corrida(2, 6), HOJE);

  assert.equal(s.atual, 0);
  assert.equal(s.situacao, 'quebrada');
  assert.equal(s.recorde, 5, 'mas o recorde guarda o que já foi feito');
});

test('sem nenhuma diária concluída não há sequência nem recorde', () => {
  const s = calcularSequencia([], HOJE);

  assert.equal(s.atual, 0);
  assert.equal(s.recorde, 0);
  assert.equal(s.situacao, 'nenhuma');
});

test('duas diárias no mesmo dia contam UM dia de rotina', () => {
  const s = calcularSequencia([haDias(0), haDias(0), haDias(1)], HOJE);

  assert.equal(s.atual, 2);
});

// ---------------------------------------------------------------
// RECORDE
// ---------------------------------------------------------------

test('o recorde é a maior corrida de todas, não a última', () => {
  // Uma corrida antiga de 6 dias e a atual de 2.
  const s = calcularSequencia([...corrida(0, 1), ...corrida(10, 15)], HOJE);

  assert.equal(s.atual, 2);
  assert.equal(s.recorde, 6);
});

test('a corrida atual entra na conta do recorde', () => {
  const s = calcularSequencia(corrida(0, 9), HOJE);

  assert.equal(s.atual, 10);
  assert.equal(s.recorde, 10);
});

// ---------------------------------------------------------------
// BORDAS DE CALENDÁRIO
// ---------------------------------------------------------------

test('a sequência atravessa a virada do mês', () => {
  // 28/02 a 02/03 de 2026 (ano comum: fevereiro tem 28 dias).
  const s = calcularSequencia(
    ['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02'],
    '2026-03-02',
  );

  assert.equal(s.atual, 4);
});

test('a sequência atravessa o 29 de fevereiro de um ano bissexto', () => {
  const s = calcularSequencia(
    ['2028-02-28', '2028-02-29', '2028-03-01'],
    '2028-03-01',
  );

  assert.equal(s.atual, 3, '2028 é bissexto: 29/02 existe e emenda os dois lados');
});

test('a sequência atravessa a virada do ano', () => {
  const s = calcularSequencia(
    ['2025-12-30', '2025-12-31', '2026-01-01'],
    '2026-01-01',
  );

  assert.equal(s.atual, 3);
});

// ---------------------------------------------------------------
// A TIRA DOS SETE DIAS
// ---------------------------------------------------------------

test('a tira tem sete dias, do mais antigo para hoje', () => {
  const s = calcularSequencia(corrida(0, 2), HOJE);

  assert.equal(s.ultimosSete.length, 7);
  assert.equal(s.ultimosSete[0].dia, haDias(6));
  assert.equal(s.ultimosSete[6].dia, HOJE);
});

test('só o último dia da tira é marcado como hoje', () => {
  const s = calcularSequencia([], HOJE);
  const marcados = s.ultimosSete.filter((d) => d.hoje);

  assert.equal(marcados.length, 1);
  assert.equal(marcados[0].dia, HOJE);
});

test('a tira marca certo quais dias tiveram diária', () => {
  const s = calcularSequencia([haDias(0), haDias(2), haDias(6)], HOJE);
  const feitos = s.ultimosSete.filter((d) => d.feita).map((d) => d.dia);

  assert.deepEqual(feitos, [haDias(6), haDias(2), haDias(0)], 'na ordem da tira');
});

test('uma diária de dez dias atrás não aparece na tira, mas conta no recorde', () => {
  const s = calcularSequencia(corrida(10, 12), HOJE);

  assert.deepEqual(s.ultimosSete.filter((d) => d.feita), []);
  assert.equal(s.recorde, 3);
});

// ---------------------------------------------------------------
// DIAS FECHADOS
//
// O motivo de tudo isto existir: quem fecha aos domingos não pode
// aparecer como faltoso na segunda-feira. Setembro de 2026 — 13 é
// domingo, 14 segunda, 19 sábado.
// ---------------------------------------------------------------

const SEG = '2026-09-14';
const SEX = '2026-09-18';
const SAB = '2026-09-19';
const DOM = '2026-09-20';

test('o domingo fechado emenda sábado com segunda', () => {
  // Fechou a semana toda até sábado; hoje é segunda, domingo fechado.
  const s = calcularSequencia(
    ['2026-09-15', '2026-09-16', '2026-09-17', SEX, SAB],
    SEG === '2026-09-14' ? '2026-09-21' : SEG,
    '0111111',
  );

  assert.equal(s.atual, 5, 'os cinco dias de expediente continuam emendados');
  assert.equal(s.situacao, 'em_risco', 'segunda é dia de expediente: hoje conta');
});

test('sem a máscara, o mesmo caso apareceria quebrado', () => {
  // O bug que a máscara conserta, provado pelo contraste: a MESMA
  // história sem dias de funcionamento perde o domingo e zera tudo.
  const dias = ['2026-09-15', '2026-09-16', '2026-09-17', SEX, SAB];

  assert.equal(calcularSequencia(dias, '2026-09-21').atual, 0);
  assert.equal(calcularSequencia(dias, '2026-09-21', '0111111').atual, 5);
});

test('no dia fechado a situação é dia_fechado, e não em_risco', () => {
  const s = calcularSequencia([SEX, SAB], DOM, '0111111');

  assert.equal(s.situacao, 'dia_fechado');
  assert.equal(s.abreHoje, false);
  assert.equal(s.atual, 2, 'a sequência não é cobrada nem perdida na folga');
});

test('uma diária feita num dia fechado CONTA', () => {
  // Abriu excepcionalmente no domingo e inspecionou. Fez o certo.
  const s = calcularSequencia([SEX, SAB, DOM], DOM, '0111111');

  assert.equal(s.situacao, 'hoje_feita');
  assert.equal(s.atual, 3);
});

test('faltar num dia ABERTO quebra, mesmo com máscara', () => {
  // A máscara não é anistia geral: segunda é dia de expediente e ficou
  // sem diária, então a corrida para ali.
  const s = calcularSequencia([SEX, SAB, '2026-09-15'], '2026-09-15', '0111111');

  assert.equal(s.atual, 1, 'só a terça de hoje; a segunda vazia cortou');
});

test('o recorde também pula os dias fechados', () => {
  const dias = ['2026-09-11', '2026-09-12', '2026-09-14', '2026-09-15'];

  assert.equal(calcularSequencia(dias, '2026-09-15', '0111111').recorde, 4);
  assert.equal(calcularSequencia(dias, '2026-09-15').recorde, 2, 'sem máscara, o domingo corta');
});

test('quem só abre no sábado emenda sábados de semanas diferentes', () => {
  const s = calcularSequencia(['2026-09-05', '2026-09-12', SAB], SAB, '0000001');

  assert.equal(s.atual, 3, 'três sábados seguidos são três dias de expediente seguidos');
});

test('a tira marca os dias fechados', () => {
  const s = calcularSequencia([], SAB, '0111111');
  const fechados = s.ultimosSete.filter((d) => d.fechado).map((d) => d.dia);

  assert.deepEqual(fechados, ['2026-09-13'], 'só o domingo da janela');
});
