/**
 * app/plano-acao.tsx
 * ---------------------------------------------------------------
 * O PLANO DE AÇÃO CORRETIVA (RF07) — rota "/plano-acao".
 *
 * Responde "o que eu ainda tenho que consertar?". É a continuação do
 * diagnóstico: ao concluir a inspeção, o app gera uma ação para cada item
 * inadequado, e aqui ficam elas — com o que fazer e até quando, que o
 * usuário pode ajustar.
 *
 * TRÊS BLOCOS, na ordem de atenção (a ordem vem de `ordenarAcoes`):
 *  - ATRASADAS, porque são as que já deviam ter sido feitas;
 *  - ABERTAS, as que ainda estão no prazo;
 *  - CONCLUÍDAS do último mês, para o usuário ver o que já resolveu.
 *
 * A SUGESTÃO DE CONCLUIR aparece quando o item saiu adequado numa
 * inspeção depois da criação da ação. O app só sugere: um "adequado"
 * numa diária rápida não prova que a obra foi feita, e quem sabe é o
 * usuário. O toque de concluir é sempre dele.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  concluirAcao,
  JANELA_CONCLUIDAS_DIAS,
  listarAcoes,
  type AcaoCorretiva,
  type Estabelecimento,
  type SituacaoAcao,
} from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import { formatarData, formatarDataHora, textoPrazoAcao } from '../theme/rotulos';

/** A cor da linha de prazo em cada situação. */
const COR_PRAZO: Record<SituacaoAcao, string> = {
  atrasada: Cores.acentoTexto,
  vence_hoje: Cores.texto,
  no_prazo: Cores.textoSecundario,
  concluida: Cores.primariaTexto,
};

export default function TelaPlanoAcao() {
  const estabelecimento = useEstabelecimento((estado) => estado.atual);
  if (!estabelecimento) return <Redirect href="/cadastro" />;
  return <Plano estabelecimento={estabelecimento} />;
}

function Plano({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [acoes, setAcoes] = useState<AcaoCorretiva[] | null>(null);

  const recarregar = useCallback(() => {
    setAcoes(listarAcoes(estabelecimento.id));
  }, [estabelecimento]);

  // Relido a cada foco: a ação pode ter sido criada no resultado de uma
  // inspeção, ou o item pode ter saído adequado numa diária de hoje.
  useFocusEffect(recarregar);

  if (!acoes) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  const atrasadas = acoes.filter((a) => a.situacao === 'atrasada');
  const abertas = acoes.filter((a) => a.situacao === 'vence_hoje' || a.situacao === 'no_prazo');
  const concluidas = acoes.filter((a) => a.situacao === 'concluida');

  function concluir(acao: AcaoCorretiva) {
    concluirAcao(acao.id);
    recarregar();
  }

  function editar(acao: AcaoCorretiva) {
    router.push(`/acao?item=${encodeURIComponent(acao.item_id)}&origem=plano`);
  }

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      {acoes.length === 0 ? (
        <View style={estilos.cartao}>
          <View style={estilos.linhaTitulo}>
            <Ionicons name="clipboard-outline" size={20} color={Cores.textoSecundario} />
            <Text style={estilos.tituloCartao}>Nenhuma ação no plano</Text>
          </View>
          <Text style={estilos.nota}>
            Ao concluir uma inspeção, o app cria uma ação corretiva para cada item marcado como
            inadequado, com um prazo sugerido. Elas aparecem aqui.
          </Text>
        </View>
      ) : null}

      <Bloco
        titulo="Atrasadas"
        acoes={atrasadas}
        aoConcluir={concluir}
        aoEditar={editar}
      />
      <Bloco titulo="Abertas" acoes={abertas} aoConcluir={concluir} aoEditar={editar} />
      <Bloco
        titulo={`Concluídas nos últimos ${JANELA_CONCLUIDAS_DIAS} dias`}
        acoes={concluidas}
        aoConcluir={concluir}
        aoEditar={editar}
      />
    </ScrollView>
  );
}

function Bloco({
  titulo,
  acoes,
  aoConcluir,
  aoEditar,
}: {
  titulo: string;
  acoes: AcaoCorretiva[];
  aoConcluir: (acao: AcaoCorretiva) => void;
  aoEditar: (acao: AcaoCorretiva) => void;
}) {
  if (acoes.length === 0) return null;

  return (
    <View style={estilos.bloco}>
      <Text style={estilos.tituloBloco}>
        {titulo} · {acoes.length}
      </Text>
      {acoes.map((acao) => (
        <CartaoAcao
          key={acao.id}
          acao={acao}
          aoConcluir={() => aoConcluir(acao)}
          aoEditar={() => aoEditar(acao)}
        />
      ))}
    </View>
  );
}

function CartaoAcao({
  acao,
  aoConcluir,
  aoEditar,
}: {
  acao: AcaoCorretiva;
  aoConcluir: () => void;
  aoEditar: () => void;
}) {
  const aberta = acao.status === 'aberta';
  // O resumo do item em uma linha: o primeiro tópico, ou o texto da norma.
  // Só aparece se o usuário reescreveu a ação — o texto gerado pelo app
  // já contém os tópicos, e repeti-los embaixo seria ruído.
  const resumo = acao.topicos[0] ?? acao.texto;
  const mostrarResumo = !acao.descricao.includes(resumo);

  return (
    <View style={[estilos.cartao, estilos.cartaoAcao, !aberta && estilos.cartaoConcluido]}>
      {/* A parte de cima abre a edição — só enquanto a ação está aberta. */}
      <Pressable
        onPress={aberta ? aoEditar : undefined}
        disabled={!aberta}
        style={({ pressed }) => pressed && estilos.pressionado}
        accessibilityRole={aberta ? 'button' : undefined}
        accessibilityHint={aberta ? 'Editar a ação' : undefined}
      >
        <View style={estilos.linhaSelos}>
          <Text style={estilos.codigo} numberOfLines={1}>
            {acao.codigo_rdc} · {acao.categoria_nome}
          </Text>
          {acao.critico === 1 ? (
            <View style={estilos.seloCritico}>
              <Text style={estilos.seloCriticoTexto}>Crítico</Text>
            </View>
          ) : null}
        </View>

        <Text style={[estilos.descricao, !aberta && estilos.descricaoConcluida]}>
          {acao.descricao}
        </Text>
        {mostrarResumo ? (
          <Text style={estilos.resumo} numberOfLines={2}>
            {resumo}
          </Text>
        ) : null}

        <Text style={[estilos.prazo, { color: COR_PRAZO[acao.situacao] }]}>
          {aberta
            ? textoPrazoAcao(acao)
            : `Concluída em ${formatarDataHora(acao.concluida_em ?? acao.criada_em)}`}
        </Text>
      </Pressable>

      {aberta && acao.adequado_em ? (
        <View style={estilos.sugestao}>
          <Ionicons name="checkmark-circle-outline" size={16} color={Cores.sobrePrimariaClara} />
          <Text style={estilos.sugestaoTexto}>
            O item saiu adequado na inspeção de {formatarData(acao.adequado_em)}. Se a correção
            foi feita, conclua a ação.
          </Text>
        </View>
      ) : null}

      {aberta ? (
        <Pressable
          onPress={aoConcluir}
          style={({ pressed }) => [estilos.botaoConcluir, pressed && estilos.pressionado]}
          accessibilityRole="button"
        >
          <Ionicons name="checkmark" size={16} color={Cores.primariaTexto} />
          <Text style={estilos.botaoConcluirTexto}>Concluir</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: 20, paddingBottom: 40 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: { fontSize: 14, color: Cores.textoSuave },

  bloco: { marginBottom: 12 },
  tituloBloco: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Cores.textoSuave,
    marginBottom: 8,
    marginTop: 8,
  },

  cartao: { backgroundColor: Cores.superficie, borderRadius: 14, padding: 16 },
  cartaoAcao: { marginBottom: 10 },
  cartaoConcluido: { opacity: 0.75 },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tituloCartao: { fontSize: 16, fontWeight: '700', color: Cores.texto },
  nota: { fontSize: 13, lineHeight: 20, color: Cores.textoSecundario, marginTop: 8 },

  linhaSelos: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codigo: { flex: 1, fontSize: 12, fontWeight: '700', color: Cores.textoSecundario },
  seloCritico: {
    backgroundColor: Cores.acentoSuave,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seloCriticoTexto: { fontSize: 11, fontWeight: '700', color: Cores.acentoForte },

  descricao: { fontSize: 15, fontWeight: '700', lineHeight: 21, color: Cores.texto, marginTop: 8 },
  descricaoConcluida: { textDecorationLine: 'line-through', color: Cores.textoSecundario },
  resumo: { fontSize: 13, lineHeight: 19, color: Cores.textoSecundario, marginTop: 4 },
  prazo: { fontSize: 13, fontWeight: '700', marginTop: 8 },

  sugestao: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: Cores.primariaClara,
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  sugestaoTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: Cores.sobrePrimariaClara },

  botaoConcluir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Cores.primaria,
  },
  botaoConcluirTexto: { fontSize: 14, fontWeight: '700', color: Cores.primariaTexto },
  pressionado: { opacity: 0.7 },
});
