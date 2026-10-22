/**
 * components/PendenciasPorEtapa.tsx
 * ---------------------------------------------------------------
 * O cartão das PENDÊNCIAS da diária, separadas por etapa do expediente
 * (pedido do orientador, entrega 2).
 *
 * É o "mapa" do horário: mostra EM QUE HORA do dia as verificações se
 * perdem. Três linhas fixas, na ordem do expediente, mesmo com zero —
 * "0 no fechamento" também é informação.
 *
 * Só desenha. As contas vêm prontas de `db/consultas.ts`
 * (`pendenciasDaDiaria`, `pendenciasDoPeriodo`), e a regra mora em
 * `db/pendencia.ts`. Usado na tela de resultado (um dia) e na aba
 * Conformidade (últimos 30 dias).
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { MomentoDia, Pendencias } from '../db/consultas';
import Cores from '../theme/cores';
import { ROTULO_ETAPA, textoPendencias } from '../theme/rotulos';

const ETAPAS: MomentoDia[] = ['abertura', 'servico', 'fechamento'];

export default function PendenciasPorEtapa({
  pendencias,
  titulo,
  nota,
}: {
  pendencias: Pendencias;
  titulo: string;
  /** A frase de contexto embaixo das linhas. */
  nota: string;
}) {
  const nenhuma = pendencias.total === 0;
  // A barra de cada etapa é proporcional à MAIOR, e não ao total: o que
  // interessa é comparar as etapas entre si.
  const maior = Math.max(1, ...ETAPAS.map((etapa) => pendencias.porEtapa[etapa]));

  return (
    <View style={estilos.cartao}>
      <View style={estilos.linhaTitulo}>
        <Ionicons
          name={nenhuma ? 'checkmark-done-outline' : 'time-outline'}
          size={18}
          color={nenhuma ? Cores.primariaTexto : Cores.acentoTexto}
        />
        <Text style={estilos.titulo}>{titulo}</Text>
        <Text style={[estilos.total, nenhuma && estilos.totalZero]}>
          {nenhuma ? 'nenhuma' : textoPendencias(pendencias.total)}
        </Text>
      </View>

      {ETAPAS.map((etapa) => {
        const quantidade = pendencias.porEtapa[etapa];
        return (
          <View key={etapa} style={estilos.etapa}>
            <Text style={estilos.etapaNome}>{ROTULO_ETAPA[etapa]}</Text>
            <View style={estilos.barra}>
              <View
                style={[estilos.barraPreenchida, { width: `${(quantidade / maior) * 100}%` }]}
              />
            </View>
            <Text style={[estilos.etapaValor, quantidade === 0 && estilos.totalZero]}>
              {quantidade}
            </Text>
          </View>
        );
      })}

      <Text style={estilos.nota}>{nota}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  titulo: { flex: 1, fontSize: 15, fontWeight: '700', color: Cores.texto },
  total: { fontSize: 15, fontWeight: '700', color: Cores.acentoTexto },
  totalZero: { color: Cores.textoSuave },

  etapa: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  etapaNome: { width: 128, fontSize: 13, color: Cores.textoSecundario },
  barra: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: Cores.borda,
    overflow: 'hidden',
  },
  barraPreenchida: { height: 8, backgroundColor: Cores.acento },
  etapaValor: {
    width: 24,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: Cores.acentoTexto,
  },

  nota: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 12 },
});
