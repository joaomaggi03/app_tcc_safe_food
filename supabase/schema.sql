-- supabase/schema.sql
-- ---------------------------------------------------------------
-- AS TABELAS DO BACKUP NA NUVEM (RF01, Fase 6).
--
-- Como usar: no painel do Supabase, abra "SQL Editor", cole este
-- arquivo inteiro e clique em "Run". Pode rodar de novo sem medo: tudo
-- aqui é "if not exists" / "or replace".
--
-- São ESPELHOS das cinco tabelas de dado do usuário do SQLite
-- (db/schema.ts), com duas diferenças:
--
--  1. As ligações são por UUID, não pelo id inteiro. O id 1 de um
--     celular não é o id 1 de outro; o uuid é o mesmo em qualquer lugar.
--  2. Cada linha tem `usuario_id` — o dono. A RLS (Row Level Security,
--     no fim do arquivo) faz o PRÓPRIO BANCO recusar que alguém leia ou
--     grave linha de outra pessoa. A chave pública que vai no app
--     (anon key) não dá acesso a nada sem login, e com login só às
--     linhas daquela conta.
--
-- As datas ficam em TEXT, exatamente como o app as grava. Converter
-- para timestamp aqui mudaria o fuso do `dia_local` e da `data_cadastro`
-- no caminho de volta — e o dia local é a base de toda conta de prazo.
--
-- NADA CALCULADO SOBE: não há score, vencimento nem sequência aqui.
-- O app recalcula tudo a partir destas linhas (plano, seção 6.0).

create table if not exists public.estabelecimento (
  uuid                          text primary key,
  usuario_id                    uuid not null default auth.uid()
                                  references auth.users (id) on delete cascade,
  nome                          text not null,
  perfil_id                     text not null,
  data_cadastro                 text not null,
  periodicidade_auditoria_dias  integer not null,
  cidade                        text,
  responsavel                   text,
  dias_funcionamento            text,
  atualizado_em                 text not null
);

create table if not exists public.inspecao (
  uuid                  text primary key,
  usuario_id            uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,
  estabelecimento_uuid  text not null
                          references public.estabelecimento (uuid) on delete cascade,
  trilha                text not null,
  modo                  text,
  data_inicio           text not null,
  data_conclusao        text,
  status                text not null,
  dia_local             text,
  total_itens           integer,
  atualizado_em         text not null
);

create table if not exists public.resposta (
  usuario_id         uuid not null default auth.uid()
                       references auth.users (id) on delete cascade,
  inspecao_uuid      text not null
                       references public.inspecao (uuid) on delete cascade,
  item_id            text not null,
  resposta           text not null,
  respondida_em      text not null,
  corrigido_na_hora  integer not null default 0,
  atualizado_em      text not null,
  primary key (inspecao_uuid, item_id)
);

create table if not exists public.item_oculto (
  usuario_id            uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,
  estabelecimento_uuid  text not null
                          references public.estabelecimento (uuid) on delete cascade,
  item_id               text not null,
  ocultado_em           text not null,
  atualizado_em         text not null,
  primary key (estabelecimento_uuid, item_id)
);

create table if not exists public.acao (
  uuid                  text primary key,
  usuario_id            uuid not null default auth.uid()
                          references auth.users (id) on delete cascade,
  estabelecimento_uuid  text not null
                          references public.estabelecimento (uuid) on delete cascade,
  item_id               text not null,
  inspecao_uuid         text references public.inspecao (uuid) on delete set null,
  descricao             text not null,
  prazo                 text not null,
  status                text not null,
  criada_em             text not null,
  concluida_em          text,
  atualizado_em         text not null
);

create index if not exists idx_inspecao_usuario    on public.inspecao (usuario_id);
create index if not exists idx_resposta_usuario    on public.resposta (usuario_id);
create index if not exists idx_item_oculto_usuario on public.item_oculto (usuario_id);
create index if not exists idx_acao_usuario        on public.acao (usuario_id);

-- ---------------------------------------------------------------
-- RLS: cada conta só enxerga e só grava as PRÓPRIAS linhas.
-- ---------------------------------------------------------------
alter table public.estabelecimento enable row level security;
alter table public.inspecao        enable row level security;
alter table public.resposta        enable row level security;
alter table public.item_oculto     enable row level security;
alter table public.acao            enable row level security;

drop policy if exists "dono" on public.estabelecimento;
drop policy if exists "dono" on public.inspecao;
drop policy if exists "dono" on public.resposta;
drop policy if exists "dono" on public.item_oculto;
drop policy if exists "dono" on public.acao;

create policy "dono" on public.estabelecimento for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "dono" on public.inspecao for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "dono" on public.resposta for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "dono" on public.item_oculto for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy "dono" on public.acao for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
