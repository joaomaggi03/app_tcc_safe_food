/**
 * tests/rotulos.test.js
 * ---------------------------------------------------------------
 * Os textos que a tela mostra (theme/rotulos.ts).
 *
 * Parece bobo testar frase, mas dois dos rótulos daqui já confundiram o
 * próprio autor do app na primeira vez que rodaram no aparelho. E a
 * pluralização é onde eles erram: "1 dias", "2 crítico". O arquivo é
 * puro — só importa tipos —, então roda fora do celular.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const rotulos = require(path.join(__dirname, '.compilado', 'theme', 'rotulos.js'));
const { textoCriticos, textoVencimento, textoScore, faixaDoScore } = rotulos;

const score = (avaliados, adequados) => ({
  criticosAvaliados: avaliados,
  criticosAdequados: adequados,
});

/**
 * O formato antigo era "críticos 10/11", que se lia como progresso de
 * preenchimento — 10 de 11 respondidos. Queria dizer o contrário: UM
 * está reprovado. O texto novo nomeia a falha.
 */
test('textoCriticos diz quantos FALHARAM, não a razão', () => {
  assert.equal(textoCriticos(score(11, 10)), '1 crítico inadequado');
  assert.equal(textoCriticos(score(11, 9)), '2 críticos inadequados');
  assert.equal(textoCriticos(score(5, 0)), '5 críticos inadequados');

  assert.equal(textoCriticos(score(11, 11)), '11 críticos ok');
  assert.equal(textoCriticos(score(1, 1)), '1 crítico ok', 'singular quando só há um');
});

test('textoCriticos some quando nenhum crítico foi avaliado', () => {
  assert.equal(
    textoCriticos(score(0, 0)),
    null,
    'escrever "0 de 0" seria pior do que não dizer nada',
  );
});

test('textoVencimento acerta o plural e os casos de hoje e amanhã', () => {
  const prazo = (dias) => ({ diasParaVencer: dias });

  assert.equal(textoVencimento(prazo(-1)), 'Vencida há 1 dia', 'singular');
  assert.equal(textoVencimento(prazo(-3)), 'Vencida há 3 dias');
  assert.equal(textoVencimento(prazo(0)), 'Vence hoje');
  assert.equal(textoVencimento(prazo(1)), 'Vence amanhã', 'não é "vence em 1 dias"');
  assert.equal(textoVencimento(prazo(2)), 'Vence em 2 dias');
  assert.equal(textoVencimento(prazo(180)), 'Vence em 180 dias');
});

test('score nulo vira travessão, e zero continua sendo zero', () => {
  assert.equal(textoScore(null), '—', 'sem avaliação não é nota zero');
  assert.equal(textoScore(0), '0%');
  assert.equal(textoScore(100), '100%');

  assert.equal(faixaDoScore(null), 'sem_dados');
  assert.equal(faixaDoScore(0), 'ruim');
  assert.equal(faixaDoScore(69), 'ruim');
  assert.equal(faixaDoScore(70), 'atencao', 'o corte é inclusivo');
  assert.equal(faixaDoScore(89), 'atencao');
  assert.equal(faixaDoScore(90), 'bom');
  assert.equal(faixaDoScore(100), 'bom');
});

test('toda resposta e toda trilha têm rótulo — nenhuma cai como undefined', () => {
  for (const resposta of rotulos.RESPOSTAS) {
    assert.ok(rotulos.ROTULO_RESPOSTA[resposta], `resposta sem rótulo: ${resposta}`);
  }
  for (const trilha of ['diario', 'periodico', 'semestral']) {
    assert.ok(rotulos.ROTULO_TRILHA[trilha], `trilha sem rótulo: ${trilha}`);
    assert.ok(rotulos.DESCRICAO_TRILHA[trilha], `trilha sem descrição: ${trilha}`);
  }
  // 'essencial' é modo legado, mas inspeções antigas ainda o exibem.
  for (const modo of ['rotina', 'completa', 'essencial']) {
    assert.ok(rotulos.ROTULO_MODO[modo], `modo sem rótulo: ${modo}`);
  }
  for (const situacao of ['em_dia', 'vence_em_breve', 'vencida', 'nunca_feita']) {
    assert.ok(rotulos.ROTULO_SITUACAO[situacao], `situação sem rótulo: ${situacao}`);
  }
});

// ---------------------------------------------------------------
// PLANO DE AÇÃO
// ---------------------------------------------------------------

test('o prazo da ação fala em atraso, hoje, amanhã ou data', () => {
  const { textoPrazoAcao } = rotulos;
  const prazo = '2026-09-27';

  assert.equal(textoPrazoAcao({ situacao: 'atrasada', diasParaPrazo: -1, prazo }), 'Atrasada há 1 dia');
  assert.equal(textoPrazoAcao({ situacao: 'atrasada', diasParaPrazo: -3, prazo }), 'Atrasada há 3 dias');
  assert.equal(textoPrazoAcao({ situacao: 'vence_hoje', diasParaPrazo: 0, prazo }), 'Vence hoje');
  assert.equal(textoPrazoAcao({ situacao: 'no_prazo', diasParaPrazo: 1, prazo }), 'Vence amanhã');
  assert.equal(textoPrazoAcao({ situacao: 'no_prazo', diasParaPrazo: 7, prazo }), 'Até 27/09/2026');
});

test('a ação concluída não fala de prazo', () => {
  // Resolvida fora do prazo continua resolvida: lembrar o atraso depois
  // só pune quem registrou a correção.
  const { textoPrazoAcao } = rotulos;
  assert.equal(
    textoPrazoAcao({ situacao: 'concluida', diasParaPrazo: null, prazo: '2026-01-01' }),
    'Concluída',
  );
});
