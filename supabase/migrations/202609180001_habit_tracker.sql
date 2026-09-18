alter table public.events drop constraint if exists events_workspace_kind_values;
alter table public.events add constraint events_workspace_kind_values
  check (workspace_kind in ('share_time', 'travel_plan', 'habit_tracker'));

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  frequency text not null,
  target_count smallint not null,
  created_at timestamptz not null default now(),
  constraint habits_title_length check (char_length(title) between 1 and 60),
  constraint habits_frequency_values check (frequency in ('daily', 'weekly', 'half_monthly', 'monthly')),
  constraint habits_target_count_range check (target_count between 1 and 31)
);
create index if not exists habits_event_id_idx on public.habits(event_id, created_at);
alter table public.habits enable row level security;

create table if not exists public.habit_checkins (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  member_id uuid not null references public.event_members(id) on delete cascade,
  checkin_date date not null,
  count smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint habit_checkins_unique unique (habit_id, member_id, checkin_date),
  constraint habit_checkins_count_range check (count between 1 and 31)
);
create index if not exists habit_checkins_member_date_idx on public.habit_checkins(member_id, checkin_date);
alter table public.habit_checkins enable row level security;
