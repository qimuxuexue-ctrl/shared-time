alter table public.availabilities
  drop constraint if exists availabilities_valid_hour;

alter table public.availabilities
  add constraint availabilities_valid_hour
  check (start_hour between 10 and 23);

alter table public.events
  add column if not exists event_type text not null default 'ongoing';

alter table public.events
  drop constraint if exists events_event_type_values;

alter table public.events
  add constraint events_event_type_values
  check (event_type in ('one_time', 'ongoing'));

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

create index if not exists event_notes_event_idx
  on public.event_notes(event_id);

drop trigger if exists set_event_notes_updated_at on public.event_notes;
create trigger set_event_notes_updated_at
before update on public.event_notes
for each row execute function public.set_updated_at();

alter table public.event_notes enable row level security;
revoke all on table public.event_notes from anon, authenticated;
grant all on table public.event_notes to service_role;
