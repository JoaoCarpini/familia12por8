-- Cole isso no SQL Editor do Supabase e clique em RUN
-- Se já rodou antes, esse script atualiza sem perder dados

create table if not exists palpites (
  id uuid primary key default gen_random_uuid(),
  game_id text not null,
  name text not null default '',
  g1 text not null default '',
  g2 text not null default '',
  scorers text not null default '',
  locked boolean default false,
  created_at timestamptz default now()
);

create table if not exists oficial (
  game_id text primary key,
  g1 text default '',
  g2 text default '',
  scorers text default '',
  deadline timestamptz default null
);

create table if not exists games (
  id text primary key,
  team1 text not null,
  team2 text not null,
  date_label text not null default '',
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists ranking_historico (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  points integer not null default 0,
  updated_at timestamptz default now()
);

-- Desabilita RLS (acesso público sem autenticação)
alter table palpites disable row level security;
alter table oficial disable row level security;
alter table games disable row level security;
alter table ranking_historico disable row level security;
