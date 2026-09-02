alter table public.availabilities
  drop constraint if exists availabilities_valid_hour;

alter table public.availabilities
  add constraint availabilities_valid_hour
  check (start_hour between 10 and 23);
