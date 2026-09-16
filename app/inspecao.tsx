/**
 * app/inspecao.tsx
 * ---------------------------------------------------------------
 * Rota "/inspecao" — a porta de entrada das inspeções que NÃO são a
 * rotina diária de hoje.
 *
 * A execução em si mora em `components/ExecucaoInspecao.tsx`, porque
 * tem dois donos: esta rota e a aba Hoje. Aqui ficou só o que é da
 * ROTA — ler e validar os parâmetros.
 *
 * A ROTA RECEBE A TRILHA POR PARÂMETRO: "/inspecao?trilha=periodico".
 * É esse parâmetro que faz uma única tela servir às três trilhas. Quem
 * a abre é o seletor de trilhas (`/nova-inspecao`), que desde o
 * redesenho é uma folha modal, e não mais uma aba.
 *
 * A diária também pode chegar aqui — pelo modo COMPLETO, escolhido na
 * folha antes de o dia começar. No modo rotina ela vive na aba Hoje.
 *
 * Sobre parâmetros de rota no expo-router: `useLocalSearchParams()` lê
 * o que veio depois do "?" na URL. Como qualquer coisa pode chegar ali
 * (inclusive nada), validamos antes de usar.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { ExecucaoInspecao } from '../components/ExecucaoInspecao';
import { TRILHAS, type ModoInspecao } from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';

export default function TelaInspecao() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  const carregado = useEstabelecimento((estado) => estado.carregado);
  const parametros = useLocalSearchParams<{ trilha?: string; modo?: string }>();

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

  // O parâmetro é texto livre; só seguimos se for uma das três trilhas.
  const trilha = TRILHAS.find((t) => t === parametros.trilha);
  if (!trilha) {
    return <Redirect href="/nova-inspecao" />;
  }

  // O modo só faz sentido na diária; nas outras trilhas é sempre completa.
  const modo: ModoInspecao =
    trilha === 'diario' && parametros.modo === 'rotina' ? 'rotina' : 'completa';

  return (
    // A `key` faz o React tratar cada combinação como uma tela nova. Sem
    // ela, trocar de trilha ou de modo reaproveitaria o componente — e
    // com ele a lista de itens já carregada.
    <ExecucaoInspecao
      key={`${trilha}-${modo}`}
      estabelecimento={estabelecimento}
      trilha={trilha}
      modo={modo}
    />
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aviso: { fontSize: 14, color: Cores.textoSuave },
});
