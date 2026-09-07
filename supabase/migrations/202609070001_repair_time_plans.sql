begin;

create table if not exists public.event_final_periods (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slot_date date not null,
  start_hour smallint not null,
  end_hour smallint not null,
  created_at timestamptz not null default now(),
  constraint event_final_periods_hours check (
    start_hour between 10 and 23 and end_hour between 11 and 24
    and end_hour > start_hour
  ),
  constraint event_final_periods_unique unique (event_id, slot_date, start_hour, end_hour)
);
create index if not exists event_final_periods_event_id_idx
  on public.event_final_periods(event_id, slot_date, start_hour);
alter table public.event_final_periods enable row level security;

insert into public.event_final_periods (event_id, slot_date, start_hour, end_hour)
select e.id, e.final_date, e.final_start_hour, e.final_start_hour + 1
from public.events e
where e.final_date is not null and e.final_start_hour is not null
  and not exists (select 1 from public.event_final_periods p where p.event_id = e.id)
on conflict do nothing;

-- Lock the event and replace the entire plan in one transaction.
-- An empty array cancels the plan and clears its note.
create or replace function public.save_event_time_plan(
  p_event_id uuid, p_identity_id uuid, p_periods jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_first public.event_final_periods%rowtype;
  v_periods jsonb;
  v_now timestamptz := now();
begin
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.creator_identity_id <> p_identity_id then
    raise exception 'Event creator required';
  end if;
  if jsonb_typeof(p_periods) is distinct from 'array'
    or jsonb_array_length(p_periods) > 20 then
    raise exception 'Invalid time plan';
  end if;
  delete from public.event_final_periods where event_id = p_event_id;
  insert into public.event_final_periods (event_id, slot_date, start_hour, end_hour)
  select p_event_id, x.date, x."startHour", x."endHour"
  from jsonb_to_recordset(p_periods) as x(date date, "startHour" smallint, "endHour" smallint);

  select * into v_first from public.event_final_periods
  where event_id = p_event_id order by slot_date, start_hour limit 1;
  update public.events set
    final_date = v_first.slot_date,
    final_start_hour = v_first.start_hour,
    finalized_at = case when v_first.id is null then null else v_now end,
    final_note = case when v_first.id is null then null else final_note end
  where id = p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'date', slot_date, 'startHour', start_hour, 'endHour', end_hour
  ) order by slot_date, start_hour), '[]'::jsonb) into v_periods
  from public.event_final_periods where event_id = p_event_id;
  return jsonb_build_object('finalPeriods', v_periods, 'finalTime',
    case when v_first.id is null then null else jsonb_build_object(
      'date', v_first.slot_date, 'startHour', v_first.start_hour, 'finalizedAt', v_now
    ) end);
end;
$$;
revoke all on function public.save_event_time_plan(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_event_time_plan(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
