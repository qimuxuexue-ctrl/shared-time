alter table public.habits
  add column if not exists active_from date,
  add column if not exists active_until date;

alter table public.habits
  drop constraint if exists habits_active_range,
  add constraint habits_active_range check (
    (active_from is null and active_until is null)
    or
    (active_from is not null and active_until is not null and active_from <= active_until)
  );

