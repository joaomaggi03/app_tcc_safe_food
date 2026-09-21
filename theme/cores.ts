/**
 * theme/cores.ts
 * ---------------------------------------------------------------
 * A PALETA DO APP, num lugar só.
 *
 * Regra: nenhuma tela escreve um código hexadecimal direto. Todas
 * importam daqui. Assim, mudar a identidade visual do app é mexer
 * num arquivo, e não caçar '#006DB2' em vinte lugares.
 *
 * A paleta tem quatro rampas de 7 tons (100 = mais claro, 700 = mais
 * escuro). Os tons 100-700 são a paleta "crua"; abaixo deles estão os
 * NOMES SEMÂNTICOS (texto, fundo, primaria...), que é o que as telas
 * devem usar no dia a dia. Semântico é melhor porque descreve a
 * função, não a aparência: `Cores.textoSuave` continua fazendo
 * sentido se um dia o cinza mudar de tom.
 */

/** Azul — cor primária da marca. O tom 300 (#006DB2) é a primária. */
export const azul = {
  100: '#D3EAF8',
  200: '#6FB6E3',
  300: '#006DB2',
  400: '#005A93',
  500: '#004672',
  600: '#002D4A',
  700: '#001726',
} as const;

/**
 * Verde — foi a primária até a troca para o azul. Continua na paleta só
 * como a ponta "100%" do medidor de score: verde é a convenção universal
 * de "bom" num medidor, e trocar pelo azul da marca apagaria isso.
 */
export const verde = {
  100: '#A2FCBA',
  200: '#4DD97D',
  300: '#3CAE63',
  400: '#2C854A',
  500: '#1C5E33',
  600: '#0E391D',
  700: '#031809',
} as const;

/** Rosa/magenta — cor de acento. Único contraste de matiz da paleta. */
export const rosa = {
  100: '#F5D0E4',
  200: '#EB99CA',
  300: '#E358B2',
  400: '#AE3C87',
  500: '#78275C',
  600: '#461335',
  700: '#230619',
} as const;

/** Neutros — fundos, textos e bordas. */
export const cinza = {
  100: '#E5E9E6',
  200: '#BCC2BD',
  300: '#969B97',
  400: '#727673',
  500: '#505351',
  600: '#303231',
  700: '#131413',
} as const;

const branco = '#FFFFFF';

/**
 * Âmbar — só para o MEIO do degradê do medidor de score.
 *
 * A paleta não tem amarelo, e o degradê direto do rosa para o verde
 * passa por um cinza barrento no meio. O âmbar é a ponte; não vira cor
 * de texto nem de selo em lugar nenhum.
 */
const ambar = '#F2B33D';

/**
 * Branco translúcido, para o que FLUTUA sobre o conteúdo.
 *
 * A transparência não é enfeite: ela mostra que há lista passando por
 * baixo do elemento, em vez de sugerir que o conteúdo acabou ali. O
 * valor é alto (93%) de propósito — o suficiente para o texto continuar
 * legível sobre qualquer coisa que passe atrás.
 */
const brancoTranslucido = 'rgba(255, 255, 255, 0.93)';

/**
 * NOMES SEMÂNTICOS — use estes nas telas.
 *
 * Sobre legibilidade: o azul 300 é ESCURO — passa como texto sobre
 * branco (5,5:1) e pede texto BRANCO por cima dele, não escuro. Por isso
 * há dois tokens de "texto sobre a primária":
 *  - `sobrePrimaria`: em cima do azul sólido (botões, etiquetas);
 *  - `sobrePrimariaClara`: em cima do `primariaClara` (selos, dicas),
 *    onde o branco sumiria.
 * Com o verde antigo um token bastava, porque o verde era claro e o
 * mesmo texto escuro servia nos dois fundos.
 */
export const Cores = {
  // Marca
  primaria: azul[300],           // preenchimentos, destaques, marca
  primariaTexto: azul[300],      // o azul como texto sobre branco (5,5:1)
  primariaEscura: azul[500],     // estados pressionados
  primariaClara: azul[100],      // fundos suaves, realces

  /** Texto em cima do azul primário SÓLIDO (branco, 5,5:1). */
  sobrePrimaria: branco,
  /** Texto em cima do `primariaClara` (azul-escuro, 11,5:1). */
  sobrePrimariaClara: azul[600],

  // Acento (usado com parcimônia: alertas, erros, ênfase)
  acento: rosa[300],
  acentoTexto: rosa[400],     // magenta como texto sobre branco (5,5:1)
  acentoSuave: rosa[100],     // fundo de selos e avisos
  acentoForte: rosa[500],     // texto sobre o acentoSuave (6,7:1)

  // Superfícies
  fundo: cinza[100],             // fundo das telas
  superficie: branco,            // cartões
  superficieFlutuante: brancoTranslucido, // o que passa por cima do conteúdo
  borda: cinza[200],
  divisor: cinza[100],

  // Texto
  texto: cinza[700],             // títulos e texto principal
  textoSecundario: cinza[500],   // parágrafos de apoio
  textoSuave: cinza[400],        // legendas, rótulos discretos
  textoInvertido: branco,

  /** Cor da sombra dos elementos que flutuam sobre o conteúdo. */
  sombra: cinza[700],

  // Navegação
  abaAtiva: azul[300],
  abaInativa: cinza[400],

  // Medidor de score: o arco vai do rosa (0%) ao verde (100%)
  medidorInicio: rosa[300],
  medidorMeio: ambar,
  medidorFim: verde[300],
} as const;

export default Cores;
