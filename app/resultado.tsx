/**
 * app/resultado.tsx
 * ---------------------------------------------------------------
 * Tela de RESULTADO DA INSPEÇÃO (RF04) — rota "/resultado?id=12".
 *
 * É onde a inspeção vira diagnóstico. Mostra três coisas, nesta ordem
 * de importância:
 *
 *  1. o score de conformidade;
 *  2. os itens CRÍTICOS, separados — porque um 86% de média não pode
 *     esconder dois itens de risco reprovados;
 *  3. o score por categoria da RDC, que responde "onde eu perdi ponto".
 *
 * Nenhuma conta acontece aqui: tudo vem pronto de `db/consultas.ts`.
 * Esta tela só desenha.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  obterResumoInspecao,
  PESO_CRITICO,
  scorePorCategoria,
  type ResumoInspecao,
  type Score,
  type ScoreCategoria,
} from '../db/consultas';
import Cores from '../theme/cores';
import {
  faixaDoScore,
  formatarDataHora,
  ROTULO_MODO,
  ROTULO_TRILHA,
  textoScore,
  type FaixaScore,
} from '../theme/rotulos';

/** Cor de fundo e de texto de cada faixa do score. */
const CORES_FAIXA: Record<FaixaScore, { fundo: string; texto: string }> = {
  bom: { fundo: Cores.primariaClara, texto: Cores.sobrePrimaria },
  atencao: { fundo: Cores.fundo, texto: Cores.texto },
  ruim: { fundo: Cores.acentoSuave, texto: Cores.acentoForte },
  sem_dados: { fundo: Cores.fundo, texto: Cores.textoSuave },
};

export default function TelaResultado() {
  const parametros = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const inspecaoId = Number(parametros.id);

  // Recalculado só se o id mudar. O score é sempre derivado das
  // respostas — nunca é lido de um campo gravado —, então esta tela
  // mostra o mesmo número hoje e daqui a seis meses.
  const dados = useMemo(() => {
    if (!Number.isFinite(inspecaoId)) return null;
    const inspecao = obterResumoInspecao(inspecaoId);
    if (!inspecao) return null;
    return { inspecao, categorias: scorePorCategoria(inspecaoId) };
  }, [inspecaoId]);

  if (!dados) {
    return <Redirect href="/historico" />;
  }

  const { inspecao, categorias } = dados;

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <Cartao inspecao={inspecao} />
      <Criticos score={inspecao.score} />
      <Cobertura inspecao={inspecao} />
      <PorCategoria categorias={categorias} />

      <Text style={estilos.formula}>
        O score é o percentual de itens adequados sobre os itens avaliados, com cada item
        crítico valendo {PESO_CRITICO} vezes um item comum. Itens marcados como “não se
        aplica” e “não observado” ficam fora da conta — não são reprovação, são ausência de
        verificação.
      </Text>

      <View style={estilos.botoes}>
        <Pressable
          style={({ pressed }) => [estilos.botao, pressed && estilos.botaoPressionado]}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
        >
          <Ionicons name="home-outline" size={18} color={Cores.sobrePrimaria} />
          <Text style={estilos.botaoTexto}>Voltar ao início</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [estilos.botaoSecundario, pressed && estilos.pressionado]}
          onPress={() => router.replace('/historico')}
          accessibilityRole="button"
        >
          <Text style={estilos.botaoSecundarioTexto}>Ver histórico</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Cartao({ inspecao }: { inspecao: ResumoInspecao }) {
  const faixa = faixaDoScore(inspecao.score.valor);
  const cores = CORES_FAIXA[faixa];
  const data = inspecao.data_conclusao ?? inspecao.data_inicio;

  return (
    <View style={[estilos.cartaoScore, { backgroundColor: cores.fundo }]}>
      <Text style={[estilos.scoreRotulo, { color: cores.texto }]}>Conformidade</Text>
      <Text style={[estilos.scoreValor, { color: cores.texto }]}>
        {textoScore(inspecao.score.valor)}
      </Text>
      <Text style={[estilos.scoreContexto, { color: cores.texto }]}>
        {ROTULO_TRILHA[inspecao.trilha]}
        {inspecao.trilha === 'diario' ? ` · ${ROTULO_MODO[inspecao.modo]}` : ''}
        {' · '}
        {formatarDataHora(data)}
      </Text>

      {inspecao.score.valor === null ? (
        <Text style={[estilos.scoreContexto, { color: cores.texto }]}>
          Nenhum item foi avaliado nesta inspeção.
        </Text>
      ) : (
        <Text style={[estilos.scoreContexto, { color: cores.texto }]}>
          {inspecao.score.adequados} adequados e {inspecao.score.inadequados} inadequados em{' '}
          {inspecao.score.avaliados} itens avaliados
        </Text>
      )}
    </View>
  );
}

/**
 * Os críticos em destaque próprio.
 *
 * Este bloco existe porque a média engole risco: um estabelecimento
 * pode ter 88% e, ainda assim, estar com temperatura de cozimento e
 * lavagem de mãos reprovadas. O peso maior do crítico ajuda, mas não
 * substitui mostrar o número separado.
 */
function Criticos({ score }: { score: Score }) {
  if (score.criticosAvaliados === 0) return null;

  const falhas = score.criticosAvaliados - score.criticosAdequados;
  const tudoOk = falhas === 0;

  return (
    <View style={[estilos.cartao, tudoOk ? estilos.criticoOk : estilos.criticoAlerta]}>
      <View style={estilos.linhaTitulo}>
        <Ionicons
          name={tudoOk ? 'shield-checkmark-outline' : 'warning-outline'}
          size={18}
          color={tudoOk ? Cores.primariaTexto : Cores.acentoForte}
        />
        <Text style={estilos.tituloCartao}>Itens críticos</Text>
        <Text style={[estilos.criticoContagem, !tudoOk && estilos.criticoContagemAlerta]}>
          {score.criticosAdequados} de {score.criticosAvaliados}
        </Text>
      </View>

      <Text style={estilos.notaCartao}>
        {tudoOk
          ? 'Todos os itens de maior risco sanitário estão adequados.'
          : `${falhas} ${falhas === 1 ? 'item crítico está inadequado' : 'itens críticos estão inadequados'}. São os que oferecem risco direto à saúde — trate-os antes dos demais.`}
      </Text>
    </View>
  );
}

/**
 * Quanto do checklist foi realmente olhado.
 *
 * "Não observado" não derruba o score, e isso é proposital — mas
 * também não pode passar despercebido: 100% com 8 de 32 observados
 * não é a mesma coisa que 100% com 32 de 32.
 */
function Cobertura({ inspecao }: { inspecao: ResumoInspecao }) {
  const total = inspecao.total_itens;
  if (total === null) return null;

  const olhados = inspecao.score.avaliados;
  const porcentagem = total === 0 ? 0 : Math.round((olhados / total) * 100);

  return (
    <View style={estilos.cartao}>
      <View style={estilos.linhaTitulo}>
        <Ionicons name="eye-outline" size={18} color={Cores.textoSecundario} />
        <Text style={estilos.tituloCartao}>Cobertura</Text>
        <Text style={estilos.coberturaValor}>
          {olhados} de {total}
        </Text>
      </View>

      <View style={estilos.barra}>
        <View style={[estilos.barraPreenchida, { width: `${porcentagem}%` }]} />
      </View>

      <Text style={estilos.notaCartao}>
        {inspecao.score.naoObservados > 0
          ? `${inspecao.score.naoObservados} ${inspecao.score.naoObservados === 1 ? 'item ficou' : 'itens ficaram'} como "não observado" e não entrou na nota.`
          : 'Todo item respondido entrou na nota.'}
        {inspecao.score.naoSeAplica > 0
          ? ` ${inspecao.score.naoSeAplica} marcado como "não se aplica".`
          : ''}
      </Text>
    </View>
  );
}

function PorCategoria({ categorias }: { categorias: ScoreCategoria[] }) {
  if (categorias.length === 0) return null;

  // Pior primeiro: a tela deve abrir no problema, não na ordem da norma.
  // Categorias sem nota avaliada vão para o fim.
  const ordenadas = [...categorias].sort((a, b) => {
    if (a.score.valor === null) return 1;
    if (b.score.valor === null) return -1;
    return a.score.valor - b.score.valor;
  });

  // O título depende do resultado: "onde você perdeu ponto" só faz
  // sentido se houve ponto perdido. Com tudo adequado, o mesmo cartão
  // é só o detalhamento por bloco — acusar perda seria mentir para
  // quem acabou de acertar tudo.
  const houvePerda = categorias.some(
    (categoria) => categoria.score.valor !== null && categoria.score.valor < 100,
  );

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>
        {houvePerda ? 'Onde você perdeu ponto' : 'Conformidade por bloco'}
      </Text>
      <Text style={estilos.notaCartao}>
        {houvePerda
          ? 'Score por bloco da RDC 216, do pior para o melhor.'
          : 'Todos os blocos avaliados estão em conformidade.'}
      </Text>

      {ordenadas.map((categoria) => {
        const faixa = faixaDoScore(categoria.score.valor);
        const largura = categoria.score.valor ?? 0;

        return (
          <View key={categoria.categoriaId} style={estilos.categoria}>
            <View style={estilos.linhaCategoria}>
              <Text style={estilos.codigoCategoria}>{categoria.codigoRdc}</Text>
              <Text style={estilos.nomeCategoria} numberOfLines={1}>
                {categoria.nome}
              </Text>
              <Text style={[estilos.scoreCategoria, { color: CORES_FAIXA[faixa].texto }]}>
                {textoScore(categoria.score.valor)}
              </Text>
            </View>

            <View style={estilos.barraFina}>
              <View
                style={[
                  estilos.barraFinaPreenchida,
                  { width: `${largura}%`, backgroundColor: corDaBarra(faixa) },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function corDaBarra(faixa: FaixaScore): string {
  if (faixa === 'ruim') return Cores.acento;
  if (faixa === 'atencao') return Cores.textoSuave;
  return Cores.primaria;
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 40 },

  cartaoScore: { borderRadius: 14, padding: 22, alignItems: 'center' },
  scoreRotulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  scoreValor: { fontSize: 56, fontWeight: '700', marginVertical: 2 },
  scoreContexto: { fontSize: 13, textAlign: 'center', marginTop: 2 },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  criticoOk: { borderColor: Cores.primaria },
  criticoAlerta: { borderColor: Cores.acento },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloCartao: { flex: 1, fontSize: 15, fontWeight: '700', color: Cores.texto },
  notaCartao: { fontSize: 13, lineHeight: 20, color: Cores.textoSecundario, marginTop: 8 },

  criticoContagem: { fontSize: 16, fontWeight: '700', color: Cores.primariaTexto },
  criticoContagemAlerta: { color: Cores.acentoForte },
  coberturaValor: { fontSize: 15, fontWeight: '700', color: Cores.texto },

  barra: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Cores.fundo,
    marginTop: 12,
    overflow: 'hidden',
  },
  barraPreenchida: { height: 8, backgroundColor: Cores.primaria },

  categoria: { marginTop: 14 },
  linhaCategoria: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codigoCategoria: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.sobrePrimaria,
    backgroundColor: Cores.primariaClara,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  nomeCategoria: { flex: 1, fontSize: 13, color: Cores.textoSecundario },
  scoreCategoria: { fontSize: 13, fontWeight: '700' },
  barraFina: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Cores.fundo,
    marginTop: 6,
    overflow: 'hidden',
  },
  barraFinaPreenchida: { height: 5 },

  formula: {
    fontSize: 12,
    lineHeight: 18,
    color: Cores.textoSuave,
    marginTop: 18,
  },

  botoes: { marginTop: 20, gap: 10 },
  botao: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Cores.primaria,
    borderRadius: 12,
    paddingVertical: 16,
  },
  botaoPressionado: { backgroundColor: Cores.primariaEscura },
  botaoTexto: { fontSize: 15, fontWeight: '700', color: Cores.sobrePrimaria },
  botaoSecundario: { alignItems: 'center', paddingVertical: 12 },
  botaoSecundarioTexto: { fontSize: 14, fontWeight: '600', color: Cores.primariaTexto },
  pressionado: { opacity: 0.6 },
});
