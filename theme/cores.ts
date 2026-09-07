/**
 * theme/cores.ts
 * ---------------------------------------------------------------
 * A PALETA DO APP, num lugar só.
 *
 * Regra: nenhuma tela escreve um código hexadecimal direto. Todas
 * importam daqui. Assim, mudar a identidade visual do app é mexer
 * num arquivo, e não caçar '#3CAE63' em vinte lugares.
 *
 * A paleta tem três rampas de 7 tons (100 = mais claro, 700 = mais
 * escuro). Os tons 100-700 são a paleta "crua"; abaixo deles estão os
 * NOMES SEMÂNTICOS (texto, fundo, primaria...), que é o que as telas
 * devem usar no dia a dia. Semântico é melhor porque descreve a
 * função, não a aparência: `Cores.textoSuave` continua fazendo
 * sentido se um dia o cinza mudar de tom.
 */

/** Verde — cor primária da marca. O tom 300 (#3CAE63) é a primária. */
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
 * Sobre legibilidade: o verde 300 é claro demais para servir de TEXTO
 * sobre fundo branco (contraste 2.8:1, abaixo do mínimo de 4.5:1). Por
 * isso ele aparece como PREENCHIMENTO (etiquetas, botões), enquanto o
 * texto em verde usa o tom 400, que passa com 4.6:1. É o mesmo verde
 * da marca, só um passo mais escuro onde precisa ser lido.
 */
export const Cores = {
  // Marca
  primaria: verde[300],          // preenchimentos, destaques, marca
  primariaTexto: verde[400],     // o verde quando ele é texto sobre branco
  primariaEscura: verde[500],    // estados pressionados
  primariaClara: verde[100],     // fundos suaves, realces

  /** Texto escuro para usar EM CIMA do verde primário (contraste 6.5:1). */
  sobrePrimaria: verde[700],

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

  // Navegação
  abaAtiva: verde[400],
  abaInativa: cinza[400],
} as const;

export default Cores;
