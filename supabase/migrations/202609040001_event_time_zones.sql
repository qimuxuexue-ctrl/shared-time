alter table public.events
  add column if not exists time_zone text not null default 'Asia/Shanghai';

alter table public.events
  drop constraint if exists events_time_zone_values;

alter table public.events
  add constraint events_time_zone_values
  check (time_zone in ('Asia/Shanghai', 'Asia/Tokyo'));
