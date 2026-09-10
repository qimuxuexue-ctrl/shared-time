alter table public.events
  drop constraint if exists events_time_zone_values;

alter table public.events
  add constraint events_time_zone_values
  check (time_zone in ('Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo'));
