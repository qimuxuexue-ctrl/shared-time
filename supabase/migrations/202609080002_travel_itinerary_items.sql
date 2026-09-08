create table if not exists public.travel_itinerary_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  trip_date date not null,
  start_hour smallint not null,
  end_hour smallint not null,
  place_name text not null,
  address text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_itinerary_items_member_event_fk
    foreign key (member_id, event_id)
    references public.event_members(id, event_id)
    on delete cascade,
  constraint travel_itinerary_items_hours check (
    start_hour between 10 and 23
    and end_hour between 11 and 24
    and end_hour > start_hour
  ),
  constraint travel_itinerary_items_place_name_length check (char_length(place_name) between 1 and 120),
  constraint travel_itinerary_items_address_length check (char_length(address) <= 300),
  constraint travel_itinerary_items_latitude check (latitude between -90 and 90),
  constraint travel_itinerary_items_longitude check (longitude between -180 and 180)
);

create index if not exists travel_itinerary_items_event_date_idx
  on public.travel_itinerary_items(event_id, trip_date, start_hour);

alter table public.travel_itinerary_items enable row level security;

drop trigger if exists set_travel_itinerary_items_updated_at on public.travel_itinerary_items;
create trigger set_travel_itinerary_items_updated_at
before update on public.travel_itinerary_items
for each row execute function public.set_updated_at();
