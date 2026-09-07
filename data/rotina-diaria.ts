/**
 * data/rotina-diaria.ts
 * ---------------------------------------------------------------
 * A ROTINA DIÁRIA GUIADA — o modo de preenchimento rápido da trilha
 * diária (RF06).
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Os 32 itens diários do `rdc216.ts` estão redigidos na linguagem da
 * norma: descrevem um ESTADO de conformidade ("são adotadas medidas
 * contra contaminação cruzada"), e não uma ação que alguém confere no
 * meio do expediente. Responder 32 enunciados desses todo dia, numa
 * cozinha em operação, não acontece.
 *
 * Aqui esses mesmos itens são reagrupados em 11 verificações, cada uma
 * cobrindo um conjunto de exigências que se verificam JUNTAS, no mesmo
 * momento e pela mesma pessoa. O usuário responde 11 vezes em vez de 32.
 *
 * O QUE NÃO MUDA
 * A norma. Nenhum texto da RDC foi reescrito e nenhuma exigência foi
 * criada ou removida: cada verificação apenas APONTA para os itens que
 * cobre, pelo id, e o app grava a resposta item a item na tabela
 * `resposta`. O score (RF04) continua sendo calculado sobre os itens da
 * norma, e a tela mostra os códigos cobertos por cada pergunta — a
 * rastreabilidade até a RDC 216 fica visível para o usuário.
 *
 * O agrupamento, sim, é decisão do app — da mesma natureza da
 * `frequencia` e do `momento`. É o tipo de escolha que precisa ser
 * justificada no TCC, e o critério adotado foi: mesma etapa do
 * expediente + mesmo tipo de verificação (higiene pessoal, temperatura,
 * separação cru/pronto...).
 *
 * COBERTURA
 * As 11 verificações cobrem os 32 itens diários, sem sobra e sem
 * repetição. Um item novo com `frequencia: 'diario'` no rdc216.ts
 * precisa ser acrescentado a alguma pergunta daqui, senão ele só
 * aparecerá no modo completo.
 */

import type { MomentoDia } from './rdc216';

export interface VerificacaoRotina {
  id: string;
  /** Em que ponto do expediente esta verificação é feita. */
  momento: MomentoDia;
  /** Nome curto, para o cabeçalho do cartão. */
  titulo: string;
  /** O enunciado da verificação, em linguagem técnica e operacional. */
  texto: string;
  /** IDs dos itens de `ITENS` (data/rdc216.ts) cobertos por ela. */
  itens: string[];
}

export const ROTINA_DIARIA: VerificacaoRotina[] = [
  // ------------------------------------------------------------------
  // ANTES DE ABRIR — estado verificável com a operação parada.
  // ------------------------------------------------------------------
  {
    id: 'rot_manipuladores',
    momento: 'abertura',
    titulo: 'Higiene e saúde dos manipuladores',
    texto:
      'Uniformes limpos e trocados diariamente, cabelos protegidos, unhas curtas e sem ' +
      'esmalte, ausência de adornos e maquiagem; manipuladores com lesões ou sintomas de ' +
      'doença afastados da manipulação de alimentos.',
    itens: ['mani_02', 'mani_03', 'mani_07'],
  },
  {
    id: 'rot_materias_primas',
    momento: 'abertura',
    titulo: 'Matérias-primas e armazenamento',
    texto:
      'Matérias-primas e ingredientes em condições higiênico-sanitárias adequadas; produtos ' +
      'armazenados identificados com designação, data de preparo e prazo de validade, sob ' +
      'temperatura monitorada; alimentos preparados e refrigerados consumidos em até 5 dias.',
    itens: ['prep_01', 'prep_17', 'prep_18'],
  },
  {
    id: 'rot_area_consumo',
    momento: 'abertura',
    titulo: 'Área de consumo e utensílios',
    texto:
      'Áreas de exposição e refeitório organizadas e em boas condições higiênico-sanitárias; ' +
      'utensílios de consumo descartáveis ou devidamente higienizados e guardados protegidos ' +
      'contra contaminação.',
    itens: ['expo_01', 'expo_05'],
  },
  {
    // Só aparece nos perfis móveis: os itens 4.9.x não se aplicam aos
    // estabelecimentos fixos, e a pergunta some sozinha quando nenhum
    // item dela sobrevive ao filtro de perfil (RF03).
    id: 'rot_transporte',
    momento: 'abertura',
    titulo: 'Transporte do alimento preparado',
    texto:
      'Alimentos destinados ao transporte identificados com produto, data de preparo e prazo ' +
      'de validade, e devidamente protegidos; meio de transporte higienizado, coberto e sem ' +
      'cargas que comprometam o alimento; tempo e temperatura monitorados no trajeto.',
    itens: ['tran_01', 'tran_02', 'tran_03'],
  },

  // ------------------------------------------------------------------
  // DURANTE O SERVIÇO — só observável com a operação em andamento.
  // ------------------------------------------------------------------
  {
    id: 'rot_maos_conduta',
    momento: 'servico',
    titulo: 'Higienização das mãos e conduta',
    texto:
      'Lavagem e antissepsia das mãos ao iniciar a manipulação, a cada troca de atividade e ' +
      'após o uso do sanitário; ausência de fumo, alimentação e manuseio de dinheiro durante ' +
      'a manipulação de alimentos.',
    itens: ['mani_04', 'mani_06'],
  },
  {
    id: 'rot_contaminacao_cruzada',
    momento: 'servico',
    titulo: 'Prevenção de contaminação cruzada',
    texto:
      'Separação entre alimentos crus, semipreparados e prontos, com utensílios e superfícies ' +
      'distintos; higienização das mãos na transição entre eles; alimentos consumidos crus ' +
      'submetidos a higienização com produto regularizado.',
    itens: ['prep_03', 'prep_04', 'prep_19'],
  },
  {
    id: 'rot_tratamento_termico',
    momento: 'servico',
    titulo: 'Tratamento térmico e fritura',
    texto:
      'Cocção atingindo no mínimo 70 °C em todas as partes do alimento, ou combinação de ' +
      'tempo e temperatura equivalente, com verificação por temperatura, cor e textura; óleos ' +
      'e gorduras aquecidos a no máximo 180 °C e substituídos ao apresentarem alteração de ' +
      'cor, odor, espuma ou fumaça.',
    itens: ['prep_08', 'prep_09', 'prep_10', 'prep_11'],
  },
  {
    id: 'rot_descongelamento',
    momento: 'servico',
    titulo: 'Descongelamento',
    texto:
      'Descongelamento conduzido sob refrigeração abaixo de 5 °C ou em forno de micro-ondas ' +
      'com cocção imediata, nunca à temperatura ambiente; alimentos congelados descongelados ' +
      'antes da cocção, salvo orientação do fabricante; produtos descongelados mantidos sob ' +
      'refrigeração e não recongelados.',
    itens: ['prep_12', 'prep_13', 'prep_14'],
  },
  {
    id: 'rot_tempo_temperatura',
    momento: 'servico',
    titulo: 'Espera, conservação a quente e resfriamento',
    texto:
      'Alimentos perecíveis mantidos à temperatura ambiente somente pelo tempo mínimo ' +
      'necessário ao preparo; conservação a quente acima de 60 °C por no máximo 6 horas; ' +
      'resfriamento de 60 °C a 10 °C em até 2 horas, com manutenção posterior abaixo de 5 °C ' +
      'ou congelamento a −18 °C.',
    itens: ['prep_05', 'prep_15', 'prep_16'],
  },
  {
    id: 'rot_sobras_embalagens',
    momento: 'servico',
    titulo: 'Sobras e embalagens',
    texto:
      'Sobras de matérias-primas acondicionadas e identificadas com produto, data de ' +
      'fracionamento e prazo de validade após a abertura; embalagens higienizadas antes de ' +
      'serem abertas.',
    itens: ['prep_06', 'prep_07'],
  },
  {
    id: 'rot_exposicao',
    momento: 'servico',
    titulo: 'Exposição ao consumo',
    texto:
      'Higienização das mãos e uso de utensílios ou luvas descartáveis ao porcionar e servir; ' +
      'equipamentos de exposição a quente e a frio conservados e com temperatura monitorada ' +
      'regularmente.',
    itens: ['expo_02', 'expo_03'],
  },

  // ------------------------------------------------------------------
  // NO FECHAMENTO — a própria norma amarra ao fim do trabalho (4.2.4).
  // ------------------------------------------------------------------
  {
    id: 'rot_fechamento',
    momento: 'fechamento',
    titulo: 'Higienização final e resíduos',
    texto:
      'Higienização da área de preparo ao término do trabalho, sem uso de odorizantes nas ' +
      'áreas de alimentos; resíduos coletados e estocados em local fechado, isolado das áreas ' +
      'de preparo e armazenamento.',
    itens: ['higi_04', 'resi_03'],
  },
];
