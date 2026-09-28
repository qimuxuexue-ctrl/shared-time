alter table public.habits
  add column if not exists duration_minutes smallint;

alter table public.habits
  drop constraint if exists habits_duration_minutes_values,
  add constraint habits_duration_minutes_values
    check (duration_minutes is null or duration_minutes in (10, 20, 30, 60, 90, 120, 150));

alter table public.habit_checkins
  add column if not exists start_hour smallint;

alter table public.habit_checkins
  drop constraint if exists habit_checkins_unique,
  drop constraint if exists habit_checkins_start_hour_range,
  add constraint habit_checkins_start_hour_range
    check (start_hour is null or start_hour between 10 and 23);

create unique index if not exists habit_checkins_timed_unique
  on public.habit_checkins(habit_id, member_id, checkin_date, start_hour)
  where start_hour is not null;

create unique index if not exists habit_checkins_untimed_unique
  on public.habit_checkins(habit_id, member_id, checkin_date)
  where start_hour is null;
