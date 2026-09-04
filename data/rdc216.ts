/**
 * SEED DA RDC 216/2004 — Base de dados do checklist sanitário
 * ------------------------------------------------------------
 * Fase 1 do plano de implementação. Este arquivo transforma a norma
 * (RDC nº 216/2004 da ANVISA) em dados estruturados que alimentam o
 * checklist dinâmico do app.
 *
 * Fontes:
 *  - Texto oficial da RDC 216/2004 (seções 4.1 a 4.12) — domínio público.
 *  - Cartilha de Boas Práticas da ANVISA (linguagem simplificada).
 *
 * ---------------------------------------------------------------------
 * TRILHAS DE PERIODICIDADE (campo `frequencia`)
 * ---------------------------------------------------------------------
 * A RDC 216 quase não fixa frequências de verificação. Por isso o app
 * organiza os checks em três trilhas:
 *
 *  - 'diario'    -> Checklist rápido do dia a dia. Reúne os itens que
 *                   dependem da operação daquele dia (temperatura, higiene
 *                   das mãos, contaminação cruzada, limpeza, resíduos).
 *                   Vence a cada 1 dia. NÃO é exigência legal de frequência,
 *                   e sim boa prática operacional adotada pelo app.
 *
 *  - 'periodico' -> Auditoria completa. Reúne itens estruturais, de
 *                   documentação, equipamentos, fornecedores e capacitação,
 *                   que não mudam de um dia para o outro. Intervalo padrão
 *                   sugerido: 30 dias (configurável pelo usuário).
 *
 *  - 'semestral' -> Itens com FREQUÊNCIA LEGAL FIXA definida pela norma
 *                   (água e reservatório: a cada 180 dias). O app trata
 *                   como obrigação, não como sugestão editável.
 *
 * IMPORTANTE: a auditoria completa (periódica) percorre TODOS os itens do
 * perfil, inclusive os 'diario' e 'semestral'. O campo `frequencia` serve
 * para montar a trilha diária e a trilha legal; a auditoria mensal é o
 * apanhado geral.
 *
 * Observações de design:
 *  - `codigoRdc` guarda o número do item na norma (rastreabilidade).
 *  - `perfis` é o "filtro inteligente" (RF03): para quais estabelecimentos
 *    o item aparece por padrão.
 *  - `critico` marca itens de maior risco sanitário. Combinado com
 *    frequencia==='diario', permite montar um "diário essencial" enxuto.
 *  - `peso` pondera o score (RF04). Itens críticos pesam mais.
 *  - `periodicidadeDias` só aparece nos itens de frequência legal fixa.
 */

// ----------------------------------------------------------------------
// TIPOS
// ----------------------------------------------------------------------

export type PerfilId =
  | 'restaurante'
  | 'lanchonete'
  | 'padaria'
  | 'food_truck'
  | 'feirante'
  | 'ambulante';

export type FrequenciaCheck = 'diario' | 'periodico' | 'semestral';

export interface Perfil {
  id: PerfilId;
  nome: string;
  descricao: string;
  /** Intervalo padrão sugerido da AUDITORIA COMPLETA (periódica), em dias. Configurável. Não é exigência legal. */
  periodicidadeAuditoriaDias: number;
}

export interface Categoria {
  id: string;
  nome: string;
  /** Seção correspondente na RDC 216/2004. */
  codigoRdc: string;
  /** POP obrigatório relacionado (art. 4.11.4), quando aplicável. */
  popObrigatorio?: boolean;
}

export interface ItemChecklist {
  id: string;
  categoriaId: string;
  codigoRdc: string;
  /** Texto em linguagem simples, redigido como o estado desejado a ser verificado. */
  texto: string;
  /** Perfis para os quais o item aparece por padrão (filtro inteligente). */
  perfis: PerfilId[];
  /** Trilha de periodicidade do item. */
  frequencia: FrequenciaCheck;
  critico: boolean;
  peso: number;
  /** Frequência legal fixa (em dias), presente apenas nos itens 'semestral'. */
  periodicidadeDias?: number;
}

// ----------------------------------------------------------------------
// PERFIS DE NEGÓCIO (RF02)
// ----------------------------------------------------------------------

export const PERFIS: Perfil[] = [
  { id: 'restaurante', nome: 'Restaurante', descricao: 'Estabelecimento fixo com cozinha, área de preparo, armazenamento e salão.', periodicidadeAuditoriaDias: 30 },
  { id: 'lanchonete', nome: 'Lanchonete', descricao: 'Estabelecimento fixo de menor porte, com preparo e atendimento no local.', periodicidadeAuditoriaDias: 30 },
  { id: 'padaria', nome: 'Padaria / Confeitaria', descricao: 'Estabelecimento fixo com produção, armazenamento e exposição de alimentos.', periodicidadeAuditoriaDias: 30 },
  { id: 'food_truck', nome: 'Food Truck', descricao: 'Unidade móvel com preparo e venda no próprio veículo.', periodicidadeAuditoriaDias: 30 },
  { id: 'feirante', nome: 'Feirante', descricao: 'Banca ou tenda em feiras; transporta o alimento até o ponto de venda.', periodicidadeAuditoriaDias: 30 },
  { id: 'ambulante', nome: 'Ambulante', descricao: 'Carrinho ou ponto móvel de rua; estrutura mínima.', periodicidadeAuditoriaDias: 30 },
];

// Grupos auxiliares de perfis (deixam a lista de itens mais legível).
const TODOS: PerfilId[] = ['restaurante', 'lanchonete', 'padaria', 'food_truck', 'feirante', 'ambulante'];
const FIXOS: PerfilId[] = ['restaurante', 'lanchonete', 'padaria'];
const FIXOS_TRUCK: PerfilId[] = ['restaurante', 'lanchonete', 'padaria', 'food_truck'];
const MOVEIS: PerfilId[] = ['food_truck', 'feirante', 'ambulante'];

// ----------------------------------------------------------------------
// CATEGORIAS (blocos temáticos da RDC 216)
// ----------------------------------------------------------------------

export const CATEGORIAS: Categoria[] = [
  { id: 'edificacao', nome: 'Edificação, instalações, equipamentos e utensílios', codigoRdc: '4.1' },
  { id: 'higienizacao', nome: 'Higienização de instalações e equipamentos', codigoRdc: '4.2', popObrigatorio: true },
  { id: 'controle_pragas', nome: 'Controle de vetores e pragas', codigoRdc: '4.3', popObrigatorio: true },
  { id: 'agua', nome: 'Abastecimento de água', codigoRdc: '4.4', popObrigatorio: true },
  { id: 'residuos', nome: 'Manejo dos resíduos', codigoRdc: '4.5' },
  { id: 'manipuladores', nome: 'Manipuladores', codigoRdc: '4.6', popObrigatorio: true },
  { id: 'materias_primas', nome: 'Matérias-primas, ingredientes e embalagens', codigoRdc: '4.7' },
  { id: 'preparo', nome: 'Preparação do alimento', codigoRdc: '4.8' },
  { id: 'armazenamento_transporte', nome: 'Armazenamento e transporte do alimento preparado', codigoRdc: '4.9' },
  { id: 'exposicao', nome: 'Exposição ao consumo', codigoRdc: '4.10' },
  { id: 'documentacao', nome: 'Documentação e registro', codigoRdc: '4.11' },
  { id: 'responsabilidade', nome: 'Responsabilidade', codigoRdc: '4.12' },
];

// ----------------------------------------------------------------------
// ITENS DO CHECKLIST
// ----------------------------------------------------------------------

export const ITENS: ItemChecklist[] = [
  // --- 4.1 EDIFICAÇÃO, INSTALAÇÕES, EQUIPAMENTOS, MÓVEIS E UTENSÍLIOS (estrutural -> periódico) ---
  { id: 'edif_01', categoriaId: 'edificacao', codigoRdc: '4.1.1', texto: 'O fluxo de preparo é ordenado, sem cruzamentos, e o acesso às instalações é controlado e independente de outros usos.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_02', categoriaId: 'edificacao', codigoRdc: '4.1.2', texto: 'O espaço é compatível com as operações e há separação entre as diferentes atividades para evitar contaminação cruzada.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_03', categoriaId: 'edificacao', codigoRdc: '4.1.3', texto: 'Piso, paredes e teto têm revestimento liso, impermeável e lavável, sem rachaduras, goteiras, infiltrações, mofo ou descascamentos.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_04', categoriaId: 'edificacao', codigoRdc: '4.1.4', texto: 'Portas e janelas estão ajustadas; portas das áreas de preparo têm fechamento automático e as aberturas externas possuem telas milimetradas removíveis.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_05', categoriaId: 'edificacao', codigoRdc: '4.1.5', texto: 'Há água corrente e conexão com rede de esgoto ou fossa séptica; ralos são sifonados e as grelhas podem ser fechadas.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_06', categoriaId: 'edificacao', codigoRdc: '4.1.6', texto: 'As caixas de gordura e de esgoto ficam fora das áreas de preparo e armazenamento e estão em bom estado de conservação.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_07', categoriaId: 'edificacao', codigoRdc: '4.1.7', texto: 'As áreas estão livres de objetos em desuso e não há presença de animais no estabelecimento.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_08', categoriaId: 'edificacao', codigoRdc: '4.1.8', texto: 'A iluminação é adequada e as luminárias sobre a área de preparo são protegidas contra quebras e quedas.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_09', categoriaId: 'edificacao', codigoRdc: '4.1.9', texto: 'As instalações elétricas estão embutidas ou protegidas em tubulações íntegras, permitindo a higienização.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_10', categoriaId: 'edificacao', codigoRdc: '4.1.10', texto: 'A ventilação renova o ar e mantém o ambiente livre de fumaça e vapores; o fluxo de ar não incide diretamente sobre os alimentos.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_11', categoriaId: 'edificacao', codigoRdc: '4.1.11', texto: 'Os equipamentos de climatização estão conservados, com troca de filtros e manutenção periódica registradas.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_12', categoriaId: 'edificacao', codigoRdc: '4.1.12', texto: 'Os banheiros e vestiários não se comunicam diretamente com as áreas de preparo/armazenamento e têm portas com fechamento automático.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_13', categoriaId: 'edificacao', codigoRdc: '4.1.13', texto: 'As instalações sanitárias têm lavatórios abastecidos com papel higiênico, sabonete anti-séptico, toalhas de papel e coletor de lixo com tampa sem contato manual.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_14', categoriaId: 'edificacao', codigoRdc: '4.1.14', texto: 'Há lavatórios exclusivos para higiene das mãos na área de manipulação, com sabonete anti-séptico e toalhas de papel.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: true, peso: 2 },
  { id: 'edif_15', categoriaId: 'edificacao', codigoRdc: '4.1.15', texto: 'Equipamentos, móveis e utensílios em contato com alimentos são de material que não transmite substâncias tóxicas, odores ou sabores, e estão conservados.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_16', categoriaId: 'edificacao', codigoRdc: '4.1.16', texto: 'É feita manutenção periódica dos equipamentos e calibração dos instrumentos de medição, com registro.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'edif_17', categoriaId: 'edificacao', codigoRdc: '4.1.17', texto: 'As superfícies de equipamentos e utensílios são lisas, laváveis e sem frestas ou rugosidades que dificultem a higienização.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.2 HIGIENIZAÇÃO DE INSTALAÇÕES, EQUIPAMENTOS, MÓVEIS E UTENSÍLIOS ---
  { id: 'higi_01', categoriaId: 'higienizacao', codigoRdc: '4.2.1', texto: 'Instalações, equipamentos e utensílios são mantidos limpos, com higienização feita por pessoas capacitadas e na frequência necessária.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'higi_02', categoriaId: 'higienizacao', codigoRdc: '4.2.2', texto: 'As caixas de gordura são limpas periodicamente e os resíduos descartados conforme a legislação.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'higi_03', categoriaId: 'higienizacao', codigoRdc: '4.2.3', texto: 'As operações de limpeza e desinfecção que não são rotineiras estão registradas.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'higi_04', categoriaId: 'higienizacao', codigoRdc: '4.2.4', texto: 'A área de preparo é higienizada sempre que necessário e logo após o fim do trabalho, sem uso de odorizantes nas áreas de alimentos.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'higi_05', categoriaId: 'higienizacao', codigoRdc: '4.2.5', texto: 'Os produtos de limpeza são regularizados no Ministério da Saúde, usados conforme o fabricante e guardados em local separado dos alimentos.', perfis: TODOS, frequencia: 'periodico', critico: true, peso: 2 },
  { id: 'higi_06', categoriaId: 'higienizacao', codigoRdc: '4.2.6', texto: 'Os utensílios de limpeza estão conservados e são diferentes para instalações e para partes que tocam o alimento.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'higi_07', categoriaId: 'higienizacao', codigoRdc: '4.2.7', texto: 'Quem limpa as instalações sanitárias usa uniforme diferente do usado na manipulação de alimentos.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.3 CONTROLE INTEGRADO DE VETORES E PRAGAS URBANAS ---
  { id: 'prag_01', categoriaId: 'controle_pragas', codigoRdc: '4.3.1', texto: 'O local está livre de pragas e há ações contínuas para impedir a atração, o abrigo e a proliferação de vetores e pragas.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'prag_02', categoriaId: 'controle_pragas', codigoRdc: '4.3.2', texto: 'Quando necessário, o controle químico é feito por empresa especializada, com produtos regularizados no Ministério da Saúde.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'prag_03', categoriaId: 'controle_pragas', codigoRdc: '4.3.3', texto: 'Após o controle químico, equipamentos e utensílios são higienizados antes de reutilizados, evitando resíduos.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.4 ABASTECIMENTO DE ÁGUA (frequência legal fixa -> semestral) ---
  { id: 'agua_01', categoriaId: 'agua', codigoRdc: '4.4.1', texto: 'É usada somente água potável; se a fonte for alternativa (poço), há laudo de potabilidade a cada 6 meses.', perfis: TODOS, frequencia: 'semestral', critico: true, peso: 2, periodicidadeDias: 180 },
  { id: 'agua_02', categoriaId: 'agua', codigoRdc: '4.4.2', texto: 'O gelo usado em alimentos é feito de água potável e mantido protegido de contaminação.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'agua_03', categoriaId: 'agua', codigoRdc: '4.4.3', texto: 'O vapor que entra em contato com alimentos é produzido a partir de água potável.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'agua_04', categoriaId: 'agua', codigoRdc: '4.4.4', texto: 'O reservatório de água está tampado, conservado e é higienizado no máximo a cada 6 meses, com registro.', perfis: FIXOS, frequencia: 'semestral', critico: false, peso: 1, periodicidadeDias: 180 },

  // --- 4.5 MANEJO DOS RESÍDUOS ---
  { id: 'resi_01', categoriaId: 'residuos', codigoRdc: '4.5.1', texto: 'Há recipientes de lixo identificados, íntegros e de fácil higienização, em número suficiente.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'resi_02', categoriaId: 'residuos', codigoRdc: '4.5.2', texto: 'Os coletores das áreas de preparo têm tampa acionada sem contato manual (pedal).', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'resi_03', categoriaId: 'residuos', codigoRdc: '4.5.3', texto: 'O lixo é coletado com frequência e estocado em local fechado, isolado das áreas de preparo e armazenamento.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },

  // --- 4.6 MANIPULADORES ---
  { id: 'mani_01', categoriaId: 'manipuladores', codigoRdc: '4.6.1', texto: 'O controle de saúde dos manipuladores é feito e registrado conforme a legislação.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mani_02', categoriaId: 'manipuladores', codigoRdc: '4.6.2', texto: 'Manipuladores com lesões ou sintomas de doença são afastados do preparo de alimentos enquanto durar a condição.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'mani_03', categoriaId: 'manipuladores', codigoRdc: '4.6.3', texto: 'Os manipuladores têm asseio pessoal e uniformes limpos, trocados no mínimo diariamente e usados só no estabelecimento.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'mani_04', categoriaId: 'manipuladores', codigoRdc: '4.6.4', texto: 'Os manipuladores lavam as mãos ao chegar, antes e depois de manipular alimentos, após o sanitário e sempre que necessário.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'mani_05', categoriaId: 'manipuladores', codigoRdc: '4.6.4', texto: 'Há cartazes de orientação sobre a correta lavagem das mãos em locais de fácil visualização, inclusive nos sanitários.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mani_06', categoriaId: 'manipuladores', codigoRdc: '4.6.5', texto: 'Durante o trabalho, os manipuladores não fumam, não falam sem necessidade, não comem e não manuseiam dinheiro.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'mani_07', categoriaId: 'manipuladores', codigoRdc: '4.6.6', texto: 'Os manipuladores usam cabelos presos e protegidos, sem barba, com unhas curtas e sem esmalte, e sem adornos ou maquiagem.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'mani_08', categoriaId: 'manipuladores', codigoRdc: '4.6.7', texto: 'Os manipuladores são capacitados periodicamente em higiene e manipulação, com comprovação documentada.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mani_09', categoriaId: 'manipuladores', codigoRdc: '4.6.8', texto: 'Os visitantes cumprem as mesmas regras de higiene e saúde dos manipuladores.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.7 MATÉRIAS-PRIMAS, INGREDIENTES E EMBALAGENS (práticas de recepção/estoque -> periódico) ---
  { id: 'mate_01', categoriaId: 'materias_primas', codigoRdc: '4.7.1', texto: 'Há critérios para escolher fornecedores e o transporte dos insumos é feito em condições adequadas de higiene.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mate_02', categoriaId: 'materias_primas', codigoRdc: '4.7.2', texto: 'A recepção de matérias-primas e embalagens é feita em área protegida e limpa.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mate_03', categoriaId: 'materias_primas', codigoRdc: '4.7.3', texto: 'Os insumos são inspecionados na recepção, com embalagens íntegras e temperatura verificada quando exigem refrigeração.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mate_04', categoriaId: 'materias_primas', codigoRdc: '4.7.4', texto: 'Produtos reprovados ou com validade vencida são devolvidos ou separados e identificados, com destino definido.', perfis: TODOS, frequencia: 'periodico', critico: true, peso: 2 },
  { id: 'mate_05', categoriaId: 'materias_primas', codigoRdc: '4.7.5', texto: 'Os insumos são armazenados em local limpo e organizado, identificados e respeitando o prazo de validade.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'mate_06', categoriaId: 'materias_primas', codigoRdc: '4.7.6', texto: 'Os insumos ficam sobre paletes, estrados ou prateleiras de material lavável, com espaçamento para ventilação e limpeza.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.8 PREPARAÇÃO DO ALIMENTO (manuseio do dia -> diário) ---
  { id: 'prep_01', categoriaId: 'preparo', codigoRdc: '4.8.1', texto: 'As matérias-primas e ingredientes usados no preparo estão em boas condições higiênico-sanitárias.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_02', categoriaId: 'preparo', codigoRdc: '4.8.2', texto: 'A quantidade de funcionários e equipamentos é compatível com o volume e a complexidade das preparações.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'prep_03', categoriaId: 'preparo', codigoRdc: '4.8.3', texto: 'São adotadas medidas contra contaminação cruzada, evitando contato entre alimentos crus, semi-preparados e prontos.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_04', categoriaId: 'preparo', codigoRdc: '4.8.4', texto: 'Quem manipula alimentos crus lava e higieniza as mãos antes de tocar em alimentos preparados.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_05', categoriaId: 'preparo', codigoRdc: '4.8.5', texto: 'Os perecíveis ficam à temperatura ambiente apenas pelo tempo mínimo necessário ao preparo.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_06', categoriaId: 'preparo', codigoRdc: '4.8.6', texto: 'Sobras de matérias-primas são acondicionadas e identificadas com produto, data de fracionamento e validade após aberto.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_07', categoriaId: 'preparo', codigoRdc: '4.8.7', texto: 'As embalagens dos ingredientes são limpas antes de abertas.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_08', categoriaId: 'preparo', codigoRdc: '4.8.8', texto: 'No cozimento, todas as partes do alimento atingem no mínimo 70 °C (ou combinação de tempo/temperatura equivalente).', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_09', categoriaId: 'preparo', codigoRdc: '4.8.9', texto: 'A eficácia do cozimento é avaliada pela temperatura, tempo e mudança de cor e textura no centro do alimento.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_10', categoriaId: 'preparo', codigoRdc: '4.8.10', texto: 'Na fritura, são adotadas medidas para que o óleo e a gordura não contaminem quimicamente o alimento.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_11', categoriaId: 'preparo', codigoRdc: '4.8.11', texto: 'Os óleos são aquecidos a no máximo 180 °C e trocados assim que houver alteração de cor, cheiro, espuma ou fumaça.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_12', categoriaId: 'preparo', codigoRdc: '4.8.12', texto: 'Alimentos congelados são descongelados antes do cozimento (salvo orientação do fabricante para cozinhar ainda congelado).', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_13', categoriaId: 'preparo', codigoRdc: '4.8.13', texto: 'O descongelamento é feito sob refrigeração (abaixo de 5 °C) ou em micro-ondas com cocção imediata — nunca à temperatura ambiente.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_14', categoriaId: 'preparo', codigoRdc: '4.8.14', texto: 'Alimentos descongelados que não forem usados na hora são mantidos refrigerados e não são recongelados.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_15', categoriaId: 'preparo', codigoRdc: '4.8.15', texto: 'Na conservação a quente, o alimento fica acima de 60 °C por no máximo 6 horas.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_16', categoriaId: 'preparo', codigoRdc: '4.8.16', texto: 'No resfriamento, o alimento passa de 60 °C para 10 °C em até 2 horas e depois é mantido abaixo de 5 °C (ou congelado a -18 °C).', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_17', categoriaId: 'preparo', codigoRdc: '4.8.17', texto: 'O alimento preparado e refrigerado a 4 °C ou menos é consumido em até 5 dias.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_18', categoriaId: 'preparo', codigoRdc: '4.8.18', texto: 'Alimentos armazenados refrigerados/congelados são identificados (designação, data de preparo, validade) e têm a temperatura monitorada.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'prep_19', categoriaId: 'preparo', codigoRdc: '4.8.19', texto: 'Alimentos consumidos crus passam por higienização com produto regularizado, sem deixar resíduos.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'prep_20', categoriaId: 'preparo', codigoRdc: '4.8.20', texto: 'Existe controle e garantia de qualidade dos alimentos preparados, de forma documentada.', perfis: FIXOS_TRUCK, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.9 ARMAZENAMENTO E TRANSPORTE DO ALIMENTO PREPARADO (a cada operação -> diário) ---
  { id: 'tran_01', categoriaId: 'armazenamento_transporte', codigoRdc: '4.9.1', texto: 'Os alimentos preparados que aguardam transporte estão identificados (produto, data de preparo, validade) e protegidos.', perfis: MOVEIS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'tran_02', categoriaId: 'armazenamento_transporte', codigoRdc: '4.9.2', texto: 'O transporte ocorre em tempo e temperatura que preservam a qualidade, com a temperatura monitorada.', perfis: MOVEIS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'tran_03', categoriaId: 'armazenamento_transporte', codigoRdc: '4.9.3', texto: 'O meio de transporte é higienizado, coberto e não leva cargas que comprometam o alimento.', perfis: MOVEIS, frequencia: 'diario', critico: false, peso: 1 },

  // --- 4.10 EXPOSIÇÃO AO CONSUMO DO ALIMENTO PREPARADO ---
  { id: 'expo_01', categoriaId: 'exposicao', codigoRdc: '4.10.1', texto: 'As áreas de exposição e o refeitório estão organizados e em boas condições higiênico-sanitárias.', perfis: FIXOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'expo_02', categoriaId: 'exposicao', codigoRdc: '4.10.2', texto: 'Ao servir, os manipuladores higienizam as mãos e usam utensílios ou luvas descartáveis.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'expo_03', categoriaId: 'exposicao', codigoRdc: '4.10.3', texto: 'Os equipamentos de exposição a quente/frio estão conservados e com a temperatura monitorada regularmente.', perfis: TODOS, frequencia: 'diario', critico: true, peso: 2 },
  { id: 'expo_04', categoriaId: 'exposicao', codigoRdc: '4.10.4', texto: 'O balcão de exposição tem barreiras de proteção que evitam a contaminação pelo consumidor.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'expo_05', categoriaId: 'exposicao', codigoRdc: '4.10.5', texto: 'Os utensílios de consumo (pratos, copos, talheres) são descartáveis ou devidamente higienizados e guardados protegidos.', perfis: TODOS, frequencia: 'diario', critico: false, peso: 1 },
  { id: 'expo_06', categoriaId: 'exposicao', codigoRdc: '4.10.6', texto: 'Ornamentos e plantas na área de consumo não são fonte de contaminação para os alimentos.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'expo_07', categoriaId: 'exposicao', codigoRdc: '4.10.7', texto: 'A área de recebimento de dinheiro é reservada e quem recebe pagamento não manipula alimentos.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.11 DOCUMENTAÇÃO E REGISTRO (documental -> periódico) ---
  { id: 'docu_01', categoriaId: 'documentacao', codigoRdc: '4.11.1', texto: 'O estabelecimento dispõe de Manual de Boas Práticas e de POPs, acessíveis aos funcionários e à autoridade sanitária.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_02', categoriaId: 'documentacao', codigoRdc: '4.11.2', texto: 'Os POPs trazem as instruções e a frequência das operações, com responsáveis, e estão aprovados, datados e assinados.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_03', categoriaId: 'documentacao', codigoRdc: '4.11.3', texto: 'Os registros são mantidos por no mínimo 30 dias a contar da data de preparo dos alimentos.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_04', categoriaId: 'documentacao', codigoRdc: '4.11.4', texto: 'Estão implementados os 4 POPs obrigatórios: higienização; controle de pragas; higienização do reservatório; higiene e saúde dos manipuladores.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_05', categoriaId: 'documentacao', codigoRdc: '4.11.5', texto: 'O POP de higienização descreve superfície, método, produto, concentração, tempo de contato e temperatura.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_06', categoriaId: 'documentacao', codigoRdc: '4.11.6', texto: 'O POP de controle de pragas traz as medidas preventivas/corretivas e, no controle químico, o comprovante da empresa especializada.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_07', categoriaId: 'documentacao', codigoRdc: '4.11.7', texto: 'O POP de higienização do reservatório especifica as informações exigidas, com certificado se o serviço for terceirizado.', perfis: FIXOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'docu_08', categoriaId: 'documentacao', codigoRdc: '4.11.8', texto: 'O POP de higiene e saúde dos manipuladores descreve lavagem das mãos, conduta em caso de lesão/doença, exames e capacitação.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },

  // --- 4.12 RESPONSABILIDADE ---
  { id: 'resp_01', categoriaId: 'responsabilidade', codigoRdc: '4.12.1', texto: 'Há um responsável pela manipulação (proprietário ou funcionário designado), devidamente capacitado.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
  { id: 'resp_02', categoriaId: 'responsabilidade', codigoRdc: '4.12.2', texto: 'O responsável fez curso de capacitação cobrindo contaminantes, DTA, manipulação higiênica e Boas Práticas.', perfis: TODOS, frequencia: 'periodico', critico: false, peso: 1 },
];

// ----------------------------------------------------------------------
// HELPERS (o Claude Code pode reaproveitar nas Fases 2, 3 e 5)
// ----------------------------------------------------------------------

/** Todos os itens que aparecem para um perfil (base da AUDITORIA COMPLETA / periódica). */
export function itensDoPerfil(perfil: PerfilId): ItemChecklist[] {
  return ITENS.filter((item) => item.perfis.includes(perfil));
}

/** Itens da trilha DIÁRIA para um perfil (checklist rápido do dia a dia). */
export function itensDiarios(perfil: PerfilId): ItemChecklist[] {
  return itensDoPerfil(perfil).filter((i) => i.frequencia === 'diario');
}

/** Versão enxuta da trilha diária: apenas itens críticos (o "diário essencial"). */
export function itensDiariosEssenciais(perfil: PerfilId): ItemChecklist[] {
  return itensDiarios(perfil).filter((i) => i.critico);
}

/** Itens de frequência legal fixa (água/reservatório), com seu próprio relógio de 180 dias. */
export function itensSemestrais(perfil: PerfilId): ItemChecklist[] {
  return itensDoPerfil(perfil).filter((i) => i.frequencia === 'semestral');
}

/** Agrupa itens por categoria, preservando a ordem das categorias. */
export function itensAgrupadosPorCategoria(itens: ItemChecklist[]) {
  return CATEGORIAS.map((cat) => ({
    categoria: cat,
    itens: itens.filter((i) => i.categoriaId === cat.id),
  })).filter((grupo) => grupo.itens.length > 0);
}
