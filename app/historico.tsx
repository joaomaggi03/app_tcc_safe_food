/**
 * app/historico.tsx
 * ---------------------------------------------------------------
 * Tela HISTÓRICO — rota "/historico".
 *
 * Lista as inspeções deste estabelecimento, da mais recente para a mais
 * antiga, lendo do SQLite local — funciona sem internet.
 *
 * Cada linha traz o score da inspeção (RF04) e o resultado dos itens
 * críticos. Tocar numa inspeção concluída abre a tela de resultado, com
 * o detalhamento por categoria.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listarInspecoes, type Estabelecimento, type ResumoInspecao } from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  faixaDoScore,
  formatarDataHora,
  ROTULO_MODO,
  ROTULO_TRILHA,
  textoScore,
} from '../theme/rotulos';

export default function TelaHistorico() {
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

  return <Lista estabelecimento={estabelecimento} />;
}

function Lista({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [inspecoes, setInspecoes] = useState<ResumoInspecao[] | null>(null);

  // Relê ao voltar para a aba: é assim que a inspeção que você acabou
  // de concluir aparece no topo.
  useFocusEffect(
    useCallback(() => {
      setInspecoes(listarInspecoes(estabelecimento.id));
    }, [estabelecimento.id]),
  );

  if (!inspecoes) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  if (inspecoes.length === 0) {
    return (
      <View style={estilos.centro}>
        <Ionicons name="time-outline" size={40} color={Cores.textoSuave} />
        <Text style={estilos.vazioTitulo}>Nenhuma inspeção ainda</Text>
        <Text style={estilos.vazioTexto}>
          As inspeções que você preencher aparecem aqui, com data e resultado.
        </Text>
        <Pressable
          style={estilos.vazioBotao}
          onPress={() => router.push('/nova-inspecao')}
          accessibilityRole="button"
        >
          <Text style={estilos.vazioBotaoTexto}>Começar uma inspeção</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      style={estilos.tela}
      contentContainerStyle={estilos.conteudo}
      data={inspecoes}
      keyExtractor={(inspecao) => String(inspecao.id)}
      ListHeaderComponent={
        <Text style={estilos.subtitulo}>
          {inspecoes.length} {inspecoes.length === 1 ? 'inspeção' : 'inspeções'} em{' '}
          {estabelecimento.nome}
        </Text>
      }
      renderItem={({ item }) => (
        <Linha
          inspecao={item}
          aoAbrir={
            item.status === 'concluida'
              ? () => router.push(`/resultado?id=${item.id}`)
              : undefined
          }
        />
      )}
    />
  );
}

function Linha({
  inspecao,
  aoAbrir,
}: {
  inspecao: ResumoInspecao;
  aoAbrir?: () => void;
}) {
  const concluida = inspecao.status === 'concluida';
  // Numa inspeção concluída, a data que interessa é a do fechamento.
  const data = inspecao.data_conclusao ?? inspecao.data_inicio;
  const faixa = faixaDoScore(inspecao.score.valor);

  // Uma inspeção em andamento não mostra score: a nota parcial de um
  // checklist pela metade não significa nada, e induziria a erro.
  const mostrarScore = concluida && inspecao.score.valor !== null;
  const criticosComFalha = inspecao.score.criticosAvaliados - inspecao.score.criticosAdequados;

  return (
    <Pressable
      style={({ pressed }) => [estilos.cartao, pressed && aoAbrir ? estilos.pressionado : null]}
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityRole={aoAbrir ? 'button' : undefined}
    >
      <View style={estilos.cartaoTopo}>
        <View style={estilos.flex}>
          <Text style={estilos.trilha}>
            {ROTULO_TRILHA[inspecao.trilha]}
            {inspecao.trilha === 'diario' ? ` · ${ROTULO_MODO[inspecao.modo]}` : ''}
          </Text>
          <Text style={estilos.data}>{formatarDataHora(data)}</Text>
        </View>

        {mostrarScore ? (
          <View style={[estilos.selo, estiloDaFaixa[faixa]]}>
            <Text style={[estilos.seloTexto, estiloTextoDaFaixa[faixa]]}>
              {textoScore(inspecao.score.valor)}
            </Text>
          </View>
        ) : (
          <View style={[estilos.status, concluida ? estilos.statusConcluida : estilos.statusAberta]}>
            <Text style={concluida ? estilos.statusConcluidaTexto : estilos.statusAbertaTexto}>
              {concluida ? 'sem avaliação' : 'em andamento'}
            </Text>
          </View>
        )}
      </View>

      <View style={estilos.numeros}>
        <Numero rotulo="respondidos" valor={inspecao.respondidos} />
        <Numero rotulo="adequados" valor={inspecao.score.adequados} cor={Cores.primariaTexto} />
        <Numero rotulo="inadequados" valor={inspecao.score.inadequados} cor={Cores.acentoTexto} />
        {inspecao.score.criticosAvaliados > 0 ? (
          <Numero
            rotulo="críticos ok"
            valor={`${inspecao.score.criticosAdequados}/${inspecao.score.criticosAvaliados}`}
            cor={criticosComFalha > 0 ? Cores.acentoTexto : Cores.primariaTexto}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function Numero({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: number | string;
  cor?: string;
}) {
  return (
    <View style={estilos.numero}>
      <Text style={[estilos.numeroValor, cor ? { color: cor } : null]}>{valor}</Text>
      <Text style={estilos.numeroRotulo}>{rotulo}</Text>
    </View>
  );
}

/** Fundo e cor do selo do score, por faixa (ver theme/rotulos.ts). */
const estiloDaFaixa = StyleSheet.create({
  bom: { backgroundColor: Cores.primariaClara },
  atencao: { backgroundColor: Cores.fundo },
  ruim: { backgroundColor: Cores.acentoSuave },
  sem_dados: { backgroundColor: Cores.fundo },
});

const estiloTextoDaFaixa = StyleSheet.create({
  bom: { color: Cores.sobrePrimaria },
  atencao: { color: Cores.texto },
  ruim: { color: Cores.acentoForte },
  sem_dados: { color: Cores.textoSuave },
});

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 40 },
  centro: {
    flex: 1,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  aviso: { fontSize: 14, color: Cores.textoSuave },

  vazioTitulo: { fontSize: 17, fontWeight: '700', color: Cores.texto, marginTop: 12 },
  vazioTexto: {
    fontSize: 14,
    lineHeight: 21,
    color: Cores.textoSecundario,
    textAlign: 'center',
    marginTop: 6,
  },
  vazioBotao: {
    backgroundColor: Cores.primaria,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 18,
  },
  vazioBotaoTexto: { fontSize: 14, fontWeight: '700', color: Cores.sobrePrimaria },

  subtitulo: { fontSize: 14, color: Cores.textoSecundario, marginBottom: 14 },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  pressionado: { backgroundColor: Cores.fundo },
  trilha: { fontSize: 16, fontWeight: '700', color: Cores.texto },
  selo: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  seloTexto: { fontSize: 18, fontWeight: '700' },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusConcluida: { backgroundColor: Cores.primariaClara },
  statusConcluidaTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimaria },
  statusAberta: { backgroundColor: Cores.fundo },
  statusAbertaTexto: { fontSize: 11, fontWeight: '600', color: Cores.textoSecundario },

  data: { fontSize: 13, color: Cores.textoSuave, marginTop: 2 },

  numeros: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginTop: 12 },
  numero: {},
  numeroValor: { fontSize: 18, fontWeight: '700', color: Cores.texto },
  numeroRotulo: { fontSize: 11, color: Cores.textoSuave },
});
