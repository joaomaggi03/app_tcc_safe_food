/**
 * app/index.tsx
 * ---------------------------------------------------------------
 * Tela INÍCIO — rota "/". O painel do estabelecimento.
 *
 * Mostra quem é o estabelecimento cadastrado e o resumo do checklist
 * que o perfil dele gera. Daqui sai o botão "Editar", que reabre o
 * cadastro — é por ele que você troca o tipo e vê o checklist mudar.
 *
 * Se ainda não houver cadastro, redireciona para /cadastro: é o
 * "primeiro acesso" que o RF02 pede.
 *
 * O painel de conformidade (Fase 4) são QUATRO linhas, e não uma média
 * só. O motivo está em `painelInicio()`, no db/consultas.ts: num mês
 * típico há ~26 diárias contra UMA auditoria periódica, então qualquer
 * média entre elas seria dominada pelas diárias e esconderia justamente
 * a auditoria, que cobre a maior parte da norma.
 *
 * Os PRAZOS (RF05) vêm logo abaixo: quando cada trilha vence, e o que
 * está atrasado. Conformidade responde "como estou"; prazo responde "o
 * que preciso fazer agora" — são perguntas diferentes, em cartões
 * diferentes.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  contarCatalogo,
  listarPerfis,
  painelInicio,
  resumoDoPerfil,
  type Estabelecimento,
  type PainelInicio,
  type ResumoInspecao,
} from '../db/consultas';
import { alertasDisponiveis, testarAlerta } from '../db/notificacoes';
import { statusDasTrilhas, type SituacaoTrilha, type StatusTrilha } from '../db/periodicidade';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  faixaDoScore,
  formatarData,
  ROTULO_MODO,
  ROTULO_TRILHA,
  textoScore,
  textoUltimaConclusao,
  textoVencimento,
  type FaixaScore,
} from '../theme/rotulos';

/** Cor do número de cada faixa do score (ver theme/rotulos.ts). */
const COR_FAIXA: Record<FaixaScore, string> = {
  bom: Cores.primariaTexto,
  atencao: Cores.texto,
  ruim: Cores.acentoTexto,
  sem_dados: Cores.textoSuave,
};

/** Ícone e cor de cada situação de prazo. */
const SINAL_SITUACAO: Record<
  SituacaoTrilha,
  { icone: 'checkmark-circle' | 'time-outline' | 'alert-circle' | 'ellipse-outline'; cor: string }
> = {
  em_dia: { icone: 'checkmark-circle', cor: Cores.primaria },
  vence_em_breve: { icone: 'time-outline', cor: Cores.texto },
  vencida: { icone: 'alert-circle', cor: Cores.acento },
  nunca_feita: { icone: 'ellipse-outline', cor: Cores.textoSuave },
};

export default function TelaInicio() {
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

function Painel({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();

  // Relido sempre que a tela volta a aparecer, e não só quando o perfil
  // muda: marcar um item como "não se aplica" numa inspeção (RF09)
  // também mexe nestes números.
  const [resumo, setResumo] = useState(() =>
    resumoDoPerfil(estabelecimento.perfil_id, estabelecimento.id),
  );
  const [painel, setPainel] = useState<PainelInicio | null>(null);
  const [prazos, setPrazos] = useState<StatusTrilha[]>([]);

  useFocusEffect(
    useCallback(() => {
      setResumo(resumoDoPerfil(estabelecimento.perfil_id, estabelecimento.id));
      setPainel(painelInicio(estabelecimento.id));
      setPrazos(statusDasTrilhas(estabelecimento));
    }, [estabelecimento]),
  );
  const catalogo = useMemo(() => contarCatalogo(), []);
  const nomePerfil = useMemo(
    () => listarPerfis().find((p) => p.id === estabelecimento.perfil_id)?.nome ?? '—',
    [estabelecimento.perfil_id],
  );

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      {/* --- Identificação --- */}
      <View style={estilos.cartaoPrincipal}>
        <View style={estilos.linhaTopo}>
          <View style={estilos.flex}>
            <Text style={estilos.tipo}>{nomePerfil}</Text>
            <Text style={estilos.nome}>{estabelecimento.nome}</Text>
          </View>

          <Pressable
            onPress={() => router.push('/cadastro')}
            style={({ pressed }) => [estilos.botaoEditar, pressed && estilos.pressionado]}
            accessibilityRole="button"
            accessibilityLabel="Editar estabelecimento"
          >
            <Ionicons name="create-outline" size={18} color={Cores.sobrePrimaria} />
            <Text style={estilos.botaoEditarTexto}>Editar</Text>
          </Pressable>
        </View>

        {estabelecimento.cidade || estabelecimento.responsavel ? (
          <View style={estilos.detalhes}>
            {estabelecimento.cidade ? (
              <Detalhe icone="location-outline" texto={estabelecimento.cidade} />
            ) : null}
            {estabelecimento.responsavel ? (
              <Detalhe icone="person-outline" texto={estabelecimento.responsavel} />
            ) : null}
          </View>
        ) : null}

        <Text style={estilos.dataCadastro}>
          Cadastrado em {formatarData(estabelecimento.data_cadastro)}
        </Text>
      </View>

      {/* --- Prazos das trilhas (RF05) --- */}
      {prazos.length > 0 ? (
        <PainelPrazos prazos={prazos} estabelecimento={estabelecimento} router={router} />
      ) : null}

      {/* --- Conformidade (RF04) --- */}
      {painel ? <PainelConformidade painel={painel} router={router} /> : null}

      {/* --- Resumo do checklist --- */}
      <Cartao
        titulo="Seu checklist"
        nota={`${resumo.total} exigências da RDC 216 se aplicam a este perfil, em ${resumo.categorias} categorias.`}
      >
        <Linha rotulo="Itens do dia a dia" valor={resumo.diario} />
        <Linha rotulo="Itens da auditoria periódica" valor={resumo.periodico} />
        <Linha rotulo="Itens de prazo legal (água)" valor={resumo.semestral} />
      </Cartao>

      <Text style={estilos.rodape}>
        Base offline: {catalogo.itens} itens da RDC 216 em {catalogo.categorias} categorias.
      </Text>
    </ScrollView>
  );
}

/**
 * Os prazos das três trilhas.
 *
 * Vem ANTES da conformidade de propósito: a primeira pergunta ao abrir o
 * app não é "quanto tirei", é "tem algo atrasado?". Cada linha leva
 * direto para a inspeção correspondente, porque o prazo só se resolve de
 * um jeito — fazendo a inspeção.
 */
function PainelPrazos({
  prazos,
  estabelecimento,
  router,
}: {
  prazos: StatusTrilha[];
  estabelecimento: Estabelecimento;
  router: ReturnType<typeof useRouter>;
}) {
  const pendentes = prazos.filter((prazo) => prazo.situacao !== 'em_dia').length;

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>Prazos</Text>
      <Text style={estilos.notaCartao}>
        {pendentes === 0
          ? 'Todas as trilhas estão dentro do prazo.'
          : `${pendentes} ${pendentes === 1 ? 'trilha precisa' : 'trilhas precisam'} de atenção.`}
      </Text>
      <View style={estilos.divisor} />

      {prazos.map((prazo) => {
        const sinal = SINAL_SITUACAO[prazo.situacao];
        const destaque = prazo.situacao === 'vencida';

        return (
          <Pressable
            key={prazo.trilha}
            style={({ pressed }) => [estilos.linha, pressed && estilos.pressionado]}
            onPress={() => router.push('/nova-inspecao')}
            accessibilityRole="button"
            accessibilityLabel={`${ROTULO_TRILHA[prazo.trilha]}: ${textoVencimento(prazo)}`}
          >
            <Ionicons name={sinal.icone} size={20} color={sinal.cor} />

            <View style={estilos.flex}>
              <Text style={estilos.rotulo}>{ROTULO_TRILHA[prazo.trilha]}</Text>
              <Text style={estilos.subtexto}>{textoUltimaConclusao(prazo)}</Text>
            </View>

            <Text style={[estilos.prazo, destaque && estilos.prazoVencido]}>
              {textoVencimento(prazo)}
            </Text>
          </Pressable>
        );
      })}

      {/*
        Os alertas chegam na véspera do vencimento — o que é útil na
        prática, mas impossível de VER durante uma demonstração ou uma
        banca. Este botão dispara em 5 segundos a notificação real da
        trilha mais urgente, com o mesmo texto que ela teria no dia.

        Quando o ambiente não suporta alertas (o Expo Go do Android
        retirou o expo-notifications no SDK 53), o botão dá lugar a um
        aviso. Esconder a limitação seria pior: o usuário acharia que
        está sendo avisado dos vencimentos quando não está.
      */}
      {alertasDisponiveis() ? (
        <Pressable
          style={({ pressed }) => [estilos.testar, pressed && estilos.pressionado]}
          onPress={async () => {
            const alvo = prazos.find((prazo) => prazo.situacao !== 'em_dia') ?? prazos[0];
            const enviado = await testarAlerta(estabelecimento, alvo.trilha);

            Alert.alert(
              enviado ? 'Alerta a caminho' : 'Sem permissão',
              enviado
                ? `O aviso da trilha ${ROTULO_TRILHA[alvo.trilha].toLowerCase()} chega em 5 segundos. Você pode sair do app para vê-lo na barra de notificações.`
                : 'O aparelho não autorizou notificações para este app. O resto do app continua funcionando normalmente — só os avisos de vencimento ficam desligados.',
            );
          }}
          accessibilityRole="button"
        >
          <Ionicons name="notifications-outline" size={15} color={Cores.primariaTexto} />
          <Text style={estilos.testarTexto}>Testar alerta agora</Text>
        </Pressable>
      ) : (
        <View style={estilos.semAlertas}>
          <Ionicons name="notifications-off-outline" size={15} color={Cores.textoSuave} />
          <Text style={estilos.semAlertasTexto}>
            Os avisos de vencimento não funcionam no Expo Go. Os prazos acima continuam
            corretos; para receber as notificações, é preciso um development build do app.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * As quatro leituras de conformidade.
 *
 * Cada linha responde uma pergunta diferente: como comecei hoje, como
 * tenho sido no mês, como estou estruturalmente, e se a água está em
 * dia. Elas NÃO se fundem num número só — ver o comentário de
 * `painelInicio()` no db/consultas.ts.
 */
function PainelConformidade({
  painel,
  router,
}: {
  painel: PainelInicio;
  router: ReturnType<typeof useRouter>;
}) {
  const { hoje, rotinaMes, auditoria, agua } = painel;

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>Conformidade</Text>
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
          aoTocar={() => router.push('/nova-inspecao')}
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
            name={
              agua.adequados === agua.avaliados ? 'checkmark-circle' : 'alert-circle'
            }
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

/** "12 críticos ok · Completa" — o contexto que o número sozinho não dá. */
function detalheDaInspecao(inspecao: ResumoInspecao): string {
  const partes: string[] = [];

  if (inspecao.dia_local) partes.push(formatarData(inspecao.dia_local));
  if (inspecao.trilha === 'diario') partes.push(ROTULO_MODO[inspecao.modo]);
  if (inspecao.score.criticosAvaliados > 0) {
    partes.push(
      `críticos ${inspecao.score.criticosAdequados}/${inspecao.score.criticosAvaliados}`,
    );
  }

  return partes.join(' · ');
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

function Detalhe({ icone, texto }: { icone: 'location-outline' | 'person-outline'; texto: string }) {
  return (
    <View style={estilos.detalhe}>
      <Ionicons name={icone} size={14} color={Cores.textoSuave} />
      <Text style={estilos.detalheTexto}>{texto}</Text>
    </View>
  );
}

function Cartao({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>{titulo}</Text>
      {nota ? <Text style={estilos.notaCartao}>{nota}</Text> : null}
      <View style={estilos.divisor} />
      {children}
    </View>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number | string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
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
  flex: { flex: 1 },

  cartaoPrincipal: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: Cores.primaria,
  },
  linhaTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipo: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.primariaTexto,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nome: { fontSize: 22, fontWeight: '700', color: Cores.texto, marginTop: 4 },
  botaoEditar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Cores.primaria,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  botaoEditarTexto: { fontSize: 13, fontWeight: '700', color: Cores.sobrePrimaria },
  pressionado: { opacity: 0.8 },

  subtexto: { fontSize: 12, color: Cores.textoSuave, marginTop: 2 },
  scoreValor: { fontSize: 22, fontWeight: '700' },
  prazo: { fontSize: 13, fontWeight: '600', color: Cores.textoSecundario },
  prazoVencido: { color: Cores.acentoTexto },
  testar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  testarTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },
  semAlertas: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 8,
    backgroundColor: Cores.fundo,
  },
  semAlertasTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: Cores.textoSecundario },
  detalhes: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  detalhe: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detalheTexto: { fontSize: 13, color: Cores.textoSecundario },
  dataCadastro: { fontSize: 12, color: Cores.textoSuave, marginTop: 12 },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
    marginTop: 16,
  },
  tituloCartao: { fontSize: 16, fontWeight: '700', color: Cores.texto },
  notaCartao: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 4 },
  divisor: { height: 1, backgroundColor: Cores.divisor, marginVertical: 12 },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rotulo: { fontSize: 14, color: Cores.textoSecundario, flex: 1, paddingRight: 12 },
  valor: { fontSize: 15, fontWeight: '700', color: Cores.primariaTexto },
  pendente: { fontSize: 13, lineHeight: 22, color: Cores.textoSuave },

  rodape: { fontSize: 11, color: Cores.textoSuave, textAlign: 'center', marginTop: 20 },
});
