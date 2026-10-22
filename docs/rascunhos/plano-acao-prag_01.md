# RASCUNHO — Plano de ação pronto do item `prag_01` (controle de pragas)

> **Status: APROVADO pelo autor em 21/10/2026 e levado ao app** em
> `data/planos-acao.ts`, com dois ajustes: o passo 3 virou 3a/3b (filtro
> por perfil) e o passo 8 (complemento) SAIU, por não ter fonte. O autor
> aprovou o texto sem conferir com o oficial: os textos marcados como
> NORMA foram reproduzidos de memória e **ainda precisam ser conferidos
> palavra por palavra no texto oficial** (DOU de 16/09/2004) antes da
> banca. Prazo: ficou o padrão do app (7 dias).

Legenda:
- **[NORMA x.y.z]** — o passo é exigência escrita na RDC 216.
- **[COMPLEMENTO]** — boa prática que a RDC **não** escreve. Só entra no
  app com uma fonte citada; sem fonte, sai.

## Por que este item (e não o óleo)

- É da **auditoria periódica**: não tem "Corrigi na hora", então quando
  sai inadequado a ação é SEMPRE gerada — o plano pronto aparece.
- Vale para os **6 perfis** (feirante e ambulante inclusive).
- A correção está quase toda **escrita na própria norma**, espalhada em
  4.3, 4.1, 4.5 e 4.11. O plano pronto vira um mapa da norma: reúne num
  lugar só o que o usuário teria que garimpar em quatro seções. Quase não
  sobra complemento para justificar na banca.

---

## 1. O que a norma diz (para conferir)

**4.3.1** — A edificação, as instalações, os equipamentos, os móveis e os
utensílios devem ser livres de vetores e pragas urbanas. Deve existir um
conjunto de ações eficazes e contínuas de controle de vetores e pragas
urbanas, com o objetivo de impedir a atração, o abrigo, o acesso e ou a
proliferação dos mesmos.

**4.3.2** — Quando as medidas de prevenção adotadas não forem eficazes, o
controle químico deve ser empregado e executado por empresa especializada,
conforme legislação específica, com produtos desinfestantes regularizados
pelo Ministério da Saúde.

**4.3.3** — Quando da aplicação do controle químico, a empresa
especializada deve estabelecer procedimentos pré e pós-tratamento a fim de
evitar a contaminação dos alimentos, equipamentos e utensílios. Quando
aplicável, os equipamentos e os utensílios, antes de serem reutilizados,
devem ser higienizados para a remoção dos resíduos de produtos
desinfestantes.

**4.11.6** (trecho; no rascunho original estava errado como 4.11.4 — corrigido pelo fiscal) — O POP referente ao controle integrado de vetores e
pragas urbanas deve contemplar as medidas preventivas e corretivas
destinadas a impedir a atração, o abrigo, o acesso e ou proliferação de
vetores e pragas urbanas. No caso da adoção de controle químico, o
estabelecimento deve apresentar comprovante de execução do serviço
fornecido pela empresa especializada contratada.

**4.1 — telas** (*conferir o número do subitem*) — As aberturas externas
das áreas de armazenamento e preparação de alimentos, inclusive o sistema
de exaustão, devem ser providas de telas milimetradas para impedir o
acesso de vetores e pragas urbanas; as telas devem ser removíveis para
facilitar a limpeza periódica.

**4.5.2 e 4.5.3** — coletores das áreas de preparo com tampa acionada sem
contato manual; lixo coletado com frequência e estocado em local fechado e
isolado. (*Já são itens do app: `resi_02` e `resi_03`.*)

## 2. O plano de ação (quando o item sai INADEQUADO)

**Prazo sugerido:** o padrão do app para item não crítico é **7 dias**. A
norma não fixa prazo. *(Decisão para o autor: manter 7 dias, ou encurtar
porque praga é risco direto ao alimento.)*

**Prevenção — atacar a causa**

1. **[NORMA 4.3.1]** Identificar e eliminar o que atrai, abriga ou dá acesso
   às pragas: restos de alimento expostos, frestas, aberturas sem proteção.
2. **[NORMA 4.1 — telas, conferir número]** Instalar ou repor telas
   milimetradas removíveis nas aberturas externas das áreas de preparo e
   armazenamento, inclusive na exaustão.
3. **[NORMA 4.5.2 / 4.5.3]** Manter o lixo em coletores tampados (tampa de
   pedal na área de preparo), retirado com frequência e guardado em local
   fechado, longe dos alimentos.

**Se a prevenção não bastar — controle químico**

4. **[NORMA 4.3.2]** Contratar empresa especializada para o controle
   químico, com produtos regularizados no Ministério da Saúde. Não aplicar
   veneno por conta própria.
5. **[NORMA 4.3.3]** Seguir os procedimentos pré e pós-tratamento indicados
   pela empresa, protegendo alimentos, equipamentos e utensílios; depois,
   higienizar equipamentos e utensílios antes de usá-los de novo.
6. **[NORMA 4.11.6]** Guardar o comprovante de execução do serviço emitido
   pela empresa.

**Documentação**

7. **[NORMA 4.11.6]** Conferir se o POP de controle integrado de vetores e
   pragas existe e descreve as medidas preventivas e corretivas; atualizar
   se o problema mostrou uma falha nele.

**Complemento (sem fonte, sai)**

8. **[COMPLEMENTO]** Anotar onde e quando a praga foi vista, para orientar a
   empresa e conferir se a medida funcionou. *(A RDC não pede esse registro.)*

## 3. Ressalvas para a revisão

- **Feirante e ambulante — DECIDIDO (21/10/2026): opção (b).** Cada passo
  aponta para o item do checklist de onde vem, e só aparece se esse item
  vale para o perfil (a mesma `item_aplicabilidade` do RF03) e não foi
  marcado "não se aplica" pelo estabelecimento (RF09). Nenhuma regra nova
  de perfil: o filtro que já existe decide.

  | Passo | Item do app | Perfis (seed) |
  |---|---|---|
  | 1. eliminar atração/abrigo | `prag_01` (4.3.1) | todos |
  | 2. telas milimetradas | `edif_04` (4.1.4) | fixos + food truck |
  | 3a. coletor com tampa de pedal | `resi_02` (4.5.2) | fixos + food truck |
  | 3b. lixo retirado e guardado fechado | `resi_03` (4.5.3) | todos |
  | 4. empresa especializada | `prag_02` (4.3.2) | fixos + food truck |
  | 5. pré/pós-tratamento | `prag_03` (4.3.3) | fixos + food truck |
  | 6. comprovante do serviço | `prag_02` (cita 4.11.6) | fixos + food truck |
  | 7. POP de pragas | `docu_06` (4.11.6) | todos |
  | 8. anotar onde/quando (complemento) | `prag_01` | todos |

  Feirante e ambulante veem os passos **1, 3b, 7 e 8**. O passo 3 foi
  dividido em 3a/3b justamente porque metade dele vale para todos e
  metade não.
  - Achado de passagem: no seed, as telas são o **4.1.4** (`edif_04`) —
    use esse número na conferência.
- O passo 1 diz COMO cumprir o objetivo do 4.3.1 com exemplos (restos,
  frestas, aberturas); os exemplos são nossos. Se preferir rigor total,
  ele vira só: "Adotar ações contínuas para impedir a atração, o abrigo, o
  acesso e a proliferação de pragas (4.3.1)."

## 4. Como ficaria no app (proposta, depois da revisão)

- A **descrição** da ação gerada passa a ser os passos aprovados, no lugar
  de "Adequar ao item 4.3.1 da RDC 216: …".
- Cada passo leva a etiqueta do artigo ("RDC 4.3.2") ou "boa prática", para
  a tela mostrar o que é norma e o que é complemento.
- Os passos ficam em `data/planos-acao.ts` (catálogo por item, só com o
  `prag_01` por enquanto), levados ao SQLite pelo seed — o "banco local"
  que o orientador sugeriu. Os outros 88 itens continuam com o texto
  gerado.

## 5. Achado à parte (do rascunho anterior, do óleo)

O resumo do `prep_11` no app diz "trocar ao alterar **cor**, cheiro, espuma
ou fumaça". Pela redação do 4.8.11, a norma fala em **aroma e sabor** e em
**formação intensa de espuma e fumaça** — "cor" não aparece. Vale conferir
mesmo com o óleo fora do plano pronto; se confirmado, corrijo o tópico.

## 6. O que preciso de você

- [ ] Conferir os textos e os números dos subitens com o oficial
      (especialmente o das telas, no 4.1).
- [ ] Passo 8 (complemento): manter com fonte, ou cortar.
- [ ] Passo 1: com exemplos, ou só o texto da norma.
- [ ] Prazo: 7 dias ou mais curto.
- [x] Perfis móveis: opção (b) — decidido em 21/10/2026.
- [ ] O "cor" do `prep_11`.
