/**
 * Gera os PNGs de `assets/` a partir de `marca.svg`.
 *
 *     npm run icones
 *
 * POR QUE UM GERADOR E NÃO SEIS PNGs SOLTOS: os ícones do app não são seis
 * imagens diferentes, são a MESMA marca em seis recortes. Com o gerador, mudar
 * o desenho ou a cor é mexer em um arquivo e rodar um comando; sem ele, é
 * reexportar seis vezes à mão e torcer para não esquecer nenhum.
 *
 * POR QUE O CHROME RASTERIZA: converter SVG em PNG exige um renderizador.
 * Em vez de acrescentar `sharp`/`resvg` ao projeto — dependência nativa, que
 * complica o build do Expo — usamos o navegador que já está instalado na
 * máquina. O script não entra no bundle do app; roda só aqui no PC.
 *
 * Se a máquina não tiver Chrome nem Edge no caminho padrão, aponte:
 *     CHROME="/caminho/do/chrome" npm run icones
 */
import { existsSync, mkdtempSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(AQUI, '..');

/** O azul da marca. É o mesmo `cores.primaria` de `theme/cores.ts`. */
const AZUL = '#006DB2';
const BRANCO = '#FFFFFF';

/**
 * Cada alvo: tamanho do quadrado, cor da marca, cor do fundo (`null` =
 * transparente), fração do lado que a marca ocupa e raio de canto.
 */
const ALVOS = [
  {
    arquivo: 'icon.png',
    lado: 1024, marca: BRANCO, fundo: AZUL, escala: 0.66,
    // iOS e as lojas querem um quadrado OPACO — quem arredonda é o sistema.
    // Sem canal alfa: a App Store rejeita ícone com transparência.
  },
  {
    arquivo: 'android-icon-foreground.png',
    lado: 1024, marca: BRANCO, fundo: null, escala: 0.46,
    // Camada de frente do ícone adaptativo. A escala é baixa porque o Android
    // recorta o ícone na forma do launcher (círculo, squircle, quadrado) e só
    // garante os ~66% centrais. Marca maior que isso seria cortada em alguns
    // aparelhos e inteira em outros.
  },
  {
    arquivo: 'android-icon-background.png',
    lado: 1024, marca: AZUL, fundo: AZUL, escala: 0,
    // Camada de trás: azul chapado. `escala: 0` = só o fundo.
  },
  {
    arquivo: 'android-icon-monochrome.png',
    lado: 1024, marca: BRANCO, fundo: null, escala: 0.46,
    // Tema material do Android 13+. O sistema usa só o ALFA e pinta com a cor
    // do tema do usuário, então a cor gravada aqui é irrelevante — o que
    // importa é a silhueta. Funciona porque a marca é de uma cor só.
  },
  {
    arquivo: 'notification-icon.png',
    lado: 96, marca: BRANCO, fundo: null, escala: 0.92,
    // Barra de status do Android. Mesma regra do monocromático: o sistema
    // achata tudo em branco pelo alfa. Se apontássemos o ícone colorido aqui,
    // o quadrado azul inteiro viraria um borrão branco sólido — é o escudo
    // VAZADO que salva, porque o miolo dele é transparente.
    // 96px é o tamanho que a documentação do Expo recomenda.
  },
  {
    arquivo: 'favicon.png',
    lado: 48, marca: BRANCO, fundo: AZUL, escala: 0.66, raio: 10,
    // Web. Aqui o raio é gravado no PNG: navegador não arredonda favicon.
  },
  {
    arquivo: 'splash-icon.png',
    lado: 1024, marca: AZUL, fundo: null, escala: 0.52,
    // Marca azul sobre transparente, para pousar em fundo claro.
  },
];

/** Chrome ou Edge — qualquer um serve, os dois são Chromium. */
function acharNavegador() {
  const candidatos = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);

  const achado = candidatos.find((c) => existsSync(c));
  if (!achado) {
    throw new Error(
      'Chrome/Edge não encontrado. Rode com CHROME="/caminho/do/chrome" npm run icones'
    );
  }
  return achado;
}

/** Uma página do tamanho exato do PNG, com o SVG centrado dentro. */
function pagina(svg, { lado, marca, fundo, escala, raio = 0 }) {
  const tam = Math.round(lado * escala);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;width:${lado}px;height:${lado}px;overflow:hidden}
.caixa{width:${lado}px;height:${lado}px;color:${marca};border-radius:${raio}px;
  ${fundo ? `background:${fundo};` : ''}
  display:flex;align-items:center;justify-content:center}
svg{width:${tam}px;height:${tam}px;display:block}
</style></head><body><div class="caixa">${escala > 0 ? svg : ''}</div></body></html>`;
}

async function main() {
  const navegador = acharNavegador();
  const svg = await readFile(path.join(AQUI, 'marca.svg'), 'utf8');
  const temp = mkdtempSync(path.join(tmpdir(), 'icones-'));

  for (const alvo of ALVOS) {
    const html = path.join(temp, alvo.arquivo.replace('.png', '.html'));
    const destino = path.join(ASSETS, alvo.arquivo);
    writeFileSync(html, pagina(svg, alvo), 'utf8');

    const r = spawnSync(navegador, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // Sem isto o Chrome pinta o fundo de branco e não sobra transparência.
      '--default-background-color=00000000',
      `--window-size=${alvo.lado},${alvo.lado}`,
      // Precisa ser caminho ABSOLUTO: com caminho relativo o Chrome resolve
      // contra o diretório dele e falha com "acesso negado".
      `--screenshot=${destino}`,
      'file:///' + html.replace(/\\/g, '/'),
    ]);

    if (r.status !== 0 || !existsSync(destino)) {
      throw new Error(`falhou ao gerar ${alvo.arquivo}: ${r.stderr}`);
    }
    const { size } = statSync(destino);
    console.log(`  ${alvo.arquivo.padEnd(30)} ${alvo.lado}x${alvo.lado}  ${size} bytes`);
  }

  console.log(`\n${ALVOS.length} ícones gerados em assets/.`);
  console.log('Ícone é recurso NATIVO: só aparece no aparelho depois de um build novo.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
