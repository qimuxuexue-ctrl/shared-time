alter table public.travel_stays
  add column if not exists check_in_time text not null default '',
  add column if not exists check_out_time text not null default '';

alter table public.travel_stays
  drop constraint if exists travel_stays_check_in_time_format,
  drop constraint if exists travel_stays_check_out_time_format;

alter table public.travel_stays
  add constraint travel_stays_check_in_time_format
    check (check_in_time = '' or check_in_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint travel_stays_check_out_time_format
    check (check_out_time = '' or check_out_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
