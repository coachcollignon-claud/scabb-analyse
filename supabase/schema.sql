-- =========================================================
-- SCABB Analyse — schéma Supabase (v2 : championnat Élite 2)
-- À coller dans Supabase > SQL Editor > New query > Run
-- (peut être relancé sans risque)
-- =========================================================

-- Matchs du SCABB (créés automatiquement par le robot championnat)
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  opp text not null,
  loc text not null default 'Dom' check (loc in ('Dom','Ext')),
  comp text not null default 'Élite 2',
  lnb_comp text not null default 'e2',
  status text not null default 'prevu' check (status in ('prevu','live','termine')),
  final jsonb,
  source text,
  created_at timestamptz not null default now()
);
alter table public.matches add column if not exists lnb_key text;
alter table public.matches add column if not exists journee int;
alter table public.matches add column if not exists time text;
create unique index if not exists matches_lnb_key_idx on public.matches(lnb_key);

-- Tous les matchs d'Élite 2 (calendrier + détail des matchs terminés)
create table if not exists public.league_games (
  id text primary key,                       -- ex. "J8-scabb-saint-etienne-metropole-rouen"
  journee int not null,
  date date not null,
  time text,
  home text not null,
  away text not null,
  status text not null default 'prevu',      -- prevu | live | termine
  home_pts int,
  away_pts int,
  has_detail boolean not null default false,
  detail jsonb,                              -- totaux, joueurs, cinq (résumé)
  raw jsonb,                                 -- Boxscore + Play by play (pour recalculs)
  updated_at timestamptz not null default now()
);
create index if not exists league_games_date_idx on public.league_games(date);

-- Instantané calculé des 20 équipes (lu par l'application)
create table if not exists public.league_snapshot (
  id text primary key, data jsonb not null, updated_at timestamptz not null default now()
);
-- État du robot championnat
create table if not exists public.league_state (
  id text primary key, status text, msg text, updated_at timestamptz not null default now()
);

-- État live (une ligne par match suivi)
create table if not exists public.live_state (
  match_id uuid primary key references public.matches(id) on delete cascade,
  box jsonb, events jsonb, meta jsonb,
  us int not null default 0,
  worker_status text, worker_msg text,
  stop boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Rapports : mi-temps, fin de match, scouting adversaire, bilan saison
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete cascade,
  kind text not null,
  stats jsonb not null,
  ai jsonb, model text, error text,
  created_at timestamptz not null default now()
);
alter table public.reports alter column match_id drop not null;
alter table public.reports add column if not exists subject text;
alter table public.reports drop constraint if exists reports_kind_check;
alter table public.reports add constraint reports_kind_check check (kind in ('mt','final','scout','season'));
create index if not exists reports_match_idx on public.reports(match_id, created_at desc);
create index if not exists reports_kind_idx on public.reports(kind, subject, created_at desc);

-- Sécurité : seuls les comptes connectés (le staff) accèdent aux données
do $$ declare t text; begin
  foreach t in array array['matches','league_games','league_snapshot','league_state','live_state','reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff" on public.%I', t);
    execute format('create policy "staff" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Temps réel vers l'application
do $$ declare t text; begin
  foreach t in array array['live_state','reports','matches','league_state','league_snapshot'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
  end loop;
end $$;
