/**
 * app/nova-inspecao.tsx
 * ---------------------------------------------------------------
 * Rota "/nova-inspecao" — a FOLHA de nova inspeção.
 *
 * Era uma aba. Deixou de ser: como aba, ela duplicava o cartão de
 * prazos do Início (as mesmas três trilhas, com o mesmo selo de
 * vencimento), de modo que escolher "diária" no Início levava a uma
 * tela que pedia para escolher entre diária, periódica e semestral de
 * novo. Um menu apontando para outro menu.
 *
 * Agora é uma AÇÃO, aberta pelo "+" da aba Hoje, e existe por um motivo
 * só: começar a auditoria periódica ou a semestral fora de hora. O caso
 * comum — a rotina do dia — não passa por aqui.
 *
 * A DIÁRIA NÃO TEM BOTÃO DE COMEÇAR AQUI. Ela vive na aba Hoje, e o
 * modo (Rotina ou Completa) se escolhe lá, no cartão de abertura. Dois
 * lugares oferecendo o mesmo começo é exatamente o que este redesenho
 * foi feito para tirar — então este cartão informa o estado do dia e
 * leva para lá.
 *
 * Os itens ocultos do RF09, que moravam no rodapé desta tela, foram
 * para a aba Estabelecimento: são configuração, não ação.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  contarItensPorTrilha,
  diaLocalISO,
  listarInspecoes,
  TRILHAS,
  type Estabelecimento,
  type ResumoInspecao,
  type Trilha,
} from '../db/consultas';
import { statusDasTrilhas, type SituacaoTrilha, type StatusTrilha } from '../db/periodicidade';
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
  /** A inspeção aberta de cada trilha, se houver. */
  emAndamento: Partial<Record<Trilha, ResumoInspecao>>;
  /** A diária de hoje já concluída — só ela trava o cartão da diária. */
  diariaConcluida: ResumoInspecao | null;
  prazos: StatusTrilha[];
}

function Trilhas({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);

  const recarregar = useCallback(() => {
    const hoje = diaLocalISO();
    const emAndamento: Partial<Record<Trilha, ResumoInspecao>> = {};
    let diariaConcluida: ResumoInspecao | null = null;

    for (const inspecao of listarInspecoes(estabelecimento.id)) {
      if (inspecao.trilha === 'diario' && inspecao.dia_local !== hoje) continue;

      if (inspecao.status === 'concluida') {
        if (inspecao.trilha === 'diario' && !diariaConcluida) diariaConcluida = inspecao;
        continue;
      }

      // A lista vem da mais recente para a mais antiga, então a primeira
      // em andamento de cada trilha é a que será retomada.
      if (!emAndamento[inspecao.trilha]) emAndamento[inspecao.trilha] = inspecao;
    }

    setDados({
      contagem: contarItensPorTrilha(estabelecimento.perfil_id, estabelecimento.id),
      emAndamento,
      diariaConcluida,
      prazos: statusDasTrilhas(estabelecimento),
    });
  }, [estabelecimento]);

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
      <Text style={estilos.subtitulo}>
        {total} exigências da RDC 216 se aplicam ao seu tipo de estabelecimento, separadas em
        três trilhas.
      </Text>

      {TRILHAS.map((trilha) => (
        <CartaoTrilha
          key={trilha}
          trilha={trilha}
          quantidade={dados.contagem[trilha]}
          emAndamento={dados.emAndamento[trilha]}
          diariaConcluida={trilha === 'diario' ? dados.diariaConcluida : null}
          prazo={dados.prazos.find((prazo) => prazo.trilha === trilha)}
          aoAbrir={() =>
            trilha === 'diario'
              ? router.replace('/')
              : router.replace(`/inspecao?trilha=${trilha}`)
          }
        />
      ))}
    </ScrollView>
  );
}

/**
 * O cartão de uma trilha.
 *
 * O cartão inteiro é o toque — não há mais botões por dentro. Desde que
 * a diária passou a morar na aba Hoje, nenhuma trilha tem duas portas
 * daqui: ou se abre a inspeção, ou se vai para o lugar onde ela vive.
 */
function CartaoTrilha({
  trilha,
  quantidade,
  emAndamento,
  diariaConcluida,
  prazo,
  aoAbrir,
}: {
  trilha: Trilha;
  quantidade: number;
  emAndamento: ResumoInspecao | undefined;
  diariaConcluida: ResumoInspecao | null;
  prazo: StatusTrilha | undefined;
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

      {diariaConcluida ? (
        <View style={estilos.faixaConcluida}>
          <Ionicons name="checkmark-circle" size={14} color={Cores.primariaTexto} />
          <Text style={estilos.faixaConcluidaTexto}>
            Concluída hoje · {diariaConcluida.respondidos} respondidos
          </Text>
        </View>
      ) : null}

      {trilha === 'diario' ? (
        <Text style={estilos.notaDiaria}>
          A diária é preenchida na aba Hoje, onde também se escolhe entre Rotina e Completa.
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Fundo do selo de vencimento, por situação (ver db/vencimento.ts). */
const estiloDoPrazo = StyleSheet.create({
  em_dia: { backgroundColor: Cores.primariaClara },
  vence_em_breve: { backgroundColor: Cores.fundo },
  vencida: { backgroundColor: Cores.acentoSuave },
  nunca_feita: { backgroundColor: Cores.fundo },
}) as Record<SituacaoTrilha, object>;

const estiloTextoDoPrazo = StyleSheet.create({
  em_dia: { color: Cores.sobrePrimaria },
  vence_em_breve: { color: Cores.textoSecundario },
  vencida: { color: Cores.acentoForte },
  nunca_feita: { color: Cores.textoSuave },
}) as Record<SituacaoTrilha, object>;

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

  subtitulo: {
    fontSize: 14,
    lineHeight: 21,
    color: Cores.textoSecundario,
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

  prazoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
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
  faixaConcluida: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Cores.fundo,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  faixaConcluidaTexto: { flex: 1, fontSize: 12, color: Cores.textoSecundario },

  notaDiaria: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 10 },
});
