alter table public.events
  add column if not exists final_date date,
  add column if not exists final_start_hour smallint,
  add column if not exists finalized_at timestamptz;

alter table public.events
  drop constraint if exists events_final_time_complete;

alter table public.events
  add constraint events_final_time_complete check (
    (final_date is null and final_start_hour is null and finalized_at is null)
    or
    (final_date is not null and final_start_hour between 10 and 23 and finalized_at is not null)
  );

alter table public.identity_notifications
  drop constraint if exists identity_notifications_type_values;

alter table public.identity_notifications
  add constraint identity_notifications_type_values
  check (notification_type in (
    'participant',
    'note',
    'timeline',
    'final_time',
    'final_time_cancelled',
    'event_deleted',
    'event_expired'
  ));
