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
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint events_share_code_format check (share_code ~ '^[A-Z0-9]{6}$'),
  constraint events_name_length check (char_length(name) between 1 and 80),
  constraint events_weeks_ahead_range check (weeks_ahead between 1 and 12),
  constraint events_status_values check (status in ('active', 'closed', 'archived'))
);

create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  identity_id uuid not null references public.identities(id) on delete cascade,
  tag_name text not null,
  tag_color text not null default '#3B82F6',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint event_members_tag_name_length check (char_length(tag_name) between 1 and 24),
  constraint event_members_tag_color_format check (tag_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint event_members_identity_unique unique (event_id, identity_id),
  constraint event_members_id_event_unique unique (id, event_id)
);

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
  constraint availabilities_valid_hour check (
    (
      extract(isodow from slot_date) between 1 and 5
      and start_hour between 19 and 23
    )
    or
    (
      extract(isodow from slot_date) between 6 and 7
      and start_hour between 10 and 23
    )
  )
);

create index if not exists events_creator_identity_idx
  on public.events(creator_identity_id);

create index if not exists event_members_identity_idx
  on public.event_members(identity_id);

create index if not exists availabilities_event_week_idx
  on public.availabilities(event_id, slot_date);

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

alter table public.identities enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.availabilities enable row level security;

revoke all on table public.identities from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.event_members from anon, authenticated;
revoke all on table public.availabilities from anon, authenticated;

grant all on table public.identities to service_role;
grant all on table public.events to service_role;
grant all on table public.event_members to service_role;
grant all on table public.availabilities to service_role;

