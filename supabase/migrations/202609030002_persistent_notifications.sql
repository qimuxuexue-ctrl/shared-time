create table if not exists public.identity_notifications (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id) on delete cascade,
  source_event_id uuid not null,
  event_share_code text not null,
  event_name text not null,
  notification_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint identity_notifications_share_code_format
    check (event_share_code ~ '^[A-Z0-9]{6}$'),
  constraint identity_notifications_event_name_length
    check (char_length(event_name) between 1 and 80),
  constraint identity_notifications_type_values
    check (notification_type in (
      'participant',
      'note',
      'timeline',
      'event_deleted',
      'event_expired'
    )),
  constraint identity_notifications_event_type_unique
    unique (identity_id, source_event_id, notification_type)
);

create index if not exists identity_notifications_identity_created_idx
  on public.identity_notifications(identity_id, created_at desc);

alter table public.identity_notifications enable row level security;
revoke all on table public.identity_notifications from anon, authenticated;
grant all on table public.identity_notifications to service_role;
