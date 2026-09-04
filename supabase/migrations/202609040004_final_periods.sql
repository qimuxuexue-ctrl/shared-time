create table if not exists public.event_final_periods (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slot_date date not null,
  start_hour smallint not null,
  end_hour smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint event_final_periods_hours check (
    start_hour between 10 and 23
    and end_hour between 11 and 24
    and end_hour > start_hour
  ),
  constraint event_final_periods_unique unique (
    event_id,
    slot_date,
    start_hour,
    end_hour
  )
);

create index if not exists event_final_periods_event_id_idx
  on public.event_final_periods(event_id, slot_date, start_hour);

alter table public.event_final_periods enable row level security;

insert into public.event_final_periods (event_id, slot_date, start_hour, end_hour)
select id, final_date, final_start_hour, final_start_hour + 1
from public.events
where final_date is not null and final_start_hour is not null
on conflict (event_id, slot_date, start_hour, end_hour) do nothing;
