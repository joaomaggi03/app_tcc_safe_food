/**
 * app/conformidade.tsx
 * ---------------------------------------------------------------
 * Aba CONFORMIDADE — rota "/conformidade".
 *
 * Responde "como estou?". Junta o que antes eram dois lugares: o cartão
 * de conformidade do Início (as quatro leituras) e a tela de Histórico.
 * Estavam separados sem motivo — as quatro leituras SÃO um resumo do
 * histórico, e quem olha uma quer a outra logo abaixo.
 *
 * AS QUATRO LEITURAS NÃO VIRAM UMA MÉDIA. O porquê está em
 * `painelInicio()`, no db/consultas.ts: num mês há ~26 diárias contra
 * UMA auditoria, e qualquer média entre elas seria dominada pelas
 * diárias, escondendo justamente a auditoria — que é a parte da norma
 * que a fiscalização olha.
 *
 * O HISTÓRICO É SEPARADO POR TRILHA, pelo mesmo motivo. Numa lista
 * corrida, as diárias do mês empurram a única auditoria para fora da
 * tela; separadas, cada trilha tem a sua própria linha do tempo.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  listarInspecoes,
  painelInicio,
  resumoAcoes,
  TRILHAS,
  type Estabelecimento,
  type PainelInicio,
  type ResumoAcoes,
  type ResumoInspecao,
  type Trilha,
} from '../db/consultas';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  faixaDoScore,
  formatarData,
  ROTULO_MODO,
  textoCriticos,
  textoScore,
  type FaixaScore,
} from '../theme/rotulos';

/** Cor do número de cada faixa do score (ver theme/rotulos.ts). */
const COR_FAIXA: Record<FaixaScore, string> = {
  bom: Cores.primariaTexto,
  atencao: Cores.texto,
  ruim: Cores.acentoTexto,
  sem_dados: Cores.textoSuave,
};

/**
 * Quantas inspeções cada trilha mostra, e com que título.
 *
 * O limite da diária é baixo de propósito: são ~26 por mês, e rolar 26
 * cartões não responde nenhuma pergunta que as quatro leituras já não
 * respondam melhor. A ordem é a da importância, não a da frequência —
 * a auditoria vem primeiro mesmo sendo a mais rara.
 */
const SECOES: { trilha: Trilha; titulo: string; limite: number }[] = [
  { trilha: 'periodico', titulo: 'Auditorias periódicas', limite: 12 },
  { trilha: 'semestral', titulo: 'Água (semestral)', limite: 6 },
  { trilha: 'diario', titulo: 'Diárias', limite: 10 },
];

export default function TelaConformidade() {
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

  return <Painel estabelecimento={estabelecimento} />;
}

interface Dados {
  painel: PainelInicio;
  acoes: ResumoAcoes;
  porTrilha: Record<Trilha, ResumoInspecao[]>;
  totais: Record<Trilha, number>;
}

function Painel({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);

  const recarregar = useCallback(() => {
    const porTrilha = {} as Record<Trilha, ResumoInspecao[]>;
    const totais = {} as Record<Trilha, number>;

    for (const trilha of TRILHAS) {
      const todas = listarInspecoes(estabelecimento.id, { trilha });
      totais[trilha] = todas.length;
      porTrilha[trilha] = todas;
    }

    setDados({
      painel: painelInicio(estabelecimento.id),
      acoes: resumoAcoes(estabelecimento.id),
      porTrilha,
      totais,
    });
  }, [estabelecimento]);

  // Relido a cada foco: concluir uma inspeção em outra aba muda tudo aqui.
  useFocusEffect(recarregar);

  if (!dados) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  const vazio = TRILHAS.every((trilha) => dados.totais[trilha] === 0);

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <QuatroLeituras painel={dados.painel} router={router} />
      <CartaoPlano acoes={dados.acoes} aoAbrir={() => router.push('/plano-acao')} />

      {vazio ? (
        <Text style={estilos.vazio}>
          Nenhuma inspeção registrada ainda. As que você concluir aparecem aqui, separadas por
          trilha.
        </Text>
      ) : null}

      {SECOES.map(({ trilha, titulo, limite }) => {
        const lista = dados.porTrilha[trilha];
        if (lista.length === 0) return null;

        const visiveis = lista.slice(0, limite);
        const ocultas = lista.length - visiveis.length;

        return (
          <View key={trilha} style={estilos.cartao}>
            <View style={estilos.cabecalhoSecao}>
              <Text style={estilos.tituloCartao}>{titulo}</Text>
              <Text style={estilos.contagemSecao}>
                {lista.length} {lista.length === 1 ? 'registro' : 'registros'}
              </Text>
            </View>
            <View style={estilos.divisor} />

            {visiveis.map((inspecao, indice) => (
              <LinhaInspecao
                key={inspecao.id}
                inspecao={inspecao}
                primeira={indice === 0}
                aoAbrir={
                  inspecao.status === 'concluida'
                    ? () => router.push(`/resultado?id=${inspecao.id}`)
                    : undefined
                }
              />
            ))}

            {ocultas > 0 ? (
              <Text style={estilos.maisAntigas}>
                + {ocultas} {ocultas === 1 ? 'mais antiga' : 'mais antigas'}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * As quatro leituras de conformidade.
 *
 * Cada linha responde uma pergunta diferente: como comecei hoje, como
 * tenho sido no mês, como estou estruturalmente, e se a água está em
 * dia. Elas NÃO se fundem num número só.
 */
function QuatroLeituras({
  painel,
  router,
}: {
  painel: PainelInicio;
  router: ReturnType<typeof useRouter>;
}) {
  const { hoje, rotinaMes, auditoria, agua } = painel;

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>Quatro leituras</Text>
      <Text style={estilos.notaCartao}>
        Sem média entre elas: num mês há ~26 diárias para 1 auditoria.
      </Text>
      <View style={estilos.divisor} />

      {/* 1. Hoje */}
      {hoje ? (
        <LinhaScore
          rotulo="Diária de hoje"
          valor={hoje.score.valor}
          detalhe={detalheDaInspecao(hoje)}
          aoTocar={() => router.push(`/resultado?id=${hoje.id}`)}
        />
      ) : (
        <LinhaPendente
          rotulo="Diária de hoje"
          detalhe={
            painel.hojeEmAndamento
              ? 'Em andamento — conclua no fim do expediente'
              : 'Ainda não foi feita'
          }
          aoTocar={() => router.push('/')}
        />
      )}

      {/* 2. Rotina do mês */}
      <LinhaScore
        rotulo="Rotina do mês"
        valor={rotinaMes.media}
        detalhe={`${rotinaMes.diasComDiaria} de ${rotinaMes.janelaDias} dias com inspeção`}
      />

      {/* 3. Auditoria periódica */}
      {auditoria ? (
        <LinhaScore
          rotulo="Auditoria periódica"
          valor={auditoria.score.valor}
          detalhe={detalheDaInspecao(auditoria)}
          aoTocar={() => router.push(`/resultado?id=${auditoria.id}`)}
        />
      ) : (
        <LinhaPendente
          rotulo="Auditoria periódica"
          detalhe="Nenhuma auditoria concluída"
          aoTocar={() => router.push('/nova-inspecao')}
        />
      )}

      {/* 4. Água: confirmação, não nota — são 1 ou 2 itens. */}
      {agua ? (
        <View style={estilos.linha}>
          <View style={estilos.flex}>
            <Text style={estilos.rotulo}>Água (semestral)</Text>
            <Text style={estilos.subtexto}>
              {agua.diaLocal ? `Verificada em ${formatarData(agua.diaLocal)}` : 'Verificada'}
            </Text>
          </View>
          <Ionicons
            name={agua.adequados === agua.avaliados ? 'checkmark-circle' : 'alert-circle'}
            size={22}
            color={agua.adequados === agua.avaliados ? Cores.primaria : Cores.acento}
          />
        </View>
      ) : (
        <LinhaPendente
          rotulo="Água (semestral)"
          detalhe="Laudo e reservatório ainda não verificados"
          aoTocar={() => router.push('/nova-inspecao')}
        />
      )}
    </View>
  );
}

/** "13/09 · Rotina · 1 crítico inadequado" — o contexto do número. */
function detalheDaInspecao(inspecao: ResumoInspecao): string {
  const partes: string[] = [];

  if (inspecao.dia_local) partes.push(formatarData(inspecao.dia_local));
  if (inspecao.trilha === 'diario') partes.push(ROTULO_MODO[inspecao.modo]);

  const criticos = textoCriticos(inspecao.score);
  if (criticos) partes.push(criticos);

  return partes.join(' · ');
}

/**
 * Uma inspeção na lista da sua trilha.
 *
 * A trilha NÃO aparece na linha: ela já é o título da seção. Sobra
 * espaço para o que distingue um registro do outro — a data, o modo e
 * como foram os críticos.
 */
function LinhaInspecao({
  inspecao,
  primeira,
  aoAbrir,
}: {
  inspecao: ResumoInspecao;
  primeira: boolean;
  aoAbrir?: () => void;
}) {
  const concluida = inspecao.status === 'concluida';
  // Uma inspeção em andamento não mostra score: a nota parcial de um
  // checklist pela metade não significa nada, e induziria a erro.
  const mostrarScore = concluida && inspecao.score.valor !== null;
  const criticos = textoCriticos(inspecao.score);
  const temFalha = inspecao.score.criticosAvaliados > inspecao.score.criticosAdequados;

  const detalhe: string[] = [];
  if (inspecao.trilha === 'diario') detalhe.push(ROTULO_MODO[inspecao.modo]);
  if (concluida && criticos) detalhe.push(criticos);
  if (!concluida) detalhe.push(`${inspecao.respondidos} respondidos`);

  return (
    <Pressable
      style={({ pressed }) => [
        estilos.linhaInspecao,
        !primeira && estilos.linhaInspecaoSeguinte,
        pressed && aoAbrir ? estilos.pressionado : null,
      ]}
      onPress={aoAbrir}
      disabled={!aoAbrir}
      accessibilityRole={aoAbrir ? 'button' : undefined}
    >
      <View style={estilos.flex}>
        <Text style={estilos.dataInspecao}>
          {formatarData(inspecao.dia_local ?? inspecao.data_inicio)}
        </Text>
        {detalhe.length > 0 ? (
          <Text style={[estilos.subtexto, temFalha && concluida ? estilos.subtextoAlerta : null]}>
            {detalhe.join(' · ')}
          </Text>
        ) : null}
      </View>

      {mostrarScore ? (
        <Text style={[estilos.scoreLinha, { color: COR_FAIXA[faixaDoScore(inspecao.score.valor)] }]}>
          {textoScore(inspecao.score.valor)}
        </Text>
      ) : (
        <View style={concluida ? estilos.selo : estilos.seloAberto}>
          <Text style={concluida ? estilos.seloTexto : estilos.seloAbertoTexto}>
            {concluida ? 'sem avaliação' : 'em andamento'}
          </Text>
        </View>
      )}

      {aoAbrir ? (
        <Ionicons name="chevron-forward" size={18} color={Cores.borda} />
      ) : null}
    </Pressable>
  );
}

function LinhaScore({
  rotulo,
  valor,
  detalhe,
  aoTocar,
}: {
  rotulo: string;
  valor: number | null;
  detalhe: string;
  aoTocar?: () => void;
}) {
  const cor = COR_FAIXA[faixaDoScore(valor)];

  return (
    <Pressable
      style={({ pressed }) => [estilos.linha, pressed && aoTocar ? estilos.pressionado : null]}
      onPress={aoTocar}
      disabled={!aoTocar}
      accessibilityRole={aoTocar ? 'button' : undefined}
    >
      <View style={estilos.flex}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <Text style={estilos.subtexto}>{detalhe}</Text>
      </View>
      <Text style={[estilos.scoreValor, { color: cor }]}>{textoScore(valor)}</Text>
    </Pressable>
  );
}

function LinhaPendente({
  rotulo,
  detalhe,
  aoTocar,
}: {
  rotulo: string;
  detalhe: string;
  aoTocar: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [estilos.linha, pressed && estilos.pressionado]}
      onPress={aoTocar}
      accessibilityRole="button"
    >
      <View style={estilos.flex}>
        <Text style={estilos.rotulo}>{rotulo}</Text>
        <Text style={estilos.subtexto}>{detalhe}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Cores.textoSuave} />
    </Pressable>
  );
}

/**
 * A porta do PLANO DE AÇÃO (RF07).
 *
 * Fica logo abaixo das quatro leituras porque é a continuação delas: as
 * leituras dizem "como estou", o plano diz "o que estou fazendo a
 * respeito". Aparece mesmo com o plano vazio — é o único caminho até ele
 * fora do resultado de uma inspeção.
 */
function CartaoPlano({ acoes, aoAbrir }: { acoes: ResumoAcoes; aoAbrir: () => void }) {
  const detalhes: string[] = [];
  if (acoes.atrasadas > 0) {
    detalhes.push(`${acoes.atrasadas} ${acoes.atrasadas === 1 ? 'atrasada' : 'atrasadas'}`);
  }
  if (acoes.paraConcluir > 0) {
    detalhes.push(`${acoes.paraConcluir} para concluir`);
  }

  return (
    <Pressable
      onPress={aoAbrir}
      style={({ pressed }) => [estilos.cartao, pressed && estilos.pressionado]}
      accessibilityRole="button"
    >
      <View style={estilos.cabecalhoSecao}>
        <Text style={estilos.tituloCartao}>Plano de ação</Text>
        <Ionicons name="chevron-forward" size={16} color={Cores.textoSuave} />
      </View>
      <Text style={estilos.resumoPlano}>
        {acoes.abertas === 0
          ? 'Nenhuma ação aberta'
          : `${acoes.abertas} ${acoes.abertas === 1 ? 'ação aberta' : 'ações abertas'}`}
      </Text>
      {detalhes.length > 0 ? (
        <Text style={[estilos.subtexto, acoes.atrasadas > 0 && estilos.subtextoAlerta]}>
          {detalhes.join(' · ')}
        </Text>
      ) : (
        <Text style={estilos.subtexto}>
          {acoes.abertas === 0
            ? 'O app cria as ações ao concluir uma inspeção com itens inadequados.'
            : 'Tudo dentro do prazo.'}
        </Text>
      )}
    </Pressable>
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
  flex: { flex: 1 },
  pressionado: { opacity: 0.8 },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
  },
  cabecalhoSecao: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  tituloCartao: { flex: 1, fontSize: 16, fontWeight: '700', color: Cores.texto },
  contagemSecao: { fontSize: 12, color: Cores.textoSuave },
  notaCartao: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 4 },
  divisor: { height: 1, backgroundColor: Cores.divisor, marginVertical: 12 },

  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rotulo: { fontSize: 14, color: Cores.textoSecundario, flex: 1, paddingRight: 12 },
  resumoPlano: { fontSize: 14, color: Cores.textoSecundario, marginTop: 6 },
  subtexto: { fontSize: 12, color: Cores.textoSuave, marginTop: 2 },
  subtextoAlerta: { color: Cores.acentoTexto },
  scoreValor: { fontSize: 22, fontWeight: '700' },

  linhaInspecao: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  linhaInspecaoSeguinte: {
    borderTopWidth: 1,
    borderTopColor: Cores.divisor,
    marginTop: 2,
    paddingTop: 12,
  },
  dataInspecao: { fontSize: 14, fontWeight: '600', color: Cores.texto },
  scoreLinha: { fontSize: 17, fontWeight: '700' },

  selo: {
    backgroundColor: Cores.fundo,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seloTexto: { fontSize: 11, fontWeight: '700', color: Cores.textoSuave },
  seloAberto: {
    backgroundColor: Cores.primariaClara,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  seloAbertoTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimariaClara },

  maisAntigas: {
    fontSize: 12,
    color: Cores.textoSuave,
    textAlign: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Cores.divisor,
  },

  vazio: {
    fontSize: 13,
    lineHeight: 20,
    color: Cores.textoSuave,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
});
