/**
 * tests/acao.test.js
 * ---------------------------------------------------------------
 * A regra do plano de ação corretiva (db/acao.ts).
 *
 * Três perguntas: em que situação a ação está hoje, que prazo o
 * formulário sugere, e em que ordem o plano aparece. Setembro de 2026:
 * 19 é sábado, 20 domingo, 21 segunda.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { acao } = require('./_apoio/modulos');

const {
  situacaoAcao,
  prazoDoAtalho,
  prazoPadraoEmDias,
  ordenarAcoes,
  descricaoGerada,
  aceitaCorrecaoNaHora,
  precisaDeAcao,
  PRAZO_PADRAO,
  PRAZO_PADRAO_CRITICO,
} = acao();

// ---------------------------------------------------------------
// SITUAÇÃO
// ---------------------------------------------------------------

test('ação com prazo futuro está no prazo, com os dias que faltam', () => {
  const r = situacaoAcao({ status: 'aberta', prazo: '2026-09-25' }, '2026-09-20');
  assert.deepEqual(r, { situacao: 'no_prazo', diasParaPrazo: 5 });
});

test('no dia do prazo ela vence hoje — ainda não está atrasada', () => {
  const r = situacaoAcao({ status: 'aberta', prazo: '2026-09-20' }, '2026-09-20');
  assert.deepEqual(r, { situacao: 'vence_hoje', diasParaPrazo: 0 });
});

test('um dia depois do prazo ela está atrasada, com dias negativos', () => {
  const r = situacaoAcao({ status: 'aberta', prazo: '2026-09-18' }, '2026-09-20');
  assert.deepEqual(r, { situacao: 'atrasada', diasParaPrazo: -2 });
});

test('concluída nunca fica atrasada, mesmo com o prazo no passado', () => {
  // A ação concluída depois do prazo foi resolvida; cobrar atraso dela
  // para sempre só faria o usuário deixar de concluir no app.
  const r = situacaoAcao({ status: 'concluida', prazo: '2026-01-01' }, '2026-09-20');
  assert.deepEqual(r, { situacao: 'concluida', diasParaPrazo: null });
});

// ---------------------------------------------------------------
// PRAZO SUGERIDO
// ---------------------------------------------------------------

test('item crítico sugere prazo para hoje; os demais, 7 dias', () => {
  assert.equal(prazoPadraoEmDias(true), PRAZO_PADRAO_CRITICO);
  assert.equal(prazoPadraoEmDias(false), PRAZO_PADRAO);
  assert.ok(PRAZO_PADRAO_CRITICO < PRAZO_PADRAO, 'o crítico nunca pode esperar mais');
});

test('o atalho soma dias corridos quando o lugar abre todo dia', () => {
  assert.equal(prazoDoAtalho('2026-09-20', 7, null), '2026-09-27');
  assert.equal(prazoDoAtalho('2026-09-20', 0, '1111111'), '2026-09-20');
});

test('prazo que cai em dia fechado vai para o próximo dia aberto', () => {
  // Fecha aos domingos. Hoje é sábado; "em 1 dia" cairia no domingo.
  assert.equal(prazoDoAtalho('2026-09-19', 1, '0111111'), '2026-09-21');
});

test('"hoje" num dia fechado vira o próximo dia aberto', () => {
  // Quem abre o app no domingo de folga e cria a ação não tem como
  // resolver nada nesse dia.
  assert.equal(prazoDoAtalho('2026-09-20', 0, '0111111'), '2026-09-21');
});

// ---------------------------------------------------------------
// ORDEM DO PLANO
// ---------------------------------------------------------------

function a(id, campos) {
  return { id, status: 'aberta', prazo: '2026-09-25', critico: 0, concluida_em: null, ...campos };
}

test('abertas vêm antes das concluídas', () => {
  const ordem = ordenarAcoes([
    a(1, { status: 'concluida', concluida_em: '2026-09-19T10:00:00.000Z' }),
    a(2),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, [2, 1]);
});

test('entre as abertas, o prazo mais cedo primeiro — a atrasada sobe sozinha', () => {
  const ordem = ordenarAcoes([
    a(1, { prazo: '2026-09-30' }),
    a(2, { prazo: '2026-09-10' }),
    a(3, { prazo: '2026-09-21' }),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, [2, 3, 1]);
});

test('no mesmo prazo, o crítico primeiro', () => {
  const ordem = ordenarAcoes([a(1), a(2, { critico: 1 })]).map((x) => x.id);
  assert.deepEqual(ordem, [2, 1]);
});

test('entre as concluídas, a mais recente primeiro', () => {
  const ordem = ordenarAcoes([
    a(1, { status: 'concluida', concluida_em: '2026-09-01T10:00:00.000Z' }),
    a(2, { status: 'concluida', concluida_em: '2026-09-15T10:00:00.000Z' }),
  ]).map((x) => x.id);
  assert.deepEqual(ordem, [2, 1]);
});

test('ordenar não altera a lista recebida', () => {
  const original = [a(1, { prazo: '2026-09-30' }), a(2, { prazo: '2026-09-10' })];
  ordenarAcoes(original);
  assert.deepEqual(
    original.map((x) => x.id),
    [1, 2],
  );
});

// ---------------------------------------------------------------
// TEXTO GERADO PELO APP
// ---------------------------------------------------------------

test('a ação gerada diz o item e a exigência, com os tópicos', () => {
  assert.equal(
    descricaoGerada({
      codigo_rdc: '4.8.8',
      topicos: ['70 °C em todas as partes do alimento', 'Ou combinação equivalente de tempo e temperatura'],
    }),
    'Adequar ao item 4.8.8 da RDC 216: 70 °C em todas as partes do alimento; Ou combinação equivalente de tempo e temperatura',
  );
});

test('sem tópicos, a ação gerada cita só o item — nunca fica vazia', () => {
  // O banco recusa descrição vazia (CHECK do schema v8); gerar uma
  // derrubaria a conclusão da inspeção.
  assert.equal(descricaoGerada({ codigo_rdc: '4.1.3', topicos: [] }), 'Adequar ao item 4.1.3 da RDC 216.');
  assert.equal(descricaoGerada({ codigo_rdc: '4.1.3', topicos: ['  '] }), 'Adequar ao item 4.1.3 da RDC 216.');
});

// ---------------------------------------------------------------
// CORRIGIDO NA HORA (correção imediata)
// ---------------------------------------------------------------

test('só a diária aceita "corrigi na hora"', () => {
  assert.equal(aceitaCorrecaoNaHora('diario'), true);
  assert.equal(aceitaCorrecaoNaHora('periodico'), false, 'auditoria é estrutural');
  assert.equal(aceitaCorrecaoNaHora('semestral'), false, 'reservatório não se lava na hora');
});

test('na diária, o corrigido na hora não vira ação; o não corrigido vira', () => {
  assert.equal(precisaDeAcao({ trilha: 'diario', corrigidoNaHora: true }), false);
  assert.equal(precisaDeAcao({ trilha: 'diario', corrigidoNaHora: false }), true);
});

test('na auditoria, todo inadequado vira ação — mesmo com a marca gravada', () => {
  // A regra não confia na tela: se a marca chegar ao banco numa
  // periódica por algum caminho, o plano continua cobrando.
  assert.equal(precisaDeAcao({ trilha: 'periodico', corrigidoNaHora: true }), true);
  assert.equal(precisaDeAcao({ trilha: 'semestral', corrigidoNaHora: true }), true);
});

// ---------------------------------------------------------------
// ALERTA DE PRAZO (os horários escritos à mão: 9h = minuto 540)
// ---------------------------------------------------------------

const { alertasDeAcao, textoDoAlertaDeAcao, MAX_DIAS_ALERTA_ACAO } = acao();

const SEXTA = '2026-09-18';
const SEM_DOMINGO = '0111111'; // posição 0 = domingo (Date.getDay)

function alertas(acoes, extra) {
  return alertasDeAcao({
    acoes,
    hoje: SEXTA,
    minutoAgora: 8 * 60,
    diasFuncionamento: '1111111',
    ...extra,
  });
}

test('alerta no dia do prazo, um só por dia, com a contagem', () => {
  const lista = alertas([
    { prazo: '2026-09-25', critico: false },
    { prazo: '2026-09-25', critico: true },
    { prazo: '2026-09-28', critico: false },
  ]);
  assert.deepEqual(lista, [
    { dia: '2026-09-25', vencem: 2, atrasadas: 0, criticas: 1 },
    { dia: '2026-09-28', vencem: 1, atrasadas: 0, criticas: 0 },
  ]);
});

test('prazo hoje antes das 9h toca hoje; depois das 9h, amanhã como atrasada', () => {
  const antes = alertas([{ prazo: SEXTA, critico: false }]);
  assert.deepEqual(antes, [{ dia: SEXTA, vencem: 1, atrasadas: 0, criticas: 0 }]);

  const depois = alertas([{ prazo: SEXTA, critico: false }], { minutoAgora: 9 * 60 });
  assert.deepEqual(depois, [{ dia: '2026-09-19', vencem: 0, atrasadas: 1, criticas: 0 }]);
});

test('ação atrasada toca na próxima manhã, junto com a que vence nesse dia', () => {
  const lista = alertas([
    { prazo: '2026-09-10', critico: true },
    { prazo: SEXTA, critico: false },
  ]);
  assert.deepEqual(lista, [{ dia: SEXTA, vencem: 1, atrasadas: 1, criticas: 1 }]);
});

test('prazo no domingo fechado toca na segunda, e já como atrasada', () => {
  const lista = alertas([{ prazo: '2026-09-20', critico: false }], {
    diasFuncionamento: SEM_DOMINGO,
  });
  assert.deepEqual(lista, [{ dia: '2026-09-21', vencem: 0, atrasadas: 1, criticas: 0 }]);
});

test('o atrasado não é lembrado em dia fechado', () => {
  // Sábado, 10h: a próxima manhã seria o domingo, que é folga.
  const lista = alertas([{ prazo: '2026-09-10', critico: false }], {
    hoje: '2026-09-19',
    minutoAgora: 10 * 60,
    diasFuncionamento: SEM_DOMINGO,
  });
  assert.equal(lista[0].dia, '2026-09-21');
});

test('sem ação aberta, nenhum alerta; e no máximo os dias mais próximos', () => {
  assert.deepEqual(alertas([]), []);

  const muitas = Array.from({ length: 15 }, (_, i) => ({
    prazo: `2026-10-${String(i + 1).padStart(2, '0')}`,
    critico: false,
  }));
  const lista = alertas(muitas);
  assert.equal(lista.length, MAX_DIAS_ALERTA_ACAO);
  assert.equal(lista[0].dia, '2026-10-01');
});

test('o texto diz quantas, se há atraso e se há item crítico', () => {
  const uma = textoDoAlertaDeAcao({ dia: SEXTA, vencem: 1, atrasadas: 0, criticas: 0 }, 'Bar X');
  assert.equal(uma.titulo, 'Ação corretiva vence hoje');
  assert.equal(uma.corpo, '1 ação vence hoje no plano do Bar X. Toque para abrir o plano.');

  const mista = textoDoAlertaDeAcao({ dia: SEXTA, vencem: 2, atrasadas: 1, criticas: 1 }, 'Bar X');
  assert.equal(mista.titulo, 'Plano de ação com atraso');
  assert.equal(
    mista.corpo,
    '1 ação atrasada e 2 ações vencem hoje no plano do Bar X. Uma delas é de item crítico. Toque para abrir o plano.',
  );
});
