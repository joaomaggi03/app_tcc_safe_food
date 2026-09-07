/**
 * app/inspecao.tsx
 * ---------------------------------------------------------------
 * Tela de EXECUÇÃO DA INSPEÇÃO (RF06 + RF09) — rota "/inspecao".
 *
 * É aqui que o checklist deixa de ser leitura: cada item ganha os
 * quatro botões de resposta, e cada toque grava no SQLite na hora.
 *
 * A ROTA RECEBE A TRILHA POR PARÂMETRO: "/inspecao?trilha=diario".
 * Isso não é detalhe. A Fase 5 organiza o app em três trilhas de
 * periodicidade; se esta tela assumisse "a inspeção é sempre o checklist
 * inteiro", ela teria que ser reescrita lá. Recebendo a trilha de fora,
 * a mesma tela serve às três — muda só o parâmetro.
 *
 * A TELA TEM DOIS MODOS DE PREENCHIMENTO:
 *
 *  - ROTINA (só na diária): as 11 verificações guiadas do
 *    `data/rotina-diaria.ts`. Cada cartão faz UMA pergunta técnica que
 *    cobre vários itens da norma, e mostra quais códigos cobre. Marcar
 *    "conforme" responde todos de uma vez; "não conforme" abre os itens
 *    para você dizer qual falhou. É rápido no caso comum e preciso
 *    quando há problema.
 *  - COMPLETA: os itens da norma, um a um. É o modo das outras trilhas
 *    e da auditoria diária mais cuidadosa.
 *
 * Nos dois, a lista é organizada em blocos recolhíveis — o momento do
 * expediente na diária, a seção da RDC nas outras trilhas — e o que se
 * grava no banco é sempre a resposta ITEM A ITEM. A pergunta agrupada é
 * uma forma de perguntar, não uma unidade de dado.
 *
 * Recolher importa: a diária completa tem 32 itens e a auditoria passa
 * de 60. Numa lista contínua, achar onde você parou vira rolagem cega.
 *
 * Sobre parâmetros de rota no expo-router: `useLocalSearchParams()` lê o
 * que veio depois do "?" na URL. Como qualquer coisa pode chegar ali
 * (inclusive nada), validamos antes de usar.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import {
  checklistDoPerfil,
  concluirInspecao,
  estadoDaVerificacao,
  iniciarInspecao,
  respostasDaInspecao,
  rotinaDoPerfil,
  salvarResposta,
  TRILHAS,
  type Estabelecimento,
  type EstadoVerificacao,
  type ItemChecklist,
  type ModoInspecao,
  type Resposta,
  type SecaoCategoria,
  type Trilha,
  type VerificacaoChecklist,
} from '../db/consultas';
import { reagendarAlertas } from '../db/notificacoes';
import { useEstabelecimento } from '../store/estabelecimento';
import Cores from '../theme/cores';
import {
  RESPOSTAS,
  ROTULO_MODO,
  ROTULO_RESPOSTA,
  ROTULO_TRILHA,
  ROTULO_TRILHA_CURTO,
} from '../theme/rotulos';

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
    <Execucao
      key={`${trilha}-${modo}`}
      estabelecimento={estabelecimento}
      trilha={trilha}
      modo={modo}
    />
  );
}

/**
 * Uma linha da lista: ou o cabeçalho de uma seção da RDC, ou um item.
 *
 * O SectionList só entende UM nível de seções, então o segundo nível
 * vira linha de dados — a seção da norma é desenhada como um item
 * especial no meio da lista. Assim mantemos a virtualização (só o que
 * cabe na tela é desenhado) mesmo com dois níveis.
 */
type Linha =
  | { tipo: 'secao'; chave: string; nome: string; codigo: string; quantidade: number }
  | { tipo: 'verificacao'; chave: string; verificacao: VerificacaoChecklist }
  | { tipo: 'item'; chave: string; item: ItemChecklist; recuado: boolean };

/**
 * Um bloco recolhível da tela, nos dois modos.
 *
 * `verificacoes` e `secoes` são mutuamente exclusivos: o bloco ou lista
 * verificações da rotina guiada, ou seções da norma com os itens. Ter um
 * tipo só evita duplicar toda a lógica de recolher, contar e desenhar
 * cabeçalho.
 */
interface Bloco {
  chave: string;
  titulo: string;
  etiqueta: string;
  total: number;
  verificacoes: VerificacaoChecklist[] | null;
  secoes: SecaoCategoria[] | null;
  subdividido?: boolean;
}

/** Todos os itens da norma dentro de um bloco, venham de onde vierem. */
function itensDoBloco(bloco: Bloco): ItemChecklist[] {
  if (bloco.verificacoes) {
    return bloco.verificacoes.flatMap((verificacao) => verificacao.itens);
  }
  return (bloco.secoes ?? []).flatMap((secao) => secao.itens);
}

function Execucao({
  estabelecimento,
  trilha,
  modo,
}: {
  estabelecimento: Estabelecimento;
  trilha: Trilha;
  modo: ModoInspecao;
}) {
  const router = useRouter();

  // Abre a inspeção (ou retoma a que estava em andamento) UMA vez, ao
  // montar a tela. Passar uma função para o `useState` é o jeito de
  // rodar algo só na primeira renderização: nas seguintes, ele devolve
  // o valor guardado sem executar de novo.
  const [inspecao] = useState(() => iniciarInspecao(estabelecimento.id, trilha, modo));

  const guiada = modo === 'rotina' && trilha === 'diario';

  /**
   * O conteúdo é lido UMA vez, de propósito.
   *
   * Se a lista fosse recalculada a cada resposta, o item que você acabou
   * de marcar como "não se aplica" sumiria da tela no mesmo instante —
   * confuso, e pior: sem chance de desfazer. O RF09 diz que ele some das
   * PRÓXIMAS inspeções. Então ele fica visível até o fim desta, e os já
   * ocultos de antes nem chegam a ser carregados.
   */
  const grupos = useMemo<Bloco[]>(() => {
    if (guiada) {
      return rotinaDoPerfil(estabelecimento.perfil_id, {
        estabelecimentoId: estabelecimento.id,
      }).map((grupo) => ({
        chave: grupo.chave,
        titulo: grupo.titulo,
        etiqueta: grupo.etiqueta,
        total: grupo.total,
        verificacoes: grupo.verificacoes,
        secoes: null,
      }));
    }

    return checklistDoPerfil(estabelecimento.perfil_id, {
      trilha,
      estabelecimentoId: estabelecimento.id,
    }).map((grupo) => ({
      chave: grupo.chave,
      titulo: grupo.titulo,
      etiqueta: grupo.etiqueta,
      total: grupo.total,
      verificacoes: null,
      secoes: grupo.secoes,
      subdividido: grupo.subdividido,
    }));
  }, [estabelecimento.perfil_id, estabelecimento.id, trilha, guiada]);

  const itens = useMemo(() => grupos.flatMap(itensDoBloco), [grupos]);

  // Cópia em memória das respostas, para a tela reagir a cada toque.
  // A verdade continua sendo o banco: aqui começamos lendo dele, o que
  // é o que faz uma inspeção retomada aparecer já preenchida.
  const [respostas, setRespostas] = useState(() => respostasDaInspecao(inspecao.id));

  /**
   * Quais blocos estão abertos.
   *
   * Começa só com o primeiro: abrir todos devolveria a lista quilométrica
   * que estamos justamente tentando evitar.
   */
  const [abertos, setAbertos] = useState<string[]>(() =>
    grupos.length > 0 ? [grupos[0].chave] : [],
  );

  function alternar(chave: string) {
    setAbertos((atual) =>
      atual.includes(chave) ? atual.filter((c) => c !== chave) : [...atual, chave],
    );
  }

  const algumAberto = abertos.length > 0;

  /**
   * Recolhe tudo — ou abre tudo, se já estiver tudo recolhido.
   *
   * Um botão só, com dois sentidos: com blocos abertos ele recolhe (que
   * é o pedido: voltar à visão geral sem rolar até o topo de cada um);
   * com tudo fechado, o mesmo botão vira "expandir tudo", porque nesse
   * estado recolher não faria nada.
   */
  function alternarTodos() {
    setAbertos(algumAberto ? [] : grupos.map((grupo) => grupo.chave));
  }

  /**
   * O botão "recolher tudo" migra para o header quando some da tela.
   *
   * Ele mora no cabeçalho da lista, que rola junto com o conteúdo — e é
   * justamente no meio da rolagem que ele faz falta. Então: enquanto
   * estiver visível, fica onde está; assim que passa para cima, aparece
   * no header da rota, que é fixo.
   *
   * `limite` é medido, não chutado: o próprio botão informa onde termina
   * pelo `onLayout`, então mudar fonte, texto ou tamanho de tela não
   * quebra o ponto de troca.
   */
  const [limite, setLimite] = useState<number | null>(null);
  const [botaoNoHeader, setBotaoNoHeader] = useState(false);

  const aoMedirBotao = useCallback((evento: LayoutChangeEvent) => {
    // `y` vem relativo ao cabeçalho da lista, que por sua vez começa
    // depois do padding do conteúdo — daí a soma.
    const { y, height } = evento.nativeEvent.layout;
    setLimite(PADDING_CONTEUDO + y + height);
  }, []);

  function aoRolar(evento: NativeSyntheticEvent<NativeScrollEvent>) {
    if (limite === null) return;
    const passou = evento.nativeEvent.contentOffset.y > limite;
    // Só um booleano vai para o estado: com o mesmo valor, o React não
    // redesenha, e o `onScroll` pode disparar a cada quadro à vontade.
    setBotaoNoHeader((atual) => (atual === passou ? atual : passou));
  }

  /**
   * Volta ao topo quando o cartão flutuante é tocado.
   *
   * `getScrollResponder()` dá acesso à ScrollView que a SectionList usa
   * por dentro. É por ela, e não por `scrollToLocation`, porque este
   * último precisa de uma seção com itens — e aqui as seções podem
   * estar todas recolhidas, com `data: []`.
   */
  const listaRef = useRef<SectionList<Linha, { grupo: Bloco }>>(null);

  function voltarAoTopo() {
    listaRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
  }

  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerRight: botaoNoHeader
        ? () => (
            <BotaoRecolher compacto algumAberto={algumAberto} aoTocar={alternarTodos} />
          )
        : undefined,
    });
    // `alternarTodos` é recriada a cada render, mas depende só de
    // `algumAberto` e `grupos` — por isso eles é que entram aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, botaoNoHeader, algumAberto, grupos]);

  // Quais verificações estão com os itens da norma à mostra. Abrir uma
  // é o caminho para dizer QUAL item falhou.
  const [detalhadas, setDetalhadas] = useState<string[]>([]);

  function alternarDetalhe(id: string, abrir?: boolean) {
    setDetalhadas((atual) => {
      const aberto = atual.includes(id);
      const querAbrir = abrir ?? !aberto;
      if (querAbrir === aberto) return atual;
      return querAbrir ? [...atual, id] : atual.filter((c) => c !== id);
    });
  }

  /** Responde de uma vez todos os itens cobertos por uma verificação. */
  function responderVerificacao(verificacao: VerificacaoChecklist, resposta: Resposta) {
    for (const item of verificacao.itens) {
      salvarResposta(inspecao.id, item.id, resposta);
    }
    setRespostas((atual) => {
      const novo = { ...atual };
      for (const item of verificacao.itens) novo[item.id] = resposta;
      return novo;
    });
  }

  const respondidos = itens.filter((item) => respostas[item.id]).length;
  const faltam = itens.length - respondidos;

  function gravar(itemId: string, resposta: Resposta) {
    salvarResposta(inspecao.id, itemId, resposta);
    setRespostas((atual) => ({ ...atual, [itemId]: resposta }));
  }

  function responder(item: ItemChecklist, resposta: Resposta) {
    // "Não se aplica" tem efeito duradouro: some das próximas inspeções.
    // O usuário precisa saber disso ANTES, e não descobrir depois que o
    // checklist encolheu sozinho.
    const jaMarcado = respostas[item.id] === 'nao_se_aplica';

    if (resposta === 'nao_se_aplica' && !jaMarcado) {
      Alert.alert(
        'Marcar como "não se aplica"?',
        `O item ${item.codigo_rdc} deixará de aparecer nas próximas inspeções deste ` +
          'estabelecimento. Você pode voltar a exibi-lo em Nova Inspeção.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Marcar', onPress: () => gravar(item.id, resposta) },
        ],
      );
      return;
    }

    gravar(item.id, resposta);
  }

  function concluir() {
    // `itens.length` é o tamanho do checklist AGORA; ele é congelado na
    // inspeção para o histórico não mudar quando o checklist mudar.
    concluirInspecao(inspecao.id, itens.length);

    // Concluir zera o relógio desta trilha, então o alerta de vencimento
    // precisa ser refeito (RF05). Sem `await`: a navegação não espera o
    // sistema operacional, e um alerta que falhe ao agendar não pode
    // impedir o usuário de ver o resultado.
    void reagendarAlertas(estabelecimento);

    router.replace(`/resultado?id=${inspecao.id}`);
  }

  function aoConcluir() {
    if (faltam > 0) {
      Alert.alert(
        'Concluir assim mesmo?',
        faltam === 1
          ? 'Ainda falta 1 item sem resposta.'
          : `Ainda faltam ${faltam} itens sem resposta.`,
        [
          { text: 'Continuar preenchendo', style: 'cancel' },
          { text: 'Concluir', onPress: concluir },
        ],
      );
      return;
    }
    concluir();
  }

  const secoes = grupos.map((grupo) => ({
    grupo,
    // Bloco fechado = lista de dados vazia. O cabeçalho continua sendo
    // desenhado, e a virtualização do SectionList continua valendo.
    data: abertos.includes(grupo.chave) ? linhasDoBloco(grupo, detalhadas) : [],
  }));

  return (
    // A View existe para a barra flutuante poder ficar POR CIMA da
    // lista: um elemento absoluto se posiciona em relação ao pai, e o
    // pai da SectionList sozinha seria a tela inteira.
    <View style={estilos.tela}>
      <SectionList
        ref={listaRef}
        style={estilos.tela}
        contentContainerStyle={estilos.conteudo}
        sections={secoes}
        keyExtractor={(linha) => linha.chave}
        stickySectionHeadersEnabled={false}
        onScroll={aoRolar}
        scrollEventThrottle={32}
        // `extraData` avisa a lista de que algo de fora dos itens mudou.
        // Sem isso, o SectionList não redesenharia as linhas ao responder.
        extraData={respostas}
        ListHeaderComponent={
          <Cabecalho
            nome={estabelecimento.nome}
            trilha={trilha}
            modo={modo}
            respondidos={respondidos}
            total={itens.length}
            algumAberto={algumAberto}
            aoAlternarTodos={alternarTodos}
            aoMedirBotao={aoMedirBotao}
            botaoNoHeader={botaoNoHeader}
          />
        }
        renderSectionHeader={({ section }) => (
          <CabecalhoGrupo
            grupo={section.grupo}
            aberto={abertos.includes(section.grupo.chave)}
            respondidos={contarRespondidos(section.grupo, respostas)}
            aoAlternar={() => alternar(section.grupo.chave)}
          />
        )}
        renderItem={({ item: linha, section }) => {
          if (linha.tipo === 'secao') {
            // Só a diária completa mostra a seção da RDC lá dentro; nas
            // outras trilhas o bloco JÁ É a seção, e repetir seria
            // redundante.
            return section.grupo.subdividido ? <CabecalhoSecao linha={linha} /> : null;
          }

          if (linha.tipo === 'verificacao') {
            return (
              <CartaoVerificacao
                verificacao={linha.verificacao}
                estado={estadoDaVerificacao(linha.verificacao.itens, respostas)}
                detalhado={detalhadas.includes(linha.verificacao.id)}
                aoResponder={(resposta) => responderVerificacao(linha.verificacao, resposta)}
                aoDetalhar={(abrir) => alternarDetalhe(linha.verificacao.id, abrir)}
              />
            );
          }

          return (
            <LinhaItem
              item={linha.item}
              recuado={linha.recuado}
              resposta={respostas[linha.item.id]}
              aoResponder={(escolha) => responder(linha.item, escolha)}
            />
          );
        }}
        ListEmptyComponent={
          <Text style={estilos.vazio}>
            Nenhum item nesta trilha para o seu tipo de estabelecimento.
          </Text>
        }
        ListFooterComponent={
          itens.length > 0 ? (
            <Pressable
              style={({ pressed }) => [estilos.botaoConcluir, pressed && estilos.botaoPressionado]}
              onPress={aoConcluir}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-done" size={18} color={Cores.sobrePrimaria} />
              <Text style={estilos.botaoConcluirTexto}>Concluir inspeção</Text>
            </Pressable>
          ) : null
        }
      />

      {/* O cabeçalho da lista rola junto com o conteúdo e some. Este
          cartão é a versão fixa dele: aparece no mesmo ponto em que o
          cabeçalho sai de vista, para você sempre saber quanto falta
          sem voltar ao topo. */}
      {botaoNoHeader ? (
        <CartaoFlutuante
          respondidos={respondidos}
          total={itens.length}
          aoTocar={voltarAoTopo}
        />
      ) : null}
    </View>
  );
}

/**
 * O cartão de progresso fixo, sobreposto ao topo da lista.
 *
 * Ele é TOCÁVEL, e volta ao topo. Não é só um extra: um cartão grande
 * cobrindo parte do conteúdo precisa responder ao toque, senão o dedo
 * atravessaria para o item escondido atrás — e você marcaria "Conforme"
 * numa verificação que nem está vendo.
 */
function CartaoFlutuante({
  respondidos,
  total,
  aoTocar,
}: {
  respondidos: number;
  total: number;
  aoTocar: () => void;
}) {
  const porcentagem = total === 0 ? 0 : Math.round((respondidos / total) * 100);

  return (
    <View style={estilos.flutuanteArea} pointerEvents="box-none">
      <Pressable
        style={({ pressed }) => [estilos.flutuanteCartao, pressed && estilos.flutuantePressionado]}
        onPress={aoTocar}
        accessibilityRole="button"
        accessibilityLabel={`${respondidos} de ${total} respondidos. Voltar ao topo.`}
      >
        {/* Uma linha só, para o cartão ficar fino: o rótulo da trilha
            saiu porque o header da rota já diz onde você está. */}
        <View style={estilos.flutuanteLinha}>
          <Text style={estilos.flutuanteTexto}>
            {respondidos} de {total} respondidos
          </Text>
          <Text style={estilos.flutuantePorcentagem}>{porcentagem}%</Text>
          <Ionicons name="arrow-up-circle-outline" size={18} color={Cores.textoSuave} />
        </View>

        <View style={estilos.flutuanteBarra}>
          <View style={[estilos.flutuanteBarraPreenchida, { width: `${porcentagem}%` }]} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Achata um bloco na lista plana que o SectionList consome.
 *
 * Na rotina guiada, os itens de uma verificação só entram na lista se
 * ela estiver detalhada — é o que mantém a tela com 11 cartões em vez
 * de 32 itens no caso comum.
 */
function linhasDoBloco(bloco: Bloco, detalhadas: string[]): Linha[] {
  const linhas: Linha[] = [];

  if (bloco.verificacoes) {
    for (const verificacao of bloco.verificacoes) {
      linhas.push({
        tipo: 'verificacao',
        chave: verificacao.id,
        verificacao,
      });

      if (detalhadas.includes(verificacao.id)) {
        for (const item of verificacao.itens) {
          linhas.push({ tipo: 'item', chave: item.id, item, recuado: true });
        }
      }
    }
    return linhas;
  }

  for (const secao of bloco.secoes ?? []) {
    linhas.push({
      tipo: 'secao',
      chave: `${bloco.chave}:${secao.categoriaId}`,
      nome: secao.nome,
      codigo: secao.codigoRdc,
      quantidade: secao.itens.length,
    });

    for (const item of secao.itens) {
      linhas.push({ tipo: 'item', chave: item.id, item, recuado: false });
    }
  }

  return linhas;
}

function contarRespondidos(bloco: Bloco, respostas: Record<string, Resposta>): number {
  return itensDoBloco(bloco).filter((item) => respostas[item.id]).length;
}

function Cabecalho({
  nome,
  trilha,
  modo,
  respondidos,
  total,
  algumAberto,
  aoAlternarTodos,
  aoMedirBotao,
  botaoNoHeader,
}: {
  nome: string;
  trilha: Trilha;
  modo: ModoInspecao;
  respondidos: number;
  total: number;
  algumAberto: boolean;
  aoAlternarTodos: () => void;
  aoMedirBotao: (evento: LayoutChangeEvent) => void;
  /** Quando o botão já subiu para o header, o daqui some. */
  botaoNoHeader: boolean;
}) {
  const porcentagem = total === 0 ? 0 : Math.round((respondidos / total) * 100);

  return (
    <View style={estilos.cabecalho}>
      <Text style={estilos.etiqueta}>
        Inspeção {ROTULO_TRILHA[trilha].toLowerCase()}
        {trilha === 'diario' ? ` · ${ROTULO_MODO[modo].toLowerCase()}` : ''}
      </Text>
      <Text style={estilos.titulo}>{nome}</Text>

      {/* Barra de progresso: é só uma View colorida ocupando uma fração
          da largura da outra. Isso NÃO é o score de conformidade — mede
          quanto do checklist foi respondido, não quanto está adequado.
          O score é a tela de resultado. */}
      <View style={estilos.barra}>
        <View style={[estilos.barraPreenchida, { width: `${porcentagem}%` }]} />
      </View>
      <View style={estilos.linhaProgresso} onLayout={aoMedirBotao}>
        <Text style={estilos.progressoTexto}>
          {respondidos} de {total} respondidos
        </Text>

        {/* Fica INVISÍVEL, e não removido, enquanto o botão está no
            header: tirar a View encolheria a linha, o `onLayout` mediria
            outro valor e o ponto de troca ficaria oscilando com a
            própria rolagem. */}
        <View
          style={botaoNoHeader ? estilos.invisivel : undefined}
          pointerEvents={botaoNoHeader ? 'none' : 'auto'}
          importantForAccessibility={botaoNoHeader ? 'no-hide-descendants' : 'auto'}
          accessibilityElementsHidden={botaoNoHeader}
        >
          <BotaoRecolher algumAberto={algumAberto} aoTocar={aoAlternarTodos} />
        </View>
      </View>

      <View style={estilos.dica}>
        <Ionicons name="save-outline" size={14} color={Cores.sobrePrimaria} />
        <Text style={estilos.dicaTexto}>
          {trilha === 'diario'
            ? 'Esta inspeção fica aberta o dia todo: marque cada item na hora em que acontecer e conclua no fim do expediente.'
            : 'Cada resposta é salva na hora, no aparelho. Pode fechar o app e voltar depois.'}
        </Text>
      </View>
    </View>
  );
}

/**
 * O botão de recolher/expandir tudo.
 *
 * O mesmo componente serve nos dois lugares: no cabeçalho da lista e,
 * quando ele sai de vista, no header da rota. `compacto` só encurta o
 * texto, porque no header o espaço é do título.
 */
function BotaoRecolher({
  algumAberto,
  aoTocar,
  compacto,
}: {
  algumAberto: boolean;
  aoTocar: () => void;
  compacto?: boolean;
}) {
  const texto = algumAberto
    ? compacto
      ? 'Recolher'
      : 'Recolher tudo'
    : compacto
      ? 'Expandir'
      : 'Expandir tudo';

  return (
    <Pressable
      onPress={aoTocar}
      style={({ pressed }) => [
        estilos.botaoRecolher,
        compacto && estilos.botaoRecolherHeader,
        pressed && estilos.pressionado,
      ]}
      accessibilityRole="button"
      accessibilityLabel={algumAberto ? 'Recolher todos os blocos' : 'Expandir todos os blocos'}
    >
      <Ionicons
        name={algumAberto ? 'chevron-collapse-outline' : 'chevron-expand-outline'}
        size={15}
        color={Cores.primariaTexto}
      />
      <Text style={estilos.botaoRecolherTexto}>{texto}</Text>
    </Pressable>
  );
}

/** O bloco recolhível: momento do expediente, ou seção da RDC. */
function CabecalhoGrupo({
  grupo,
  aberto,
  respondidos,
  aoAlternar,
}: {
  grupo: Bloco;
  aberto: boolean;
  respondidos: number;
  aoAlternar: () => void;
}) {
  const completo = respondidos === grupo.total;

  return (
    <Pressable
      style={({ pressed }) => [
        estilos.grupo,
        aberto && estilos.grupoAberto,
        pressed && estilos.grupoPressionado,
      ]}
      onPress={aoAlternar}
      accessibilityRole="button"
      accessibilityState={{ expanded: aberto }}
      accessibilityLabel={`${grupo.titulo}, ${respondidos} de ${grupo.total} respondidos`}
    >
      <Text style={estilos.etiquetaGrupo}>{grupo.etiqueta}</Text>
      <Text style={estilos.tituloGrupo}>{grupo.titulo}</Text>

      {/* Com o bloco fechado, este contador é a única pista de progresso
          — por isso ele fica sempre visível, aberto ou não. */}
      <Text style={[estilos.contagemGrupo, completo && estilos.contagemCompleta]}>
        {completo ? '✓ ' : ''}
        {respondidos}/{grupo.total}
      </Text>

      <Ionicons
        name={aberto ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={Cores.textoSecundario}
      />
    </Pressable>
  );
}

/** A seção da norma dentro de um bloco (só aparece na diária). */
/**
 * O cartão de uma verificação da rotina guiada.
 *
 * Três respostas em vez de quatro. "Não se aplica" fica de fora de
 * propósito: ele esconde o item das próximas inspeções (RF09), e
 * aplicá-lo de uma vez a quatro exigências da norma é decisão pesada
 * demais para um toque. Quem quiser marcar isso abre o detalhe e o faz
 * item a item, com o aviso de sempre.
 */
function CartaoVerificacao({
  verificacao,
  estado,
  detalhado,
  aoResponder,
  aoDetalhar,
}: {
  verificacao: VerificacaoChecklist;
  estado: EstadoVerificacao;
  detalhado: boolean;
  aoResponder: (resposta: Resposta) => void;
  aoDetalhar: (abrir?: boolean) => void;
}) {
  return (
    <View style={[estilos.item, estiloDaVerificacao[estado]]}>
      <View style={estilos.itemTopo}>
        <Text style={estilos.tituloVerificacao}>{verificacao.titulo}</Text>

        {verificacao.critica ? (
          <View style={[estilos.selo, estilos.seloCritico]}>
            <Text style={estilos.seloCriticoTexto}>crítico</Text>
          </View>
        ) : null}
      </View>

      <Text style={estilos.textoItem}>{verificacao.texto}</Text>

      {/* A rastreabilidade até a norma: quais exigências esta pergunta
          cobre. Sem isso, o agrupamento viraria uma caixa-preta. */}
      <View style={estilos.codigos}>
        <Text style={estilos.codigosRotulo}>cobre</Text>
        {verificacao.codigos.map((codigo) => (
          <Text key={codigo} style={estilos.codigoCoberto}>
            {codigo}
          </Text>
        ))}
      </View>

      <View style={estilos.botoes}>
        <Pressable
          onPress={() => aoResponder('adequado')}
          style={[estilos.botao, estado === 'conforme' && estiloEscolhido.adequado]}
          accessibilityRole="radio"
          accessibilityState={{ selected: estado === 'conforme' }}
        >
          <Text
            style={[
              estilos.botaoTexto,
              estado === 'conforme' && estiloTextoEscolhido.adequado,
            ]}
          >
            Conforme
          </Text>
        </Pressable>

        {/* "Não conforme" NÃO grava nada: ele abre o detalhe para você
            dizer QUAL exigência falhou. Marcar as quatro como
            inadequadas de uma vez exageraria o problema e derrubaria o
            score sem motivo. */}
        <Pressable
          onPress={() => aoDetalhar(true)}
          style={[estilos.botao, estado === 'nao_conforme' && estiloEscolhido.inadequado]}
          accessibilityRole="button"
        >
          <Text
            style={[
              estilos.botaoTexto,
              estado === 'nao_conforme' && estiloTextoEscolhido.inadequado,
            ]}
          >
            Não conforme
          </Text>
        </Pressable>

        <Pressable
          onPress={() => aoResponder('nao_observado')}
          style={[estilos.botao, estado === 'nao_avaliado' && estiloEscolhido.nao_observado]}
          accessibilityRole="radio"
          accessibilityState={{ selected: estado === 'nao_avaliado' }}
        >
          <Text
            style={[
              estilos.botaoTexto,
              estado === 'nao_avaliado' && estiloTextoEscolhido.nao_observado,
            ]}
          >
            Não observado
          </Text>
        </Pressable>

        <Pressable onPress={() => aoDetalhar()} style={estilos.botao} accessibilityRole="button">
          <Text style={estilos.botaoTexto}>
            {detalhado ? 'Ocultar itens' : `Ver os ${verificacao.itens.length} itens`}
          </Text>
        </Pressable>
      </View>

      {estado === 'parcial' ? (
        <Text style={estilos.avisoParcial}>
          Respondida em parte — abra os itens para completar.
        </Text>
      ) : null}
    </View>
  );
}

function CabecalhoSecao({ linha }: { linha: Extract<Linha, { tipo: 'secao' }> }) {
  return (
    <View style={estilos.secao}>
      <Text style={estilos.codigoSecao}>{linha.codigo}</Text>
      <Text style={estilos.tituloSecao}>{linha.nome}</Text>
      <Text style={estilos.contagemSecao}>
        {linha.quantidade} {linha.quantidade === 1 ? 'item' : 'itens'}
      </Text>
    </View>
  );
}

function LinhaItem({
  item,
  resposta,
  recuado,
  aoResponder,
}: {
  item: ItemChecklist;
  resposta: Resposta | undefined;
  /** Recuado = está aberto dentro de uma verificação da rotina. */
  recuado?: boolean;
  aoResponder: (resposta: Resposta) => void;
}) {
  // Cada item lembra sozinho se está com a norma aberta. Guardar isso na
  // tela inteira faria a lista redesenhar por causa de um item só.
  const [normaAberta, setNormaAberta] = useState(false);

  return (
    <View
      style={[
        estilos.item,
        resposta ? estilos.itemRespondido : null,
        recuado ? estilos.itemRecuado : null,
      ]}
    >
      <View style={estilos.itemTopo}>
        <Text style={estilos.codigoItem}>{item.codigo_rdc}</Text>

        {/* `critico` vem do banco como 0 ou 1 (o SQLite não tem booleano). */}
        {item.critico === 1 ? (
          <View style={[estilos.selo, estilos.seloCritico]}>
            <Text style={estilos.seloCriticoTexto}>crítico</Text>
          </View>
        ) : null}

        <View
          style={[
            estilos.selo,
            item.frequencia === 'semestral' ? estilos.seloLegal : estilos.seloTrilha,
          ]}
        >
          <Text
            style={
              item.frequencia === 'semestral' ? estilos.seloLegalTexto : estilos.seloTrilhaTexto
            }
          >
            {ROTULO_TRILHA_CURTO[item.frequencia]}
            {item.periodicidade_dias ? ` · ${item.periodicidade_dias}d` : ''}
          </Text>
        </View>
      </View>

      {/* O RESUMO em tópicos é o que se lê no dia a dia; o texto da
          norma fica a um toque, para quem precisar da redação exata. */}
      {item.topicos.length > 0 ? (
        <View style={estilos.topicos}>
          {item.topicos.map((topico) => (
            <View key={topico} style={estilos.topico}>
              <Text style={estilos.marcador}>•</Text>
              <Text style={estilos.topicoTexto}>{topico}</Text>
            </View>
          ))}
        </View>
      ) : (
        // Sem resumo (item novo ou seed antigo), mostra o texto integral:
        // é melhor um parágrafo longo do que um item vazio.
        <Text style={estilos.textoItem}>{item.texto}</Text>
      )}

      {item.topicos.length > 0 ? (
        <>
          <Pressable
            onPress={() => setNormaAberta((aberta) => !aberta)}
            style={({ pressed }) => [estilos.verNorma, pressed && estilos.pressionado]}
            accessibilityRole="button"
            accessibilityState={{ expanded: normaAberta }}
          >
            <Ionicons
              name={normaAberta ? 'chevron-up' : 'document-text-outline'}
              size={14}
              color={Cores.textoSecundario}
            />
            <Text style={estilos.verNormaTexto}>
              {normaAberta ? 'Ocultar texto da norma' : `Ver texto da norma ${item.codigo_rdc}`}
            </Text>
          </Pressable>

          {normaAberta ? <Text style={estilos.textoNorma}>{item.texto}</Text> : null}
        </>
      ) : null}

      {/* Os quatro botões do RF06. Ficam em duas linhas de dois porque
          quatro lado a lado espremem o texto em tela de celular. */}
      <View style={estilos.botoes}>
        {RESPOSTAS.map((opcao) => {
          const escolhida = resposta === opcao;
          return (
            <Pressable
              key={opcao}
              onPress={() => aoResponder(opcao)}
              style={[estilos.botao, escolhida && estiloEscolhido[opcao]]}
              accessibilityRole="radio"
              accessibilityState={{ selected: escolhida }}
              accessibilityLabel={ROTULO_RESPOSTA[opcao]}
            >
              <Text style={[estilos.botaoTexto, escolhida && estiloTextoEscolhido[opcao]]}>
                {ROTULO_RESPOSTA[opcao]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Padding do conteúdo da lista. É constante, e não literal, porque a
 * conta do botão que sobe para o header precisa do mesmo número: se um
 * mudar sem o outro, o ponto de troca sai do lugar.
 */
const PADDING_CONTEUDO = 20;

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: Cores.fundo },
  conteudo: { padding: PADDING_CONTEUDO, paddingBottom: 40 },
  centro: {
    flex: 1,
    backgroundColor: Cores.fundo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aviso: { fontSize: 14, color: Cores.textoSuave },
  vazio: { fontSize: 14, color: Cores.textoSecundario, marginTop: 20 },

  cabecalho: { marginBottom: 8 },
  etiqueta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Cores.primariaTexto,
  },
  titulo: { fontSize: 22, fontWeight: '700', color: Cores.texto, marginTop: 4 },

  barra: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Cores.borda,
    marginTop: 14,
    overflow: 'hidden',
  },
  barraPreenchida: { height: 8, backgroundColor: Cores.primaria },
  linhaProgresso: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  progressoTexto: { fontSize: 12, color: Cores.textoSecundario },
  botaoRecolher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // Área de toque maior que o texto, sem empurrar o layout.
    paddingVertical: 4,
    paddingLeft: 8,
  },
  botaoRecolherTexto: { fontSize: 13, fontWeight: '600', color: Cores.primariaTexto },
  // No header da rota o botão encosta na borda da tela; o padding
  // afasta e ainda mantém a área de toque confortável.
  botaoRecolherHeader: { paddingRight: 16, paddingLeft: 12, paddingVertical: 8 },
  pressionado: { opacity: 0.6 },

  // --- cartão de progresso fixo ---
  // A área ocupa a largura toda mas é `box-none`: só o cartão dentro
  // dela recebe toque, e o resto da faixa deixa passar para a lista.
  flutuanteArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  flutuanteCartao: {
    // Translúcido: deixa entrever a lista passando por baixo, em vez de
    // parecer que o conteúdo termina ali.
    backgroundColor: Cores.superficieFlutuante,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Cores.borda,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    // A sombra é o que faz o cartão parecer POR CIMA da lista, e não
    // parte dela.
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  // Opacidade, e não outra cor de fundo: com o cartão translúcido, uma
  // troca de cor apareceria como um piscar sujo.
  flutuantePressionado: { opacity: 0.85 },
  flutuanteLinha: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flutuanteTexto: { flex: 1, fontSize: 13, fontWeight: '600', color: Cores.texto },
  flutuantePorcentagem: { fontSize: 15, fontWeight: '700', color: Cores.primariaTexto },
  flutuanteBarra: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Cores.borda,
    marginTop: 8,
    overflow: 'hidden',
  },
  flutuanteBarraPreenchida: { height: 5, backgroundColor: Cores.primaria },
  invisivel: { opacity: 0 },

  dica: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Cores.primariaClara,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  dicaTexto: { flex: 1, fontSize: 12, lineHeight: 18, color: Cores.sobrePrimaria },

  // --- bloco recolhível (primeiro nível) ---
  grupo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Cores.borda,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 14,
    marginBottom: 4,
  },
  grupoAberto: { borderColor: Cores.primaria },
  grupoPressionado: { backgroundColor: Cores.fundo },
  etiquetaGrupo: {
    fontSize: 12,
    fontWeight: '700',
    color: Cores.sobrePrimaria,
    backgroundColor: Cores.primaria,
    minWidth: 26,
    textAlign: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tituloGrupo: { flex: 1, fontSize: 15, fontWeight: '700', color: Cores.texto },
  contagemGrupo: { fontSize: 13, fontWeight: '600', color: Cores.textoSuave },
  contagemCompleta: { color: Cores.primariaTexto },

  // --- seção da RDC dentro do bloco (segundo nível) ---
  secao: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  codigoSecao: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.sobrePrimaria,
    backgroundColor: Cores.primariaClara,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tituloSecao: { flex: 1, fontSize: 13, fontWeight: '700', color: Cores.textoSecundario },
  contagemSecao: { fontSize: 12, color: Cores.textoSuave },

  item: {
    backgroundColor: Cores.superficie,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Cores.borda,
  },
  // Uma borda verde discreta marca o que já foi respondido, para dar
  // noção de avanço ao rolar a lista.
  itemRespondido: { borderColor: Cores.primaria },
  // Item aberto dentro de uma verificação: recuado e com uma faixa à
  // esquerda, para ficar claro que pertence ao cartão de cima.
  itemRecuado: {
    marginLeft: 16,
    borderLeftWidth: 3,
    borderLeftColor: Cores.borda,
  },
  tituloVerificacao: { flex: 1, fontSize: 15, fontWeight: '700', color: Cores.texto },
  codigos: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10 },
  codigosRotulo: {
    fontSize: 11,
    color: Cores.textoSuave,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codigoCoberto: {
    fontSize: 11,
    fontWeight: '700',
    color: Cores.primariaTexto,
    backgroundColor: Cores.fundo,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    overflow: 'hidden',
  },
  avisoParcial: { fontSize: 12, color: Cores.acentoTexto, marginTop: 10 },
  itemTopo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  codigoItem: { flex: 1, fontSize: 12, fontWeight: '700', color: Cores.primariaTexto },
  textoItem: { fontSize: 14, lineHeight: 21, color: Cores.textoSecundario },

  topicos: { gap: 4 },
  topico: { flexDirection: 'row', gap: 8 },
  marcador: { fontSize: 14, lineHeight: 21, color: Cores.primaria },
  topicoTexto: { flex: 1, fontSize: 14, lineHeight: 21, color: Cores.texto },
  verNorma: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  verNormaTexto: { fontSize: 12, fontWeight: '600', color: Cores.textoSecundario },
  // O texto integral vem recuado e em cinza: é referência, não a
  // instrução principal.
  textoNorma: {
    fontSize: 13,
    lineHeight: 20,
    color: Cores.textoSecundario,
    marginTop: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: Cores.borda,
  },

  selo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  seloTrilha: { backgroundColor: Cores.fundo },
  seloTrilhaTexto: { fontSize: 11, fontWeight: '600', color: Cores.textoSecundario },
  seloLegal: { backgroundColor: Cores.primariaClara },
  seloLegalTexto: { fontSize: 11, fontWeight: '700', color: Cores.sobrePrimaria },
  seloCritico: { backgroundColor: Cores.acentoSuave },
  seloCriticoTexto: { fontSize: 11, fontWeight: '700', color: Cores.acentoForte },

  botoes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  botao: {
    // ~metade da largura, descontando o espaço entre os dois botões.
    flexBasis: '47%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Cores.borda,
    backgroundColor: Cores.fundo,
  },
  botaoTexto: { fontSize: 13, fontWeight: '600', color: Cores.textoSecundario },

  botaoConcluir: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Cores.primaria,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 24,
  },
  botaoPressionado: { backgroundColor: Cores.primariaEscura },
  botaoConcluirTexto: { fontSize: 15, fontWeight: '700', color: Cores.sobrePrimaria },
});

/**
 * A cor de cada resposta quando ela está escolhida.
 *
 * Verde para adequado, magenta (o "vermelho" desta paleta) para
 * inadequado, e cinza para as duas respostas que não são julgamento de
 * conformidade — "não se aplica" e "não observado" apenas tiram o item
 * da conta, e não devem parecer erro.
 */
const estiloEscolhido = StyleSheet.create({
  adequado: { backgroundColor: Cores.primariaClara, borderColor: Cores.primaria },
  inadequado: { backgroundColor: Cores.acentoSuave, borderColor: Cores.acento },
  nao_se_aplica: { backgroundColor: Cores.borda, borderColor: Cores.textoSuave },
  nao_observado: { backgroundColor: Cores.borda, borderColor: Cores.textoSuave },
});

const estiloTextoEscolhido = StyleSheet.create({
  adequado: { color: Cores.sobrePrimaria, fontWeight: '700' },
  inadequado: { color: Cores.acentoForte, fontWeight: '700' },
  nao_se_aplica: { color: Cores.texto, fontWeight: '700' },
  nao_observado: { color: Cores.texto, fontWeight: '700' },
});

/** A borda do cartão de verificação conforme o estado dele. */
const estiloDaVerificacao = StyleSheet.create({
  conforme: { borderColor: Cores.primaria },
  nao_conforme: { borderColor: Cores.acento },
  nao_avaliado: { borderColor: Cores.textoSuave },
  parcial: { borderColor: Cores.acentoSuave },
  pendente: { borderColor: Cores.borda },
});
