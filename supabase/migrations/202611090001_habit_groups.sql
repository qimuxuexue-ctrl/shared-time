create table if not exists public.habit_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint habit_groups_name_length check (char_length(name) between 1 and 40)
);

create unique index if not exists habit_groups_event_name_unique
  on public.habit_groups(event_id, lower(name));

create index if not exists habit_groups_event_created_idx
  on public.habit_groups(event_id, created_at);

alter table public.habit_groups enable row level security;

alter table public.habits
  add column if not exists group_id uuid references public.habit_groups(id) on delete set null;

create index if not exists habits_group_id_idx on public.habits(group_id);
