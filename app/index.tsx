/**
 * app/index.tsx
 * ---------------------------------------------------------------
 * Aba HOJE — rota "/". A primeira coisa que o app mostra.
 *
 * Responde "o que eu faço agora?". Antes esta tela era o Início: um
 * painel com catorze números e três links, e a inspeção do dia ficava a
 * três toques de distância (Início → Nova Inspeção → botão Rotina). Ela
 * é a ação mais frequente do app — várias vezes por dia — e estava
 * exatamente tão longe quanto a auditoria, que roda uma vez por mês.
 *
 * Agora a aba NÃO APONTA para a diária: ela é a diária. A execução vem
 * de `components/ExecucaoInspecao.tsx`, a mesma da rota `/inspecao`.
 *
 * A TELA TEM TRÊS ESTADOS, e são os três estados do dia:
 *
 *  1. NÃO INICIADA — o cartão de abertura, com a escolha entre Rotina e
 *     Completa. Este toque existe de propósito: `iniciarInspecao` GRAVA
 *     uma inspeção, e abrir o app num domingo não pode deixar uma diária
 *     vazia no histórico. Um toque por dia é o preço de não inventar
 *     registro que ninguém pediu.
 *  2. EM ANDAMENTO — a lista de verificações. A diária fica aberta o dia
 *     todo (ver `iniciarInspecao`), então é aqui que a aba passa a maior
 *     parte do tempo.
 *  3. CONCLUÍDA — o resumo do que foi fechado hoje. Sem botão de
 *     recomeçar: o dia já tem o seu registro.
 *
 * Em todos eles, o que está VENCIDO aparece — e só o que está vencido.
 * Trilha em dia não ocupa linha: silêncio é a informação de que está
 * tudo certo. E o "+" no header abre a folha de nova inspeção, que é
 * por onde se começa uma auditoria fora de hora.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ExecucaoInspecao } from '../components/ExecucaoInspecao';
import {
  contarItensPorTrilha,
  contarVerificacoesDaRotina,
  diaLocalISO,
  listarInspecoes,
  listarPerfis,
  sequenciaDiaria,
  type Estabelecimento,
  type ModoInspecao,
  type ResumoInspecao,
  type Sequencia,
  type Trilha,
} from '../db/consultas';
import { statusDasTrilhas, type StatusTrilha } from '../db/periodicidade';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  faixaDoScore,
  notaSequencia,
  ROTULO_MODO,
  ROTULO_TRILHA,
  textoCriticos,
  textoScore,
  textoSequencia,
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

export default function TelaHoje() {
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

  return <Hoje estabelecimento={estabelecimento} />;
}

interface DadosHoje {
  /** A diária DE HOJE em andamento, se houver. */
  emAndamento: ResumoInspecao | null;
  /** A diária DE HOJE já concluída, se houver. */
  concluida: ResumoInspecao | null;
  prazos: StatusTrilha[];
  itensDiarios: number;
  verificacoes: number;
  sequencia: Sequencia;
}

function Hoje({ estabelecimento }: { estabelecimento: Estabelecimento }) {
  const router = useRouter();
  const navigation = useNavigation();

  const [dados, setDados] = useState<DadosHoje | null>(null);
  /**
   * O modo escolhido no cartão de abertura, enquanto o banco ainda não
   * sabe dele. Some assim que a inspeção existe: a partir daí a verdade
   * é `emAndamento.modo`, gravado em `inspecao.modo`.
   */
  const [modoEscolhido, setModoEscolhido] = useState<ModoInspecao | null>(null);
  /**
   * O usuário pediu para abrir num dia em que o estabelecimento não
   * abre. Fica só na tela, e não no banco: quem abriu fora da rotina e
   * concluiu a inspeção já deixou o registro do dia — uma segunda marca
   * dizendo "abriu excepcionalmente" seria um segundo fato sobre a mesma
   * coisa, e os dois poderiam discordar.
   *
   * Zera ao trocar de tela, que é o certo: amanhã a pergunta é outra.
   */
  const [abrirFechado, setAbrirFechado] = useState(false);

  const recarregar = useCallback(() => {
    const hoje = diaLocalISO();
    const diarias = listarInspecoes(estabelecimento.id, { trilha: 'diario' });

    const deHoje = diarias.filter((inspecao) => inspecao.dia_local === hoje);

    setDados({
      emAndamento: deHoje.find((i) => i.status === 'em_andamento') ?? null,
      concluida: deHoje.find((i) => i.status === 'concluida') ?? null,
      prazos: statusDasTrilhas(estabelecimento),
      itensDiarios: contarItensPorTrilha(estabelecimento.perfil_id, estabelecimento.id).diario,
      verificacoes: contarVerificacoesDaRotina(estabelecimento.perfil_id, estabelecimento.id),
      sequencia: sequenciaDiaria(estabelecimento),
    });
  }, [estabelecimento]);

  useFocusEffect(recarregar);

  const abrirFolha = useCallback(() => router.push('/nova-inspecao'), [router]);

  const botaoNova = useMemo(
    () => <BotaoNovaInspecao aoTocar={abrirFolha} />,
    [abrirFolha],
  );

  // Concluída manda sobre tudo: sem isso, um `modoEscolhido` que ficou
  // no estado depois do fechamento faria a tela abrir uma segunda diária
  // no mesmo dia.
  const concluida = dados?.concluida ?? null;
  const modoEmUso = concluida ? null : (dados?.emAndamento?.modo ?? modoEscolhido);
  const executando = modoEmUso !== null && modoEmUso !== undefined;

  /**
   * O "+" no header, nos estados que NÃO desenham a execução.
   *
   * Quando a execução está na tela é ELA que monta o header, porque
   * precisa dividir o espaço com o botão de recolher tudo — por isso o
   * efeito daqui se cala.
   */
  useEffect(() => {
    if (executando) return;
    navigation.setOptions({ headerRight: () => botaoNova });
  }, [navigation, executando, botaoNova]);

  if (!dados) {
    return (
      <View style={estilos.centro}>
        <Text style={estilos.aviso}>Carregando…</Text>
      </View>
    );
  }

  const pendentes = dados.prazos.filter((prazo) => prazo.situacao !== 'em_dia');

  if (executando && modoEmUso) {
    return (
      <ExecucaoInspecao
        key={`diario-${modoEmUso}`}
        estabelecimento={estabelecimento}
        trilha="diario"
        modo={modoEmUso}
        headerExtra={botaoNova}
        prelude={
          <Prelude
            estabelecimento={estabelecimento}
            pendentes={pendentes}
            sequencia={dados.sequencia}
            router={router}
          />
        }
      />
    );
  }

  return (
    <ScrollView style={estilos.tela} contentContainerStyle={estilos.conteudo}>
      <Prelude
        estabelecimento={estabelecimento}
        pendentes={pendentes}
        sequencia={dados.sequencia}
        router={router}
      />

      {concluida ? (
        <DiaConcluido
          inspecao={concluida}
          aoAbrir={() => router.push(`/resultado?id=${concluida.id}`)}
        />
      ) : !dados.sequencia.abreHoje && !abrirFechado ? (
        <DiaFechado aoAbrirAssim={() => setAbrirFechado(true)} />
      ) : (
        <Abertura
          itens={dados.itensDiarios}
          verificacoes={dados.verificacoes}
          aoComecar={setModoEscolhido}
        />
      )}
    </ScrollView>
  );
}

/**
 * O que vem antes da inspeção do dia, nos três estados.
 *
 * Três coisas, nesta ordem: quem é o estabelecimento, o que está FORA DO
 * PRAZO, e a sequência de dias. Trilha em dia não vira linha — a
 * primeira pergunta ao abrir o app é "tem algo atrasado?", e a resposta
 * "não" se dá melhor com silêncio do que com três selos verdes.
 *
 * O atraso vem ANTES da sequência de propósito: um é chamado para agir,
 * o outro é estímulo. Quando não há atraso — o caso comum — a sequência
 * fica logo abaixo do nome, encostada no cartão de abrir o dia, que é
 * onde o estímulo tem para onde levar.
 *
 * Fica no prelúdio, e não no corpo da tela, porque o prelúdio é a única
 * parte que aparece nos TRÊS estados. A diária fica aberta o dia todo:
 * se a sequência morasse no corpo, ela sumiria justamente durante as
 * horas em que a tela está mais em uso.
 */
function Prelude({
  estabelecimento,
  pendentes,
  sequencia,
  router,
}: {
  estabelecimento: Estabelecimento;
  pendentes: StatusTrilha[];
  sequencia: Sequencia;
  router: ReturnType<typeof useRouter>;
}) {
  const nomePerfil = useMemo(
    () => listarPerfis().find((p) => p.id === estabelecimento.perfil_id)?.nome ?? '—',
    [estabelecimento.perfil_id],
  );

  return (
    <View style={estilos.prelude}>
      <View style={estilos.identificacao}>
        <Text style={estilos.tipo}>{nomePerfil}</Text>
        <Text style={estilos.nomeEstabelecimento}>{estabelecimento.nome}</Text>
      </View>

      {pendentes.map((prazo) => (
        <FaixaPrazo
          key={prazo.trilha}
          prazo={prazo}
          aoTocar={() =>
            prazo.trilha === 'diario'
              ? undefined
              : router.push(`/inspecao?trilha=${prazo.trilha}`)
          }
        />
      ))}

      <CartaoSequencia sequencia={sequencia} />
    </View>
  );
}

/**
 * A SEQUÊNCIA DE DIAS com a diária concluída.
 *
 * Mede adesão à rotina, e não conformidade — são perguntas diferentes, e
 * por isso o número não se mistura com o score: dá para ter 95% de score
 * fazendo a diária duas vezes por semana.
 *
 * A chama fica acesa só quando o dia de hoje já está fechado. Durante o
 * expediente ela é contorno: é a diferença visual entre "garantido" e
 * "ainda depende de você", que é o estado real da maior parte do dia.
 *
 * Nenhuma conta acontece aqui — os sete dias e o número vêm prontos de
 * `db/sequencia.ts`.
 */
function CartaoSequencia({ sequencia }: { sequencia: Sequencia }) {
  const acesa = sequencia.situacao === 'hoje_feita';
  const contando = sequencia.atual > 0;

  return (
    <View style={estilos.sequencia}>
      <Ionicons
        name={acesa ? 'flame' : 'flame-outline'}
        size={26}
        color={acesa ? Cores.primaria : Cores.textoSuave}
      />

      <View style={estilos.flex}>
        <Text style={[estilos.sequenciaNumero, !contando && estilos.sequenciaApagada]}>
          {contando ? textoSequencia(sequencia.atual) : 'Sem sequência'}
        </Text>
        <Text style={estilos.sequenciaNota}>{notaSequencia(sequencia)}</Text>
      </View>

      <View style={estilos.tira}>
        {sequencia.ultimosSete.map((dia) => (
          <View
            key={dia.dia}
            style={[
              estilos.ponto,
              dia.fechado && estilos.pontoFechado,
              dia.feita && estilos.pontoFeito,
              dia.hoje && estilos.pontoHoje,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/**
 * Uma trilha fora do prazo.
 *
 * A diária vencida NÃO leva a lugar nenhum: ela se resolve nesta mesma
 * tela, logo abaixo. As outras duas levam direto para a sua inspeção,
 * porque o prazo só se resolve de um jeito — fazendo a inspeção.
 */
function FaixaPrazo({ prazo, aoTocar }: { prazo: StatusTrilha; aoTocar: () => void }) {
  const vencida = prazo.situacao === 'vencida';
  const navegavel = prazo.trilha !== 'diario';

  return (
    <Pressable
      style={({ pressed }) => [
        estilos.faixa,
        vencida ? estilos.faixaVencida : estilos.faixaAviso,
        pressed && navegavel ? estilos.pressionado : null,
      ]}
      onPress={aoTocar}
      disabled={!navegavel}
      accessibilityRole={navegavel ? 'button' : undefined}
      accessibilityLabel={`${ROTULO_TRILHA[prazo.trilha]}: ${textoVencimento(prazo)}`}
    >
      <Ionicons
        name={vencida ? 'alert-circle' : 'time-outline'}
        size={20}
        color={vencida ? Cores.acentoForte : Cores.textoSecundario}
      />

      <View style={estilos.flex}>
        <Text style={[estilos.faixaTitulo, vencida && estilos.faixaTituloVencida]}>
          {ROTULO_TRILHA[prazo.trilha]} {textoVencimento(prazo).toLowerCase()}
        </Text>
        <Text style={[estilos.faixaDetalhe, vencida && estilos.faixaDetalheVencida]}>
          {textoUltimaConclusao(prazo)}
        </Text>
      </View>

      {navegavel ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={vencida ? Cores.acentoTexto : Cores.textoSuave}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * HOJE O ESTABELECIMENTO NÃO ABRE.
 *
 * Substitui o cartão de abertura nos dias marcados como fechados no
 * cadastro. Não esconde a inspeção: oferece. Feirante que resolveu abrir
 * numa quarta, restaurante que fez um evento no domingo, padaria que
 * abriu no feriado — todos precisam do checklist naquele dia, e um app
 * que respondesse "hoje não" estaria atrapalhando o trabalho.
 *
 * O que muda é só quem PEDE: em dia de expediente o app cobra, em dia
 * fechado ele espera ser chamado. A inspeção que sair daqui é igual a
 * qualquer outra — mesma trilha, mesmo score, e conta na sequência.
 */
function DiaFechado({ aoAbrirAssim }: { aoAbrirAssim: () => void }) {
  return (
    <View style={estilos.cartao}>
      <View style={estilos.linhaTitulo}>
        <Ionicons name="moon-outline" size={20} color={Cores.textoSecundario} />
        <Text style={estilos.tituloCartao}>Hoje não é dia de expediente</Text>
      </View>
      <Text style={estilos.notaCartao}>
        Você marcou este dia como fechado no cadastro, então o app não vai cobrar a inspeção
        diária nem contar o dia contra a sua sequência.
      </Text>

      <Pressable
        style={({ pressed }) => [estilos.botaoAbrirAssim, pressed && estilos.pressionado]}
        onPress={aoAbrirAssim}
        accessibilityRole="button"
      >
        <Ionicons name="sunny-outline" size={17} color={Cores.primariaTexto} />
        <Text style={estilos.botaoAbrirAssimTexto}>Abri hoje — fazer a inspeção</Text>
      </Pressable>
    </View>
  );
}

/**
 * O cartão de abrir o dia.
 *
 * É onde o MODO se escolhe, e é o único momento em que dá para
 * escolher: `inspecao.modo` fica gravado na inspeção para o histórico
 * não comparar preenchimentos diferentes, então trocar no meio do dia
 * mudaria o significado do registro que já está sendo feito.
 */
function Abertura({
  itens,
  verificacoes,
  aoComecar,
}: {
  itens: number;
  verificacoes: number;
  aoComecar: (modo: ModoInspecao) => void;
}) {
  if (itens === 0) {
    return (
      <View style={estilos.cartao}>
        <Text style={estilos.tituloCartao}>Diária de hoje</Text>
        <Text style={estilos.notaCartao}>
          Nenhum item diário se aplica ao seu tipo de estabelecimento.
        </Text>
      </View>
    );
  }

  const guiada = verificacoes > 0;

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.tituloCartao}>Diária de hoje</Text>
      <Text style={estilos.notaCartao}>
        Ainda não começou. Ela fica aberta o dia todo: marque cada item na hora em que
        acontecer e conclua no fim do expediente.
      </Text>

      <View style={estilos.modos}>
        {guiada ? (
          <Pressable
            style={({ pressed }) => [
              estilos.botaoModo,
              estilos.botaoModoPrincipal,
              pressed && estilos.pressionado,
            ]}
            onPress={() => aoComecar('rotina')}
            accessibilityRole="button"
          >
            <Text style={estilos.botaoModoPrincipalTexto}>Rotina · {verificacoes}</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            estilos.botaoModo,
            guiada ? null : estilos.botaoModoPrincipal,
            pressed && estilos.pressionado,
          ]}
          onPress={() => aoComecar('completa')}
          accessibilityRole="button"
        >
          <Text style={guiada ? estilos.botaoModoTexto : estilos.botaoModoPrincipalTexto}>
            Completa · {itens}
          </Text>
        </Pressable>
      </View>

      {guiada ? (
        <Text style={estilos.notaModo}>
          A rotina reúne as {itens} exigências diárias em {verificacoes} verificações, na ordem
          do expediente e com os artigos da RDC citados em cada uma.
        </Text>
      ) : null}
    </View>
  );
}

/** O dia já fechado: o resumo, e o caminho para o detalhamento. */
function DiaConcluido({
  inspecao,
  aoAbrir,
}: {
  inspecao: ResumoInspecao;
  aoAbrir: () => void;
}) {
  const criticos = textoCriticos(inspecao.score);
  const temFalha = inspecao.score.criticosAvaliados > inspecao.score.criticosAdequados;

  return (
    <Pressable
      style={({ pressed }) => [estilos.cartao, pressed && estilos.pressionado]}
      onPress={aoAbrir}
      accessibilityRole="button"
    >
      <View style={estilos.linhaConcluido}>
        <View style={estilos.flex}>
          <View style={estilos.linhaTitulo}>
            <Ionicons name="checkmark-circle" size={20} color={Cores.primaria} />
            <Text style={estilos.tituloCartao}>Dia concluído</Text>
          </View>
          <Text style={estilos.notaCartao}>
            Diária de hoje · {ROTULO_MODO[inspecao.modo]} · {inspecao.respondidos} respondidos
          </Text>
        </View>

        <Text
          style={[estilos.scoreGrande, { color: COR_FAIXA[faixaDoScore(inspecao.score.valor)] }]}
        >
          {textoScore(inspecao.score.valor)}
        </Text>
      </View>

      {criticos ? (
        <View style={[estilos.criticos, temFalha && estilos.criticosAlerta]}>
          <Ionicons
            name={temFalha ? 'alert-circle' : 'shield-checkmark-outline'}
            size={15}
            color={temFalha ? Cores.acentoForte : Cores.primariaTexto}
          />
          <Text style={[estilos.criticosTexto, temFalha && estilos.criticosTextoAlerta]}>
            {criticos}
          </Text>
        </View>
      ) : null}

      <View style={estilos.verDetalhe}>
        <Text style={estilos.verDetalheTexto}>Ver o resultado por categoria</Text>
        <Ionicons name="chevron-forward" size={16} color={Cores.primariaTexto} />
      </View>
    </Pressable>
  );
}

/** O "+" do header: abre a folha das três trilhas. */
function BotaoNovaInspecao({ aoTocar }: { aoTocar: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [estilos.botaoNova, pressed && estilos.pressionado]}
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel="Nova inspeção"
    >
      <Ionicons name="add" size={20} color={Cores.sobrePrimaria} />
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

  prelude: { gap: 10, marginBottom: 14 },
  identificacao: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  tipo: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.primariaTexto,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nomeEstabelecimento: { fontSize: 13, color: Cores.textoSecundario },

  faixa: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 12,
  },
  faixaVencida: { backgroundColor: Cores.acentoSuave },
  faixaAviso: { backgroundColor: Cores.superficie },
  faixaTitulo: { fontSize: 13, fontWeight: '700', color: Cores.texto },
  faixaTituloVencida: { color: Cores.acentoForte },
  faixaDetalhe: { fontSize: 12, color: Cores.textoSuave, marginTop: 2 },
  faixaDetalheVencida: { color: Cores.acentoTexto },

  sequencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Cores.superficie,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sequenciaNumero: { fontSize: 15, fontWeight: '700', color: Cores.texto },
  sequenciaApagada: { color: Cores.textoSuave },
  sequenciaNota: { fontSize: 12, color: Cores.textoSuave, marginTop: 2 },

  botaoAbrirAssim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Cores.primaria,
  },
  botaoAbrirAssimTexto: { fontSize: 14, fontWeight: '700', color: Cores.primariaTexto },

  // A tirinha dos sete dias: o mais antigo à esquerda, hoje na ponta.
  tira: { flexDirection: 'row', gap: 4 },
  ponto: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Cores.borda,
  },
  pontoFeito: { backgroundColor: Cores.primaria },
  // Dia sem expediente fica quase invisível: não é falta, é folga. Vem
  // ANTES de `pontoFeito` na lista de estilos, para que uma diária feita
  // num dia fechado continue aparecendo preenchida.
  pontoFechado: { backgroundColor: Cores.divisor },
  // Hoje ganha contorno para se achar na tira mesmo quando ainda não
  // está preenchido — sem ele, a ponta direita some no fundo do cartão.
  pontoHoje: { borderWidth: 1, borderColor: Cores.textoSuave },

  cartao: {
    backgroundColor: Cores.superficie,
    borderRadius: 14,
    padding: 18,
  },
  linhaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tituloCartao: { fontSize: 16, fontWeight: '700', color: Cores.texto },
  notaCartao: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 4 },

  modos: { flexDirection: 'row', gap: 8, marginTop: 16 },
  botaoModo: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.fundo,
  },
  botaoModoPrincipal: { backgroundColor: Cores.primaria, borderColor: Cores.primaria },
  botaoModoPrincipalTexto: { fontSize: 14, fontWeight: '700', color: Cores.sobrePrimaria },
  botaoModoTexto: { fontSize: 14, fontWeight: '600', color: Cores.textoSecundario },
  notaModo: { fontSize: 12, lineHeight: 18, color: Cores.textoSuave, marginTop: 12 },

  linhaConcluido: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreGrande: { fontSize: 28, fontWeight: '700' },
  criticos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: Cores.fundo,
  },
  criticosAlerta: { backgroundColor: Cores.acentoSuave },
  criticosTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },
  criticosTextoAlerta: { color: Cores.acentoForte },
  verDetalhe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Cores.divisor,
  },
  verDetalheTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },

  botaoNova: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: Cores.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
});
