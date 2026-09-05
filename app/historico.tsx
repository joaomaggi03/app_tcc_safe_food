/**
 * app/historico.tsx
 * ---------------------------------------------------------------
 * Tela HISTÓRICO — rota "/historico".
 *
 * Lista as inspeções deste estabelecimento, da mais recente para a mais
 * antiga, lendo do SQLite local — funciona sem internet.
 *
 * Nesta fase cada linha mostra dado bruto: quantos itens foram
 * respondidos, quantos adequados e quantos inadequados. Transformar isso
 * em SCORE de conformidade (com peso e item crítico) é a Fase 4.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listarInspecoes, type Estabelecimento, type ResumoInspecao } from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import { formatarDataHora, ROTULO_TRILHA } from '../theme/rotulos';

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
      renderItem={({ item }) => <Linha inspecao={item} />}
    />
  );
}

function Linha({ inspecao }: { inspecao: ResumoInspecao }) {
  const concluida = inspecao.status === 'concluida';
  // Numa inspeção concluída, a data que interessa é a do fechamento.
  const data = inspecao.data_conclusao ?? inspecao.data_inicio;

  return (
    <View style={estilos.cartao}>
      <View style={estilos.cartaoTopo}>
        <Text style={estilos.trilha}>{ROTULO_TRILHA[inspecao.trilha]}</Text>
        <View style={[estilos.status, concluida ? estilos.statusConcluida : estilos.statusAberta]}>
          <Text style={concluida ? estilos.statusConcluidaTexto : estilos.statusAbertaTexto}>
            {concluida ? 'concluída' : 'em andamento'}
          </Text>
        </View>
      </View>

      <Text style={estilos.data}>{formatarDataHora(data)}</Text>

      <View style={estilos.numeros}>
        <Numero rotulo="respondidos" valor={inspecao.respondidos} />
        <Numero rotulo="adequados" valor={inspecao.adequados} cor={Cores.primariaTexto} />
        <Numero rotulo="inadequados" valor={inspecao.inadequados} cor={Cores.acentoTexto} />
      </View>
    </View>
  );
}

function Numero({ rotulo, valor, cor }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <View style={estilos.numero}>
      <Text style={[estilos.numeroValor, cor ? { color: cor } : null]}>{valor}</Text>
      <Text style={estilos.numeroRotulo}>{rotulo}</Text>
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
  trilha: { flex: 1, fontSize: 16, fontWeight: '700', color: Cores.texto },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusConcluida: { backgroundColor: Cores.primariaClara },
  statusConcluidaTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimaria },
  statusAberta: { backgroundColor: Cores.fundo },
  statusAbertaTexto: { fontSize: 11, fontWeight: '600', color: Cores.textoSecundario },

  data: { fontSize: 13, color: Cores.textoSuave, marginTop: 4 },

  numeros: { flexDirection: 'row', gap: 24, marginTop: 12 },
  numero: {},
  numeroValor: { fontSize: 18, fontWeight: '700', color: Cores.texto },
  numeroRotulo: { fontSize: 11, color: Cores.textoSuave },
});
