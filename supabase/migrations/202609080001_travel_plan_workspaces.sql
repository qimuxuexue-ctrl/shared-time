alter table public.events
  add column if not exists workspace_kind text not null default 'share_time',
  add column if not exists end_date date;

alter table public.events
  drop constraint if exists events_workspace_kind_values;

alter table public.events
  add constraint events_workspace_kind_values
  check (workspace_kind in ('share_time', 'travel_plan'));

alter table public.events
  drop constraint if exists events_date_range;

alter table public.events
  add constraint events_date_range
  check (end_date is null or end_date >= start_date);
