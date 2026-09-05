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
  listarInspecoes,
  listarItensOcultos,
  reexibirItem,
  TRILHAS,
  type Estabelecimento,
  type ItemOculto,
  type ResumoInspecao,
  type Trilha,
} from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import { DESCRICAO_TRILHA, formatarDataHora, ROTULO_TRILHA } from '../theme/rotulos';

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
  emAndamento: Partial<Record<Trilha, ResumoInspecao>>;
  ocultos: ItemOculto[];
}

function Trilhas({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);

  const recarregar = useCallback(() => {
    const emAndamento: Partial<Record<Trilha, ResumoInspecao>> = {};
    for (const inspecao of listarInspecoes(estabelecimento.id)) {
      // A lista vem da mais recente para a mais antiga, então a primeira
      // em andamento de cada trilha é a que deve ser retomada.
      if (inspecao.status === 'em_andamento' && !emAndamento[inspecao.trilha]) {
        emAndamento[inspecao.trilha] = inspecao;
      }
    }

    setDados({
      contagem: contarItensPorTrilha(estabelecimento.perfil_id, estabelecimento.id),
      emAndamento,
      ocultos: listarItensOcultos(estabelecimento.id),
    });
  }, [estabelecimento.id, estabelecimento.perfil_id]);

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
          aoAbrir={() => router.push(`/inspecao?trilha=${trilha}`)}
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

function CartaoTrilha({
  trilha,
  quantidade,
  emAndamento,
  aoAbrir,
}: {
  trilha: Trilha;
  quantidade: number;
  emAndamento: ResumoInspecao | undefined;
  aoAbrir: () => void;
}) {
  const vazia = quantidade === 0;

  return (
    <Pressable
      style={({ pressed }) => [
        estilos.cartao,
        emAndamento && estilos.cartaoEmAndamento,
        pressed && estilos.cartaoPressionado,
        vazia && estilos.cartaoDesabilitado,
      ]}
      onPress={aoAbrir}
      disabled={vazia}
      accessibilityRole="button"
    >
      <View style={estilos.cartaoTopo}>
        <Text style={estilos.cartaoTitulo}>{ROTULO_TRILHA[trilha]}</Text>
        <View style={estilos.contador}>
          <Text style={estilos.contadorTexto}>{quantidade}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Cores.textoSuave} />
      </View>

      <Text style={estilos.cartaoDescricao}>{DESCRICAO_TRILHA[trilha]}</Text>

      {emAndamento ? (
        <View style={estilos.faixaAndamento}>
          <Ionicons name="play-circle-outline" size={14} color={Cores.sobrePrimaria} />
          <Text style={estilos.faixaAndamentoTexto}>
            Em andamento desde {formatarDataHora(emAndamento.data_inicio)} ·{' '}
            {emAndamento.respondidos} respondidos
          </Text>
        </View>
      ) : null}
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
