# Compromissos da proposta do TCC

> Extração dos compromissos assumidos em
> [`proposta-tcc-2026-09-02.pdf`](proposta-tcc-2026-09-02.pdf) — a versão
> corrigida em 2/set/2026 com as anotações do orientador (Prof. Dr. Alexandre
> Rômolo Moreira Feitosa). A versão original, de 10/jun/2026, tem o mesmo
> escopo; as anotações foram só de forma (nome do curso, pontuação,
> citações).
>
> **Este arquivo é a régua do agente `fiscal`** (`.claude/agents/fiscal.md`).
> Cada compromisso tem um identificador (`P-…`) para ser citado. Os textos
> entre aspas são **literais da proposta**; não edite o que está entre aspas —
> se a proposta mudar, troque o PDF e refaça a extração.

---

## 1. Objetivos (§1.2)

| ID | Compromisso |
|---|---|
| P-OBJ-G | "Implementar um aplicativo móvel para automatizar o fluxo de trabalho de pequenos estabelecimentos de alimentação, facilitando o monitoramento da adequação sanitária e a gestão de checklists com base na legislação vigente." |
| P-OBJ-1 | "estudar softwares e aplicações de mercado voltadas ao monitoramento sanitário e à gestão de qualidade" |
| P-OBJ-2 | "levantar e traduzir as exigências legais da RDC nº 216/2004 para a construção de checklists dinâmicos adaptáveis ao porte de cada estabelecimento" |
| P-OBJ-3 | "implementar o sistema utilizando tecnologias modernas para desenvolvimento móvel, especificamente React Native, Supabase e SQLite" |

## 2. Requisitos funcionais (Quadro 2, §3.4.1)

| ID | Funcionalidade | Descrição (literal) |
|---|---|---|
| P-RF01 | Cadastro e autenticação de usuário | "O sistema deve permitir o cadastro e a autenticação do usuário para que ele possa acessar o aplicativo." |
| P-RF02 | Configuração do perfil de negócio | "O sistema deve permitir que o usuário defina o tipo de seu estabelecimento (exemplo: restaurante, lanchonete, padaria, food truck, feirante ou ambulante) no momento do primeiro acesso." |
| P-RF03 | Checklist dinâmico | "O sistema deve personalizar a lista de verificação de acordo com o tipo de perfil cadastrado no sistema." |
| P-RF04 | Score sanitário | "O sistema deve gerar uma pontuação final baseada nas normas atingidas durante a inspeção sanitária." |
| P-RF05 | Notificação de periodicidade de inspeção | "O sistema deve emitir alertas automáticos ao usuário quando o prazo para a realização de uma nova fiscalização estiver próximo do vencimento. O alerta será baseado no histórico de vistorias anteriores e na periodicidade configurada para o perfil." |
| P-RF06 | Avaliação de conformidade sanitária | "O sistema deve permitir que o usuário avalie cada item do checklist gerado pela aplicação utilizando opções de resposta padrão." |
| P-RF07 | Geração do plano de ação | "O aplicativo deve processar os dados da auditoria e gerar um plano de ação corretiva de forma automática focando apenas nos itens marcados como inadequados." |
| P-RF08 | Exportação de relatórios | "O sistema deve compilar todas as informações da inspeção em um documento final. O usuário poderá gerar e exportar esse relatório completo no formato PDF." |
| P-RF09 | Filtragem de itens não aplicáveis | "O sistema deve ocultar automaticamente do checklist de futuras inspeções os itens que forem classificados como "Não se Aplica" pelo usuário, garantindo também que estes não sejam contabilizados no cálculo do score sanitário do estabelecimento." |

## 3. Afirmações sobre o funcionamento (§3.4.1, texto após o Quadro 2)

| ID | Afirmação (literal ou quase literal) |
|---|---|
| P-FUN-1 | "A aplicação exige a configuração do perfil de negócio para a conclusão do cadastro." |
| P-FUN-2 | "O usuário define o tipo e o **porte** do seu estabelecimento nessa etapa." |
| P-FUN-3 | "Esse filtro previne cobranças desproporcionais […] Um microempreendedor não será penalizado por normas estruturais complexas exigidas apenas para grandes indústrias." |
| P-FUN-4 | Categorias: "edificações, higienização, controle de pragas, abastecimento de água, manejo de resíduos e saúde dos manipuladores." |
| P-FUN-5 | "quatro opções de resposta padronizadas para cada item. O usuário deve obrigatoriamente selecionar entre Adequado, Inadequado, Não se Aplica e Não Observado." |
| P-FUN-6 | "Não se Aplica" é "descartado do cálculo matemático" e o item "não seja mais exibido no checklist durante as futuras inspeções". |
| P-FUN-7 | "o banco de dados do sistema possui flexibilidade arquitetural. Esse recurso tecnológico permite incorporar exigências sanitárias complementares estabelecidas por órgãos de vigilância estaduais e municipais sempre que for necessário." |
| P-FUN-8 | "entrega listas de verificação previamente configuradas em uma linguagem operacional simples, com o conhecimento técnico já embutido nas regras da RDC nº 216/2004" (§2.2.4) |

## 4. Fundamentação que o app precisa sustentar (§2)

| ID | Afirmação |
|---|---|
| P-FUND-1 | "A normativa define aproximadamente 160 diretrizes" (§2.1) |
| P-FUND-2 | "Neste trabalho iremos usar como base a RDC 216." — a RDC 275/2002 e a Portaria 326/1997 são citadas como normas de **indústria** (§2.1) |
| P-FUND-3 | Resumo: "o sistema automatiza o cálculo de uma pontuação (score) de conformidade, gera planos de ação corretiva para itens inadequados e emite relatórios consolidados em PDF." |

## 5. Escopo declarado — Quadro 1 (coluna "Proposta")

O que a proposta disse que o app **tem** e **não tem**. Construir algo da
coluna "Não" é ampliar o escopo contra o texto da proposta.

| ID | Característica | Proposta |
|---|---|---|
| P-ESC-1 | Checklists pré-configurados (RDC nº 216/2004) | Sim |
| P-ESC-2 | Filtro de perfil para adaptar a complexidade | Sim |
| P-ESC-3 | Interface de baixo custo com inserção manual | Sim |
| P-ESC-4 | Integração com sensores de hardware (IoT/Bluetooth) | **Não** |
| P-ESC-5 | Motor genérico para criação própria de questionários | **Não** |
| P-ESC-6 | IA para reconhecimento e comparação de imagens | **Não** |
| P-ESC-7 | IA para elaboração de planos APPCC industriais | **Não** |
| P-ESC-8 | Adequação nativa a normas internacionais (FDA, ISO) | **Não** |

## 6. Tecnologias, ferramentas e método (§3.1–3.3)

| ID | Compromisso |
|---|---|
| P-TEC-1 | React Native — "compatibilidade com dispositivos Android e iOS" |
| P-TEC-2 | Supabase — "autenticação, armazenamento de arquivos e banco de dados relacional baseado em PostgreSQL" e "sincronização entre a aplicação móvel e o banco de dados remoto" |
| P-TEC-3 | SQLite — "inspeções e checklists sejam realizados mesmo sem conexão"; "Posteriormente, os dados armazenados poderão ser sincronizados com o servidor remoto quando houver conectividade" |
| P-TEC-4 | Expo |
| P-FER-1 | Git e GitHub — versionamento e "armazenamento remoto do repositório" |
| P-FER-2 | Figma — "prototipação das telas […] antes da implementação definitiva" |
| P-FER-3 | Android Studio — testes no emulador |
| P-MET-1 | Scrum (Scrum Solo, PAGOTTO et al., 2016), desenvolvimento incremental, "ciclos curtos" |
| P-MET-2 | Etapas: requisitos → modelagem das verificações → protótipos de tela (UX/UI) → implementação ("cadastro de usuário, preenchimento dos checklists e armazenamento") → testes |

## 7. Cronograma (Quadro 3, 2026)

| ID | Atividade | Mês |
|---|---|---|
| P-CRO-RF01 | Cadastro e autenticação de usuário (RF 01) | Jul |
| P-CRO-RF02 | Configuração do perfil de negócio (RF 02) | Jul |
| P-CRO-RF03 | Checklist dinâmico (RF 03) | Ago |
| P-CRO-RF06 | Avaliação de conformidade sanitária (RF 06) | Ago |
| P-CRO-RF04 | Score sanitário (RF 04) | Set |
| P-CRO-RF09 | Filtragem de itens não aplicáveis (RF 09) | Set |
| P-CRO-RF07 | Geração do plano de ação (RF 07) | Out |
| P-CRO-RF08 | Exportação de relatórios (RF 08) | Out |
| P-CRO-RF05 | Notificação de periodicidade de inspeção (RF 05) | Out |
| P-CRO-TST | Testes e ajustes finais | Nov |
| P-CRO-ENT | Entrega do arquivo para defesa final | Nov |
| P-CRO-DEF | Defesa final do TCC | Nov |
| P-CRO-COR | Realização de correções | Dez |
| P-CRO-SUB | Submissão do documento final | Dez |
