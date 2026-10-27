# Alterações no texto final do TCC

> O que precisa mudar no documento final em relação à proposta
> ([`proposta-tcc-2026-09-02.pdf`](proposta-tcc-2026-09-02.pdf)) para o texto
> descrever o app que foi construído.
>
> Os identificadores `P-…` são os de
> [`COMPROMISSOS_PROPOSTA.md`](COMPROMISSOS_PROPOSTA.md). As decisões
> técnicas por trás de cada item estão registradas no `CLAUDE.md` e no
> `PLANO_IMPLEMENTACAO_APP_RDC216.md`; aqui fica só o que o TEXTO precisa
> dizer.
>
> Situação do app em 22/10/2026: os 9 RFs estão implementados, o schema
> local está na v13 e há 254 testes automatizados passando.

---

## Como ler

Cada item tem:
- **Proposta**: o que o texto diz hoje (literal, quando entre aspas).
- **App**: o que foi construído.
- **Alterar**: o que fazer no texto.

**Prioridade**:
- 🔴 **Alta**: o texto afirma algo que o app não faz. A banca pode apontar contradição.
- 🟡 **Média**: o app faz diferente, por uma decisão que precisa ser justificada.
- 🟢 **Baixa**: o texto precisa ser acrescentado ou atualizado, mas não está errado.

---

## 1. Requisitos funcionais (Quadro 2)

### 🔴 1.1 RF01: o login é opcional
- **Proposta (P-RF01):** "O sistema deve permitir o cadastro e a autenticação
  do usuário **para que ele possa acessar o aplicativo**."
- **App:**
  - o app abre e funciona inteiro sem conta;
  - a conta (Supabase Auth, e-mail e senha) só liga o backup na nuvem.
- **Alterar:**
  - **Reescrever o RF01**, por exemplo: "O sistema deve permitir o cadastro e a
    autenticação do usuário para habilitar o backup dos dados na nuvem e
    sua restauração em outro aparelho."
  - **Justificar:** é uma decisão offline-first. Exigir login trava o
    feirante ou ambulante sem sinal já na primeira abertura, e os dados
    pertencem ao estabelecimento, não a uma conta.
  - **Declarar a restrição** "um aparelho, uma conta": o backup de um
    aparelho pertence à primeira conta que o fez.

### 🟡 1.2 RF04: há dois percentuais, e o score é ponderado
- **Proposta (P-RF04):** "uma pontuação final baseada nas normas atingidas".
- **App:**
  - **score ponderado:** itens críticos com peso 3, os demais com o peso do
    seed. Serve para priorizar o que consertar.
  - **atendimento dos itens:** contagem simples, em que cada item vale um.
    Aparece só na auditoria periódica, com a faixa adaptada da RDC 275/2002
    (76–100 / 51–75 / 0–50).
  - "Não se aplica" e "não observado" ficam fora do numerador e do
    denominador.
  - Com nada avaliado, o resultado é "—", e não 0%.
- **Alterar:**
  - **Descrever a fórmula** e os pesos.
  - **Explicar por que há dois números.** O ponderado é régua interna. O
    simples é o único comparável com a lista de verificação da RDC 275, que
    não tem peso.
  - **Declarar as ressalvas** (ver 4.3).
  - **Registrar o que não foi feito:** não há score geral composto entre as
    trilhas. Nenhuma norma combina inspeções de periodicidades diferentes, e
    os pesos seriam arbitrários. O "score do estabelecimento" é o
    atendimento da última auditoria periódica.

### 🟡 1.3 RF05: a periodicidade é por estabelecimento, em três trilhas
- **Proposta (P-RF05):** alertas "baseados no histórico de vistorias
  anteriores e na periodicidade configurada **para o perfil**".
- **App:**
  - **três trilhas:**
    - diária, a cada 1 dia;
    - periódica (auditoria), com padrão por perfil e editável no cadastro
      do estabelecimento;
    - semestral, a cada 180 dias;
  - **dias de funcionamento:** o vencimento não cai em dia fechado;
  - **alertas locais:** no dia, 7 dias antes e 30 dias antes, conforme a
    trilha.
- **Alterar:**
  - **Trocar** "configurada para o perfil" por "sugerida pelo perfil e
    ajustável pelo estabelecimento".
  - **Descrever as três trilhas.**
  - **Deixar claro** que só a água (180 dias) tem frequência fixada em
    norma; as demais frequências são regra de negócio do app.

### 🟡 1.4 RF07: o plano é gerado, mas a correção imediata fica de fora
- **Proposta (P-RF07):** "gerar um plano de ação corretiva de forma automática
  focando apenas nos itens marcados como inadequados".
- **App:**
  - ao concluir a inspeção, cada item inadequado ganha uma ação, com
    descrição e prazo sugerido (crítico: hoje; demais: 7 dias);
  - **exceção:** o inadequado da DIÁRIA marcado como "Corrigi na hora" não
    vira ação (correção imediata ≠ ação corretiva planejada). O score não
    muda com essa marca;
  - há uma ação aberta por item: o mesmo problema em cinco diárias é uma
    coisa só a consertar;
  - o encerramento é manual. O app sugere concluir quando o item volta
    adequado numa inspeção posterior;
  - o texto gerado diz O QUE atingir, citando o item da RDC, e não COMO
    consertar. A exceção é o plano pronto do `prag_01` (ver 5.2).
- **Alterar:**
  - **Acrescentar** a distinção entre correção imediata e ação corretiva.
  - **Justificar** o texto genérico: escrever o "como" seria inventar
    conteúdo técnico que a norma não traz.

### 🔴 1.5 RF08 e Resumo: o relatório é por inspeção, não consolidado
- **Proposta (P-RF08 e P-FUND-3):** "compilar todas as informações da
  inspeção em um documento final" (RF08) e "emite relatórios
  **consolidados** em PDF" (Resumo).
- **App:** gera o relatório COMPLETO DE CADA INSPEÇÃO, nas três trilhas. Ele
  é gerado no aparelho, sem internet, e compartilhado pela janela do sistema
  (WhatsApp, e-mail, Drive). Traz:
  - cabeçalho;
  - score, críticos e cobertura;
  - score por categoria;
  - pendências por etapa;
  - plano de ação;
  - lista item a item com a hora de cada resposta;
  - método do score.
- **Alterar:**
  - **No Resumo, trocar "relatórios consolidados"** por "relatório completo de
    cada inspeção em PDF".
  - **Declarar como trabalho futuro** o consolidado do período (mês).
  - **Mencionar** que a situação das ações no PDF é a do dia em que ele é
    gerado; o resto é registro congelado da inspeção.

### 🟢 1.6 RF09: confere com o texto, mas a volta precisa ser citada
- **Proposta (P-RF09 e P-FUN-6):** ocultar das futuras inspeções e tirar do
  cálculo.
- **App:** faz isso, e também permite **reexibir** o item pela lista de itens
  ocultos (aba Estabelecimento). Sem a volta, um toque errado esconderia
  uma exigência da norma para sempre.
- **Alterar:** acrescentar a reversibilidade.

### 🟢 1.7 RF06: as quatro respostas conferem, mas falta a hora e a janela
- **Proposta (P-RF06 e P-FUN-5):** quatro respostas obrigatórias.
- **App:** as quatro respostas, gravadas na hora, com a hora de cada uma.
  Com horário cadastrado, cada etapa da diária só aceita resposta na sua
  janela (ver 5.1).
- **Alterar:** registrar a hora da resposta e explicar como a janela convive
  com "avaliar cada item": o item fora da janela é **visto, não respondido**,
  e vira pendência.

---

## 2. Funcionamento (§3.4.1)

### 🔴 2.1 "Tipo e porte": o app filtra só pelo tipo
- **Proposta (P-FUN-2, P-OBJ-2):** "O usuário define o tipo e o **porte**" e
  "checklists dinâmicos adaptáveis ao **porte**".
- **App:**
  - o cadastro pede só o **tipo**, entre os 6 perfis (restaurante,
    lanchonete, padaria, food truck, feirante, ambulante);
  - o filtro de aplicabilidade (447 regras perfil × item) é por tipo;
  - o tipo já carrega a diferença estrutural: fixo × móvel, com cozinha ×
    sem cozinha.
- **Alterar:** uma das duas opções.
  - **(a) Trocar "porte" por "tipo"** em todo o texto e explicar que, para a
    RDC 216, o que muda a exigência é a estrutura do estabelecimento, que o
    tipo representa, e não o seu tamanho.
  - **(b) Manter "porte"** e explicar que ele está representado pelo tipo.
  - Recomendo a (a), que é mais honesta. A palavra aparece também no
    Objetivo Específico 2 e no Quadro 1 ("filtro de perfil").

### 🟡 2.2 Categorias: são 12, não 6
- **Proposta (P-FUN-4):** "edificações, higienização, controle de pragas,
  abastecimento de água, manejo de resíduos e saúde dos manipuladores".
- **App:** 12 categorias:
  - as 6 da proposta;
  - matérias-primas, preparação, exposição, transporte, documentação/POP e
    responsabilidade técnica.
- **Alterar:** listar as 12, ou dizer que as 6 citadas são exemplos.

### 🟢 2.3 Linguagem operacional simples: confere, e há mais a descrever
- **Proposta (P-FUN-8):** "linguagem operacional simples, com o conhecimento
  técnico já embutido".
- **App:**
  - **tópicos:** cada item tem um resumo de 1 a 3 frases, que é o que
    aparece no checklist; o texto integral da norma fica a um toque;
  - **rotina guiada da diária:** 11 verificações (12 nos perfis móveis)
    reagrupam os 32 itens diários em perguntas que se respondem de uma vez,
    citando os artigos da RDC. A resposta continua gravada item a item.
- **Alterar:**
  - **Descrever os dois mecanismos**, a rotina e o modo Completo.
  - **Declarar** que os tópicos e o agrupamento são redação do app, e não
    texto da RDC. Por isso o original continua acessível.

### 🟡 2.4 Flexibilidade para normas estaduais e municipais
- **Proposta (P-FUN-7):** o banco "permite incorporar exigências sanitárias
  complementares estabelecidas por órgãos de vigilância estaduais e
  municipais".
- **App:**
  - os itens são DADO (`data/rdc216.ts` levado ao SQLite pelo seed), e não
    código;
  - acrescentar exigências é editar o dado e subir a versão do seed;
  - **não há** tela nem mecanismo para o usuário ou para a VISA acrescentar
    itens. Isso seria o "motor genérico", que o próprio Quadro 1 exclui
    (P-ESC-5).
- **Alterar:** precisar a frase: "a estrutura de dados permite incorporar,
  numa nova versão do aplicativo, exigências complementares…". Não deixar
  a frase sugerir que o usuário faz isso.

---

## 3. Tecnologias e ferramentas (§3.1–3.3)

### 🔴 3.1 Supabase: o Storage não é usado
- **Proposta (P-TEC-2):** "autenticação, **armazenamento de arquivos** e banco
  de dados relacional".
- **App:** usa só Auth e Postgres. O PDF é gerado e compartilhado no
  aparelho, offline.
- **Alterar:**
  - **Tirar o "armazenamento de arquivos"** da descrição do uso.
  - **Declarar como trabalho futuro** guardar os PDFs na nuvem, o que
    dependeria de conta e de internet.

### 🔴 3.2 Sincronização: o backup é de mão única
- **Proposta (P-TEC-2, P-TEC-3):** "sincronização entre a aplicação móvel e o
  banco de dados remoto"; "os dados poderão ser sincronizados com o
  servidor remoto quando houver conectividade".
- **App:**
  - **backup de mão única:** o aparelho envia, e a nuvem guarda;
  - **restauração só em aparelho vazio:** o caso "perdi o celular";
  - não há junção de dados de dois aparelhos.
  - O envio dispara ao abrir o app, ao voltar a ele, ao concluir uma
    inspeção e ao mudar o cadastro.
- **Alterar:**
  - **Trocar "sincronização"** por "backup e restauração".
  - **Declarar como trabalho futuro** a sincronização de duas mãos, com vários
    aparelhos no mesmo estabelecimento.

### 🟡 3.3 React Native: Android e iOS
- **Proposta (P-TEC-1):** "compatibilidade com dispositivos Android e iOS".
- **App:** os builds e os testes no aparelho foram feitos em **Android** (EAS).
- **Alterar:** a confirmar pelo autor.
  - Se não houve teste em iOS, dizer que a base é multiplataforma e que a
    validação foi feita em Android.

### 🟡 3.4 Ferramentas: Figma e Android Studio
- **Proposta (P-FER-2, P-FER-3):** Figma para os protótipos; Android Studio para
  o emulador.
- **App:**
  - os protótipos de fluxo estão em `docs/mockup/` (HTML), e não há arquivo
    Figma no repositório;
  - os testes foram feitos no aparelho, via Expo Go e development build.
- **Alterar:** a confirmar pelo autor. Descrever as ferramentas realmente
  usadas, incluindo:
  - **EAS Build;**
  - **testes automatizados com `node:test`:** 254 testes, que cobrem as
    regras puras e o SQL real;
  - **o uso do Claude Code** como assistente de desenvolvimento. Ver a
    orientação da instituição sobre declarar ferramentas de IA.

### 🟢 3.5 Bibliotecas que não estavam na proposta
- Acrescentar à descrição técnica:
  - `expo-router` (navegação por arquivos);
  - `Zustand` (estado global);
  - `expo-notifications` (alertas locais);
  - `expo-print` e `expo-sharing` (PDF);
  - `react-native-svg` (medidor do score).

---

## 4. Fundamentação (§2)

### 🔴 4.1 "Aproximadamente 160 diretrizes"
- **Proposta (P-FUND-1):** "A normativa define aproximadamente 160
  diretrizes".
- **App:** **89 itens**, que cobrem a norma sem repetição. O número da
  estimativa vinha de contar parágrafos, e não exigências distintas.
- **Alterar:**
  - **Manter as ~160 diretrizes** como descrição da norma, se a fonte
    sustentar.
  - **Explicar como elas viraram 89 itens verificáveis:** fusão de parágrafos
    que pedem a mesma coisa e separação do que é verificável do que é
    definição.
  - **Apresentar os números:** 6 perfis, 12 categorias, 89 itens, 447 regras
    de aplicabilidade e 3 trilhas.

### 🟡 4.2 A RDC 275/2002 passa a ser usada
- **Proposta (P-FUND-2):** a base é a RDC 216; a RDC 275/2002 é citada como
  norma de **indústria**.
- **App:** usa as faixas de classificação da RDC 275 no atendimento da
  auditoria periódica.
- **Alterar:**
  - **Acrescentar** à fundamentação que a RDC 216 não pontua nem classifica.
  - **Explicar** que a faixa é critério **adaptado** da 275 e que a tela
    declara isso.
  - **Citar o precedente:** Ferreira et al., *Rev Inst Adolfo Lutz*,
    2011;70(2):230-5, que aplica as faixas a UANs.

### 🟡 4.3 Lacunas da norma preenchidas pelo app
Declarar no texto, todas como interpretação ou decisão do app:
- **"Não se aplica":** a RDC 275 oferece a coluna e não diz o que fazer com
  ela. Tirá-la do numerador e do denominador é interpretação nossa.
- **Criticidade:**
  - os dois níveis (crítico / não crítico) e o peso 3 são decisão do app;
  - o precedente de VISA é o roteiro do município do Rio sobre a própria RDC
    216, que usa **três** níveis (Imprescindível / Necessário /
    Recomendável);
  - migrar para três níveis fica como trabalho futuro.
- **Horários:** as tolerâncias de 30 minutos, o expediente mínimo de 1 hora e
  o `momento` de cada item (antes de abrir / durante o serviço / no
  fechamento) são decisões do app, e não da RDC 216.
- **"Pendência"** não é conceito da norma: é métrica de adesão do app.

---

## 5. Funcionalidades além dos RFs (acrescentar)

A proposta não as prevê. Descrevê-las como ampliação de escopo, dizendo de
quem foi o pedido.

### 🟡 5.1 Pedidos do orientador (reunião de 20/10/2026)
1. **Horário de funcionamento e janelas por etapa da diária.**
   - Cada etapa só aceita resposta na sua janela.
   - **Ressalva obrigatória:** a trava é de **boa-fé**. Vale o relógio do
     aparelho, e o horário é editável a qualquer momento. O app registra e
     orienta; não fiscaliza contra quem quer burlar.
   - **Não suportado:** fechamento depois da meia-noite e horário diferente
     por dia da semana.
2. **Pendências.**
   - Pendência é o item que perdeu a janela sem resposta.
   - É contada à parte, por etapa, no dia e em 30 dias.
   - **Não entra no score:** não verificar ≠ verificar e estar errado.
   - O dia em que ninguém abriu a diária gera zero pendências e aparece na
     sequência de dias.
3. **Alerta quando cada etapa abre.**
   - Agenda os próximos 7 dias.
   - **Depende de o app ser aberto ao menos uma vez por semana**, o que deve
     ser dito no texto.
4. **Plano de ação pronto para um item** (`prag_01`, controle de pragas, 4.3.1).
   - São 8 passos, cada um citando o artigo da norma.
   - Feirante e ambulante recebem 3 passos, porque os itens estruturais não
     valem para eles.
   - Para os outros itens, o catálogo fica como trabalho futuro. O
     orientador reconheceu que fazê-lo para os 89 seria demais.

### 🟢 5.2 Iniciativa do autor
- **Notificação fixa de inspeção em andamento**, com o progresso
  ("12 de 32 respondidos"). O toque leva de volta à inspeção.
- **Sequência de dias:** quantos dias seguidos a diária foi concluída. Mede
  **adesão à rotina**, não conformidade, e por isso não se mistura com o
  score.
- **Dias de funcionamento:** o app não cobra a diária na folga, o que era
  essencial para feirante e ambulante.
- **Navegação em três perguntas:** Hoje / Conformidade / Estabelecimento.
- **Quatro leituras em vez de uma média:**
  - diária de hoje;
  - rotina do mês;
  - última auditoria;
  - água.

---

## 6. Escopo (Quadro 1) e cronograma (Quadro 3)

### 🟢 6.1 Quadro 1 continua válido
Nada do que foi construído cai na coluna "Não" (IoT, motor genérico de
questionários, IA, APPCC, FDA/ISO). Pode ficar como está.

### 🟡 6.2 Cronograma: dizer o que aconteceu
| RF | Proposta | Realizado |
|---|---|---|
| RF01 | Jul | Set (o único atrasado: ficou para o fim, como fase opcional do plano) |
| RF05 | Out | Set (adiantado) |
| RF07 | Out | Set (adiantado, antes do RF01) |
| RF08 | Out | Out (21/10) |
| Pedidos do orientador | — | Out (20–21/10) |

Os demais RFs foram cumpridos dentro dos meses previstos (confirmar as datas
no `git log` antes de escrever).

### 🟢 6.3 Metodologia
- **Proposta (P-MET-1, P-MET-2):** Scrum Solo, ciclos curtos, etapas em
  sequência.
- **Alterar:** descrever como os ciclos de fato foram feitos:
  - uma fase por vez, cada uma com critério de pronto e teste no aparelho;
  - um commit por entrega;
  - revisão de cada entrega contra a proposta antes do commit.
- O histórico do git serve de evidência.

---

## 7. Trabalhos futuros (seção nova ou ampliada)

Reunir num só lugar o que o texto vai declarar como futuro:
- sincronização de duas mãos (vários aparelhos);
- PDFs guardados na nuvem (Supabase Storage);
- relatório consolidado do período;
- catálogo de plano de ação pronto para os demais itens;
- três níveis de criticidade (padrão de roteiro de VISA);
- horário que atravessa a meia-noite e horário por dia da semana;
- alerta de prazo das ações corretivas;
- validação em iOS, se não houver.

---

## 8. Antes de entregar à banca

- [ ] **Conferir no DOU (16/09/2004) todas as citações de artigo** do
      `data/planos-acao.ts` e as citadas na rotina guiada
      (`data/rotina-diaria.ts`). Uma citação do catálogo já saiu errada
      do rascunho: o 4.11.4 no lugar do 4.11.6.
- [ ] **Decidir o "porte"** (opção a ou b do item 2.1) e aplicar em todo o texto.
- [ ] **Confirmar** iOS, Figma e Android Studio (itens 3.3 e 3.4).
- [ ] **Antes de qualquer demonstração**, rodar "Apagar dados de teste" no
      aparelho, ou declarar o uso de histórico fabricado.
- [ ] **Ter prontas as respostas** a duas perguntas prováveis da banca:
  - "por que o login é opcional?" (item 1.1);
  - "na rotina, um toque em 'não observado' não zera a pendência e tira o
    item do score?". Quem denuncia isso é a cobertura ("X de Y avaliados")
    no resultado.
