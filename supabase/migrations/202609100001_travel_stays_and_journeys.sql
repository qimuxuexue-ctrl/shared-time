create table if not exists public.travel_stays (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  name text not null,
  check_in_date date not null,
  check_out_date date not null,
  address text not null default '',
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_stays_member_event_fk foreign key (member_id, event_id)
    references public.event_members(id, event_id) on delete cascade,
  constraint travel_stays_date_order check (check_out_date >= check_in_date),
  constraint travel_stays_name_length check (char_length(name) between 1 and 100),
  constraint travel_stays_address_length check (char_length(address) <= 240),
  constraint travel_stays_note_length check (char_length(note) <= 300)
);

create index if not exists travel_stays_event_date_idx
  on public.travel_stays(event_id, check_in_date);

alter table public.travel_stays enable row level security;

drop trigger if exists set_travel_stays_updated_at on public.travel_stays;
create trigger set_travel_stays_updated_at before update on public.travel_stays
for each row execute function public.set_updated_at();

create table if not exists public.travel_journeys (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  direction text not null,
  mode text not null,
  journey_date date not null,
  departure_time text not null default '',
  arrival_time text not null default '',
  origin text not null,
  destination text not null,
  reference text not null default '',
  note text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_journeys_member_event_fk foreign key (member_id, event_id)
    references public.event_members(id, event_id) on delete cascade,
  constraint travel_journeys_direction_values check (direction in ('outbound', 'return')),
  constraint travel_journeys_event_direction_unique unique (event_id, direction),
  constraint travel_journeys_mode_length check (char_length(mode) between 1 and 40),
  constraint travel_journeys_origin_length check (char_length(origin) between 1 and 100),
  constraint travel_journeys_destination_length check (char_length(destination) between 1 and 100),
  constraint travel_journeys_reference_length check (char_length(reference) <= 80),
  constraint travel_journeys_note_length check (char_length(note) <= 240)
);

alter table public.travel_journeys enable row level security;

drop trigger if exists set_travel_journeys_updated_at on public.travel_journeys;
create trigger set_travel_journeys_updated_at before update on public.travel_journeys
for each row execute function public.set_updated_at();
