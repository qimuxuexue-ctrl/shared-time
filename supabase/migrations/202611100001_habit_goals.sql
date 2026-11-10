create table if not exists public.habit_goals (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  description text,
  target_date date,
  status text not null default 'active',
  achieved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habit_goals_title_length check (char_length(title) between 1 and 60),
  constraint habit_goals_description_length check (description is null or char_length(description) <= 160),
  constraint habit_goals_status_values check (status in ('active', 'paused', 'achieved'))
);

create index if not exists habit_goals_event_created_idx
  on public.habit_goals(event_id, created_at);

alter table public.habit_goals enable row level security;

create table if not exists public.habit_goal_habits (
  goal_id uuid not null references public.habit_goals(id) on delete cascade,
  habit_id uuid not null references public.habits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (goal_id, habit_id)
);

create index if not exists habit_goal_habits_habit_idx
  on public.habit_goal_habits(habit_id);

alter table public.habit_goal_habits enable row level security;
