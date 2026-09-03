alter table public.events
  add column if not exists last_member_activity_at timestamptz,
  add column if not exists last_note_activity_at timestamptz,
  add column if not exists last_availability_activity_at timestamptz;

alter table public.event_members
  add column if not exists last_viewed_at timestamptz not null
  default timezone('utc', now());
