create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.identities (
  id uuid primary key default gen_random_uuid(),
  id_key text not null unique,
  display_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  constraint identities_id_key_length check (char_length(id_key) between 2 and 24),
  constraint identities_display_id_length check (char_length(display_id) between 2 and 24)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique,
  name text not null,
  creator_identity_id uuid not null references public.identities(id) on delete restrict,
  start_date date not null,
  weeks_ahead smallint not null default 4,
  event_type text not null default 'ongoing',
  time_zone text not null default 'Asia/Shanghai',
  final_date date,
  final_start_hour smallint,
  finalized_at timestamptz,
  final_note text,
  status text not null default 'active',
  last_member_activity_at timestamptz,
  last_note_activity_at timestamptz,
  last_availability_activity_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint events_share_code_format check (share_code ~ '^[A-Z0-9]{6}$'),
  constraint events_name_length check (char_length(name) between 1 and 80),
  constraint events_weeks_ahead_range check (weeks_ahead between 1 and 12),
  constraint events_event_type_values check (event_type in ('one_time', 'ongoing')),
  constraint events_time_zone_values check (time_zone in ('Asia/Shanghai', 'Asia/Tokyo')),
  constraint events_final_time_complete check (
    (final_date is null and final_start_hour is null and finalized_at is null)
    or
    (final_date is not null and final_start_hour between 10 and 23 and finalized_at is not null)
  ),
  constraint events_final_note_length check (
    final_note is null or char_length(final_note) <= 300
  ),
  constraint events_status_values check (status in ('active', 'closed', 'archived'))
);

alter table public.events
  add column if not exists event_type text not null default 'ongoing';

alter table public.events
  add column if not exists time_zone text not null default 'Asia/Shanghai';

alter table public.events
  add column if not exists final_date date,
  add column if not exists final_start_hour smallint,
  add column if not exists finalized_at timestamptz,
  add column if not exists final_note text;

alter table public.events
  drop constraint if exists events_event_type_values;

alter table public.events
  add constraint events_event_type_values
  check (event_type in ('one_time', 'ongoing'));

alter table public.events
  drop constraint if exists events_time_zone_values;

alter table public.events
  add constraint events_time_zone_values
  check (time_zone in ('Asia/Shanghai', 'Asia/Tokyo'));

alter table public.events
  drop constraint if exists events_final_time_complete;

alter table public.events
  add constraint events_final_time_complete check (
    (final_date is null and final_start_hour is null and finalized_at is null)
    or
    (final_date is not null and final_start_hour between 10 and 23 and finalized_at is not null)
  );

alter table public.events
  drop constraint if exists events_final_note_length;

alter table public.events
  add constraint events_final_note_length check (
    final_note is null or char_length(final_note) <= 300
  );

alter table public.events
  add column if not exists last_member_activity_at timestamptz,
  add column if not exists last_note_activity_at timestamptz,
  add column if not exists last_availability_activity_at timestamptz;

create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  identity_id uuid not null references public.identities(id) on delete cascade,
  tag_name text not null,
  tag_color text not null default '#3B82F6',
  last_viewed_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_members_tag_name_length check (char_length(tag_name) between 1 and 24),
  constraint event_members_tag_color_format check (tag_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint event_members_identity_unique unique (event_id, identity_id),
  constraint event_members_id_event_unique unique (id, event_id)
);

alter table public.event_members
  add column if not exists last_viewed_at timestamptz not null
  default timezone('utc', now());

create table if not exists public.availabilities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  slot_date date not null,
  start_hour smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint availabilities_member_event_fk
    foreign key (member_id, event_id)
    references public.event_members(id, event_id)
    on delete cascade,
  constraint availabilities_slot_unique unique (member_id, slot_date, start_hour),
  constraint availabilities_valid_hour check (start_hour between 10 and 23)
);

alter table public.availabilities
  drop constraint if exists availabilities_valid_hour;

alter table public.availabilities
  add constraint availabilities_valid_hour
  check (start_hour between 10 and 23);

create table if not exists public.event_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_notes_member_event_fk
    foreign key (member_id, event_id)
    references public.event_members(id, event_id)
    on delete cascade,
  constraint event_notes_member_unique unique (event_id, member_id),
  constraint event_notes_content_length check (char_length(content) between 1 and 500)
);

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
      'final_time',
      'final_time_cancelled',
      'event_deleted',
      'event_expired'
    )),
  constraint identity_notifications_event_type_unique
    unique (identity_id, source_event_id, notification_type)
);

create index if not exists events_creator_identity_idx
  on public.events(creator_identity_id);

create index if not exists event_members_identity_idx
  on public.event_members(identity_id);

create index if not exists availabilities_event_week_idx
  on public.availabilities(event_id, slot_date);

create index if not exists event_notes_event_idx
  on public.event_notes(event_id);

create index if not exists identity_notifications_identity_created_idx
  on public.identity_notifications(identity_id, created_at desc);

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_event_members_updated_at on public.event_members;
create trigger set_event_members_updated_at
before update on public.event_members
for each row execute function public.set_updated_at();

drop trigger if exists set_availabilities_updated_at on public.availabilities;
create trigger set_availabilities_updated_at
before update on public.availabilities
for each row execute function public.set_updated_at();

drop trigger if exists set_event_notes_updated_at on public.event_notes;
create trigger set_event_notes_updated_at
before update on public.event_notes
for each row execute function public.set_updated_at();

alter table public.identities enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.availabilities enable row level security;
alter table public.event_notes enable row level security;
alter table public.identity_notifications enable row level security;

revoke all on table public.identities from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.event_members from anon, authenticated;
revoke all on table public.availabilities from anon, authenticated;
revoke all on table public.event_notes from anon, authenticated;
revoke all on table public.identity_notifications from anon, authenticated;

grant all on table public.identities to service_role;
grant all on table public.events to service_role;
grant all on table public.event_members to service_role;
grant all on table public.availabilities to service_role;
grant all on table public.event_notes to service_role;
grant all on table public.identity_notifications to service_role;
