create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  score_year integer not null,
  annual_year integer not null,
  score_month integer not null check (score_month between 1 and 12),
  group_name text not null check (group_name in ('個人', '雙人')),
  item_name text not null check (item_name in ('333', '363', 'Cycle')),
  player_no text not null,
  name1 text not null,
  name2 text not null default '',
  score_text text not null default '',
  effective_seconds numeric,
  remark text not null default '',
  coach_email text not null,
  coach_name text not null,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (score_year, score_month, group_name, item_name, player_no)
);

create index if not exists scores_month_idx
on public.scores (score_year, score_month, group_name, item_name);

alter table public.scores enable row level security;

drop policy if exists "coaches can read scores" on public.scores;
drop policy if exists "coaches can insert scores" on public.scores;
drop policy if exists "coaches can update scores" on public.scores;

create policy "coaches can read scores"
on public.scores for select
to authenticated
using (true);

create policy "coaches can insert scores"
on public.scores for insert
to authenticated
with check (auth.email() = coach_email);

create policy "coaches can update scores"
on public.scores for update
to authenticated
using (true)
with check (auth.email() = coach_email);
