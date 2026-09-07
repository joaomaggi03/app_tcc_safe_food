/**
 * app/nova-inspecao.tsx
 * ---------------------------------------------------------------
 * Tela NOVA INSPEÇÃO — rota "/nova-inspecao".
 *
 * O ponto de partida: escolher QUAL trilha preencher. Cada cartão abre
 * a tela de execução passando a trilha por parâmetro
 * ("/inspecao?trilha=diario") — é esse parâmetro que faz uma única tela
 * de execução servir às três trilhas, hoje e na Fase 5.
 *
 * Na Fase 2 esta tela mostrava o checklist inteiro, só para leitura.
 * Agora o checklist tem dono: ele é preenchido na tela de execução.
 *
 * No rodapé fica a lista de itens marcados como "não se aplica" (RF09),
 * com a opção de voltar a exibi-los. Sem ela o RF09 seria uma porta só
 * de ida: um toque errado esconderia uma exigência para sempre.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  contarItensPorTrilha,
  contarVerificacoesDaRotina,
  diaLocalISO,
  listarInspecoes,
  listarItensOcultos,
  reexibirItem,
  TRILHAS,
  type Estabelecimento,
  type ItemOculto,
  type ModoInspecao,
  type ResumoInspecao,
  type Trilha,
} from '../db/consultas';
import { statusDasTrilhas, type StatusTrilha } from '../db/periodicidade';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  DESCRICAO_TRILHA,
  formatarDataHora,
  ROTULO_TRILHA,
  textoUltimaConclusao,
  textoVencimento,
} from '../theme/rotulos';

export default function TelaNovaInspecao() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const carregado = useEstabelecimento((estado) => estado.carregado);

  if (!carregado) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  if (!estabelecimento) {
    return <Redirect href="/cadastro" />;
  }

  return <Trilhas estabelecimento={estabelecimento} />;
}

interface Dados {
  contagem: Record<Trilha, number>;
  /** Quantas verificações a rotina guiada tem — o tamanho do modo Rotina. */
  verificacoesRotina: number;
  emAndamento: Partial<Record<Trilha, ResumoInspecao>>;
  /** O prazo de cada trilha (RF05), na ordem de TRILHAS. */
  prazos: StatusTrilha[];
  ocultos: ItemOculto[];
}

function Trilhas({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);

  const recarregar = useCallback(() => {
    const hoje = diaLocalISO();
    const emAndamento: Partial<Record<Trilha, ResumoInspecao>> = {};

    for (const inspecao of listarInspecoes(estabelecimento.id)) {
      if (inspecao.status !== 'em_andamento' || emAndamento[inspecao.trilha]) continue;

      // A diária é presa ao dia: uma deixada aberta ontem não conta como
      // "em andamento" hoje — abrir a trilha começa uma inspeção nova.
      if (inspecao.trilha === 'diario' && inspecao.dia_local !== hoje) continue;

      // A lista vem da mais recente para a mais antiga, então a primeira
      // em andamento de cada trilha é a que será retomada.
      emAndamento[inspecao.trilha] = inspecao;
    }

    setDados({
      contagem: contarItensPorTrilha(estabelecimento.perfil_id, estabelecimento.id),
      verificacoesRotina: contarVerificacoesDaRotina(
        estabelecimento.perfil_id,
        estabelecimento.id,
      ),
      emAndamento,
      prazos: statusDasTrilhas(estabelecimento),
      ocultos: listarItensOcultos(estabelecimento.id),
    });
  }, [estabelecimento]);

  /**
   * `useFocusEffect` roda toda vez que a tela volta a ficar visível —
   * diferente do `useEffect`, que rodaria só na primeira vez.
   *
   * É o que faz os números se atualizarem quando você volta de uma
   * inspeção: se marcou dois itens como "não se aplica", a contagem da
   * trilha já aparece menor aqui.
   */
  useFocusEffect(recarregar);

  if (!dados) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  const total = TRILHAS.reduce((soma, trilha) => soma + dados.contagem[trilha], 0);

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>{estabelecimento.nome}</Text>
      <Text style={estilos.subtitulo}>
        {total} exigências da RDC 216 se aplicam ao seu tipo de estabelecimento, separadas em
        três trilhas. Escolha uma para começar.
      </Text>

      {TRILHAS.map((trilha) => (
        <CartaoTrilha
          key={trilha}
          trilha={trilha}
          quantidade={dados.contagem[trilha]}
          emAndamento={dados.emAndamento[trilha]}
          verificacoes={dados.verificacoesRotina}
          prazo={dados.prazos.find((prazo) => prazo.trilha === trilha)}
          aoAbrir={(modo) => router.push(`/inspecao?trilha=${trilha}&modo=${modo}`)}
        />
      ))}

      <ItensOcultos
        ocultos={dados.ocultos}
        aoReexibir={(item) => {
          Alert.alert(
            'Voltar a exibir?',
            `O item ${item.codigo_rdc} volta a aparecer no checklist deste estabelecimento.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Voltar a exibir',
                onPress: () => {
                  reexibirItem(estabelecimento.id, item.item_id);
                  recarregar();
                },
              },
            ],
          );
        }}
      />
    </ScrollView>
  );
}

/**
 * O cartão de uma trilha.
 *
 * A diária é a única que oferece DOIS botões, porque é a única que se
 * repete todo dia. No modo Rotina, os mesmos itens da norma são
 * apresentados como verificações agrupadas, em linguagem operacional —
 * responder 11 perguntas é viável numa cozinha em operação; percorrer
 * 32 enunciados da RDC, não. O modo Completo continua ali para quem
 * quiser conferir exigência por exigência.
 */
function CartaoTrilha({
  trilha,
  quantidade,
  verificacoes,
  emAndamento,
  prazo,
  aoAbrir,
}: {
  trilha: Trilha;
  quantidade: number;
  verificacoes: number;
  emAndamento: ResumoInspecao | undefined;
  prazo: StatusTrilha | undefined;
  aoAbrir: (modo: ModoInspecao) => void;
}) {
  const vazia = quantidade === 0;
  const doisModos = trilha === 'diario' && verificacoes > 0;

  const corpo = (
    <>
      <View style={estilos.cartaoTopo}>
        <Text style={estilos.cartaoTitulo}>{ROTULO_TRILHA[trilha]}</Text>
        <View style={estilos.contador}>
          <Text style={estilos.contadorTexto}>{quantidade}</Text>
        </View>
        {doisModos ? null : (
          <Ionicons name="chevron-forward" size={20} color={Cores.textoSuave} />
        )}
      </View>

      <Text style={estilos.cartaoDescricao}>{DESCRICAO_TRILHA[trilha]}</Text>

      {/* O prazo (RF05) fica no cartão da trilha porque é aqui que ele
          se resolve: ver que venceu e começar a inspeção é o mesmo
          toque. */}
      {prazo ? (
        <View style={estilos.prazoLinha}>
          <View style={[estilos.prazoSelo, estiloDoPrazo[prazo.situacao]]}>
            <Text style={[estilos.prazoTexto, estiloTextoDoPrazo[prazo.situacao]]}>
              {textoVencimento(prazo)}
            </Text>
          </View>
          <Text style={estilos.prazoDetalhe}>{textoUltimaConclusao(prazo)}</Text>
        </View>
      ) : null}

      {emAndamento ? (
        <View style={estilos.faixaAndamento}>
          <Ionicons name="play-circle-outline" size={14} color={Cores.sobrePrimaria} />
          <Text style={estilos.faixaAndamentoTexto}>
            Em andamento desde {formatarDataHora(emAndamento.data_inicio)} ·{' '}
            {emAndamento.respondidos} respondidos
          </Text>
        </View>
      ) : null}
    </>
  );

  // Com dois modos o cartão inteiro não pode ser clicável: cada botão
  // leva a um recorte diferente do mesmo checklist.
  if (doisModos) {
    return (
      <View style={[estilos.cartao, emAndamento ? estilos.cartaoEmAndamento : null]}>
        {corpo}

        <View style={estilos.modos}>
          <Pressable
            style={({ pressed }) => [
              estilos.botaoModo,
              estilos.botaoModoPrincipal,
              pressed && estilos.pressionado,
            ]}
            onPress={() => aoAbrir('rotina')}
            accessibilityRole="button"
          >
            <Text style={estilos.botaoModoPrincipalTexto}>Rotina · {verificacoes}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [estilos.botaoModo, pressed && estilos.pressionado]}
            onPress={() => aoAbrir('completa')}
            accessibilityRole="button"
          >
            <Text style={estilos.botaoModoTexto}>Completa · {quantidade}</Text>
          </Pressable>
        </View>

        <Text style={estilos.notaModo}>
          A rotina reúne as {quantidade} exigências diárias em {verificacoes} verificações, na
          ordem do expediente e com os artigos da RDC citados em cada uma.
        </Text>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [
        estilos.cartao,
        emAndamento && estilos.cartaoEmAndamento,
        pressed && estilos.cartaoPressionado,
        vazia && estilos.cartaoDesabilitado,
      ]}
      onPress={() => aoAbrir('completa')}
      disabled={vazia}
      accessibilityRole="button"
    >
      {corpo}
    </Pressable>
  );
}

function ItensOcultos({
  ocultos,
  aoReexibir,
}: {
  ocultos: ItemOculto[];
  aoReexibir: (item: ItemOculto) => void;
}) {
  // Começa fechada: é informação de revisão, não do dia a dia.
  const [aberta, setAberta] = useState(false);

  if (ocultos.length === 0) return null;

  return (
    <View style={estilos.ocultos}>
      <Pressable
        style={estilos.ocultosCabecalho}
        onPress={() => setAberta((valor) => !valor)}
        accessibilityRole="button"
      >
        <Ionicons name="eye-off-outline" size={16} color={Cores.textoSecundario} />
        <Text style={estilos.ocultosTitulo}>
          {ocultos.length} {ocultos.length === 1 ? 'item marcado' : 'itens marcados'} como “não
          se aplica”
        </Text>
        <Ionicons
          name={aberta ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={Cores.textoSuave}
        />
      </Pressable>

      {aberta
        ? ocultos.map((item) => (
            <View key={item.item_id} style={estilos.ocultoItem}>
              <Text style={estilos.ocultoCodigo}>
                {item.codigo_rdc} · {item.categoria_nome}
              </Text>
              <Text style={estilos.ocultoTexto} numberOfLines={3}>
                {item.texto}
              </Text>
              <Pressable
                style={estilos.ocultoBotao}
                onPress={() => aoReexibir(item)}
                accessibilityRole="button"
              >
                <Ionicons name="eye-outline" size={14} color={Cores.primariaTexto} />
                <Text style={estilos.ocultoBotaoTexto}>Voltar a exibir</Text>
              </Pressable>
            </View>
          ))
        : null}
    </View>
  );
}

/** Cor do selo de prazo, por situação. */
const estiloDoPrazo = StyleSheet.create({
  em_dia: { backgroundColor: Cores.primariaClara },
  vence_em_breve: { backgroundColor: Cores.fundo, borderWidth: 1, borderColor: Cores.borda },
  vencida: { backgroundColor: Cores.acentoSuave },
  nunca_feita: { backgroundColor: Cores.fundo, borderWidth: 1, borderColor: Cores.borda },
});

const estiloTextoDoPrazo = StyleSheet.create({
  em_dia: { color: Cores.sobrePrimaria },
  vence_em_breve: { color: Cores.texto },
  vencida: { color: Cores.acentoForte },
  nunca_feita: { color: Cores.textoSecundario },
});

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 40 },
  centro: {
    flex: 1,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aviso: { fontSize: 14, color: Cores.textoSuave },

  titulo: { fontSize: 22, fontWeight: '700', color: Cores.texto },
  subtitulo: {
    fontSize: 14,
    lineHeight: 21,
    color: Cores.textoSecundario,
    marginTop: 6,
    marginBottom: 18,
  },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  cartaoEmAndamento: { borderColor: Cores.primaria },
  cartaoPressionado: { backgroundColor: Cores.fundo },
  cartaoDesabilitado: { opacity: 0.5 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartaoTitulo: { flex: 1, fontSize: 16, fontWeight: '700', color: Cores.texto },
  contador: {
    backgroundColor: Cores.primariaClara,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contadorTexto: { fontSize: 12, fontWeight: '700', color: Cores.sobrePrimaria },
  cartaoDescricao: { fontSize: 13, lineHeight: 20, color: Cores.textoSecundario, marginTop: 6 },
  prazoLinha: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  prazoSelo: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  prazoTexto: { fontSize: 12, fontWeight: '700' },
  prazoDetalhe: { fontSize: 12, color: Cores.textoSuave },

  faixaAndamento: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Cores.primariaClara,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  faixaAndamentoTexto: { flex: 1, fontSize: 12, color: Cores.sobrePrimaria },

  modos: { flexDirection: 'row', gap: 8, marginTop: 14 },
  botaoModo: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.fundo,
  },
  botaoModoPrincipal: { backgroundColor: Cores.primaria, borderColor: Cores.primaria },
  botaoModoPrincipalTexto: { fontSize: 14, fontWeight: '700', color: Cores.sobrePrimaria },
  botaoModoTexto: { fontSize: 14, fontWeight: '600', color: Cores.textoSecundario },
  pressionado: { opacity: 0.75 },
  notaModo: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 10 },

  ocultos: {
    marginTop: 14,
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Cores.borda,
    overflow: 'hidden',
  },
  ocultosCabecalho: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  ocultosTitulo: { flex: 1, fontSize: 13, fontWeight: '600', color: Cores.textoSecundario },
  ocultoItem: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: Cores.divisor,
    paddingTop: 12,
  },
  ocultoCodigo: { fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  ocultoTexto: { fontSize: 13, lineHeight: 19, color: Cores.textoSecundario, marginTop: 4 },
  ocultoBotao: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  ocultoBotaoTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },
});
