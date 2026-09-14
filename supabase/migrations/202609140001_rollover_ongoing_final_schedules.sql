create or replace function public.rollover_event_time_plan(
  p_event_id uuid,
  p_week_start date
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_first public.event_final_periods%rowtype;
  v_periods jsonb;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found
    or v_event.workspace_kind <> 'share_time'
    or v_event.event_type <> 'ongoing' then
    raise exception 'Ongoing share-time event required';
  end if;

  delete from public.event_final_periods
  where event_id = p_event_id and slot_date < p_week_start;

  select * into v_first
  from public.event_final_periods
  where event_id = p_event_id
  order by slot_date, start_hour
  limit 1;

  update public.events set
    final_date = v_first.slot_date,
    final_start_hour = v_first.start_hour,
    finalized_at = case when v_first.id is null then null else finalized_at end,
    final_note = case when v_first.id is null then null else final_note end
  where id = p_event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'date', slot_date,
    'startHour', start_hour,
    'endHour', end_hour
  ) order by slot_date, start_hour), '[]'::jsonb)
  into v_periods
  from public.event_final_periods
  where event_id = p_event_id;

  return jsonb_build_object(
    'finalPeriods', v_periods,
    'finalTime', case when v_first.id is null then null else jsonb_build_object(
      'date', v_first.slot_date,
      'startHour', v_first.start_hour,
      'finalizedAt', v_event.finalized_at
    ) end,
    'finalNote', case when v_first.id is null then null else v_event.final_note end
  );
end;
$$;

revoke all on function public.rollover_event_time_plan(uuid, date)
from public, anon, authenticated;
grant execute on function public.rollover_event_time_plan(uuid, date)
to service_role;
