/**
 * tests/vencimento.test.js
 * ---------------------------------------------------------------
 * A regra de vencimento das trilhas (db/vencimento.ts) — RF05.
 *
 * Aqui moram os casos de borda da Fase 5: o limite exato da
 * antecedência, o primeiro dia de atraso, e a trilha que nunca foi
 * feita. A função recebe o "hoje" como parâmetro, então o teste não
 * depende da data em que roda.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { vencimento, datas } = require('./_apoio/modulos');

const { calcularVencimento } = vencimento();
const { somarDias } = datas();

const HOJE = '2026-09-07';

// As datas dos casos são CALCULADAS a partir de hoje, nunca escritas à
// mão: somar 180 dias de cabeça é onde o teste erra antes do código.
const haDias = (n) => somarDias(HOJE, -n);

function calcular(opcoes) {
  return calcularVencimento({
    ultimaConclusao: null,
    dataCadastro: HOJE,
    intervaloDias: 30,
    antecedenciaDias: 7,
    hoje: HOJE,
    ...opcoes,
  });
}

test('trilha diária: intervalo 1 dia, sem antecedência', () => {
  const diaria = (conclusao) =>
    calcular({ ultimaConclusao: conclusao, intervaloDias: 1, antecedenciaDias: 0 });

  assert.equal(diaria(HOJE).diasParaVencer, 1, 'feita hoje, vence amanhã');
  assert.equal(diaria(HOJE).situacao, 'em_dia');

  assert.equal(diaria(haDias(1)).diasParaVencer, 0, 'feita ontem, vence hoje');
  assert.equal(diaria(haDias(1)).situacao, 'vence_em_breve', 'vencer hoje já é aviso');

  assert.equal(diaria(haDias(2)).diasParaVencer, -1, 'feita anteontem, um dia de atraso');
  assert.equal(diaria(haDias(2)).situacao, 'vencida');
});

test('trilha periódica: o limite da antecedência é inclusivo', () => {
  const periodica = (conclusao) => calcular({ ultimaConclusao: conclusao });

  assert.equal(periodica(haDias(22)).diasParaVencer, 8);
  assert.equal(periodica(haDias(22)).situacao, 'em_dia', 'faltando 8, ainda em dia');

  assert.equal(periodica(haDias(23)).diasParaVencer, 7);
  assert.equal(
    periodica(haDias(23)).situacao,
    'vence_em_breve',
    'faltando exatamente a antecedência, já avisa',
  );

  assert.equal(periodica(haDias(30)).situacao, 'vence_em_breve', 'vence hoje');
  assert.equal(periodica(haDias(31)).situacao, 'vencida', 'passou um dia');
  assert.equal(periodica(haDias(31)).diasParaVencer, -1);
});

test('trilha semestral: 180 dias, avisa com 30 de antecedência', () => {
  const semestral = (conclusao) =>
    calcular({ ultimaConclusao: conclusao, intervaloDias: 180, antecedenciaDias: 30 });

  assert.equal(semestral(HOJE).diasParaVencer, 180);
  assert.equal(semestral(HOJE).proximoVencimento, '2027-03-06');
  assert.equal(semestral(haDias(180 - 31)).situacao, 'em_dia', 'faltando 31');
  assert.equal(semestral(haDias(180 - 30)).situacao, 'vence_em_breve', 'faltando 30');
  assert.equal(semestral(haDias(181)).diasParaVencer, -1);
});

/**
 * Sem conclusão nenhuma, o prazo conta da data de CADASTRO. É por isso
 * que uma trilha nova nasce vencida (ou quase): é o que puxa o usuário a
 * fazer o primeiro check, em vez de o app exibir três trilhas "em dia"
 * que nunca foram verificadas.
 */
test('trilha nunca realizada conta o prazo desde o cadastro', () => {
  assert.equal(
    calcular({ dataCadastro: HOJE, intervaloDias: 1, antecedenciaDias: 0 }).situacao,
    'nunca_feita',
    'cadastrado hoje, diária vence amanhã',
  );

  assert.equal(
    calcular({ dataCadastro: haDias(2), intervaloDias: 1, antecedenciaDias: 0 }).situacao,
    'vencida',
    'cadastrado há 2 dias, a diária já está atrasada',
  );

  assert.equal(
    calcular({ dataCadastro: haDias(40) }).situacao,
    'vencida',
    '"vencida" tem precedência sobre "nunca feita": esconder o atraso seria pior',
  );
  assert.equal(calcular({ dataCadastro: haDias(40) }).diasParaVencer, -10);
});

test('a última conclusão manda sobre a data de cadastro', () => {
  const antigo = { dataCadastro: '2020-01-01', ultimaConclusao: HOJE };
  assert.equal(calcular(antigo).situacao, 'em_dia');
  assert.equal(calcular(antigo).diasParaVencer, 30);
});

/**
 * O usuário pode editar o intervalo da auditoria periódica. Nenhum valor
 * aceito pelo campo pode produzir situação inválida ou data quebrada.
 */
test('qualquer intervalo de 1 a 365 produz resultado válido', () => {
  const validas = new Set(['em_dia', 'vence_em_breve', 'vencida', 'nunca_feita']);

  for (let intervalo = 1; intervalo <= 365; intervalo++) {
    for (const conclusao of [null, HOJE, haDias(200), haDias(500)]) {
      const r = calcular({ intervaloDias: intervalo, ultimaConclusao: conclusao });

      assert.ok(validas.has(r.situacao), `situação inválida com intervalo ${intervalo}`);
      assert.match(r.proximoVencimento, /^\d{4}-\d{2}-\d{2}$/, `data quebrada em ${intervalo}`);
      assert.equal(Number.isInteger(r.diasParaVencer), true);
    }
  }
});

// ---------------------------------------------------------------
// DIAS DE FUNCIONAMENTO
//
// O vencimento que cai em dia fechado é empurrado para o próximo dia
// aberto. É só isso — e resolve o resto sozinho, porque `diasParaVencer`
// e a situação saem do vencimento. Setembro de 2026: 19 é sábado, 20
// domingo, 21 segunda.
// ---------------------------------------------------------------

/** A trilha diária de quem fecha aos domingos. */
function diaria(hoje, ultimaConclusao) {
  return calcularVencimento({
    ultimaConclusao,
    dataCadastro: '2026-09-01',
    intervaloDias: 1,
    antecedenciaDias: 0,
    hoje,
    diasFuncionamento: '0111111',
  });
}

test('a diária NÃO vence no domingo de quem fecha aos domingos', () => {
  // Fechou sábado. No domingo o app não tem nada a cobrar.
  const s = diaria('2026-09-20', '2026-09-19');

  assert.equal(s.proximoVencimento, '2026-09-21', 'empurrado para segunda');
  assert.equal(s.situacao, 'em_dia');
});

test('sem a máscara, a mesma diária apareceria vencendo no domingo', () => {
  // O contraste que mostra o que a máscara conserta.
  const s = calcularVencimento({
    ultimaConclusao: '2026-09-19',
    dataCadastro: '2026-09-01',
    intervaloDias: 1,
    antecedenciaDias: 0,
    hoje: '2026-09-20',
  });

  assert.equal(s.proximoVencimento, '2026-09-20');
  assert.equal(s.situacao, 'vence_em_breve', 'cobrança no dia de folga');
});

test('na segunda a diária volta a ser cobrada', () => {
  const s = diaria('2026-09-21', '2026-09-19');

  assert.equal(s.diasParaVencer, 0);
  assert.equal(s.situacao, 'vence_em_breve');
});

test('faltar na segunda atrasa de verdade — a folga não é desculpa eterna', () => {
  const s = diaria('2026-09-22', '2026-09-19');

  assert.equal(s.diasParaVencer, -1);
  assert.equal(s.situacao, 'vencida');
});

test('a auditoria periódica também não vence em dia fechado', () => {
  // A regra vale para as três trilhas: 30 dias a partir de 21/08/2026
  // cairiam em 20/09, um domingo.
  const s = calcularVencimento({
    ultimaConclusao: '2026-08-21',
    dataCadastro: '2026-08-01',
    intervaloDias: 30,
    antecedenciaDias: 7,
    hoje: '2026-09-20',
    diasFuncionamento: '0111111',
  });

  assert.equal(s.proximoVencimento, '2026-09-21');
});
