alter table public.travel_itinerary_items
  add column if not exists transport_mode text,
  add column if not exists transport_duration_minutes smallint,
  add column if not exists transport_note text;

alter table public.travel_itinerary_items
  drop constraint if exists travel_itinerary_items_transport_mode_length,
  drop constraint if exists travel_itinerary_items_transport_duration_range,
  drop constraint if exists travel_itinerary_items_transport_note_length;

alter table public.travel_itinerary_items
  add constraint travel_itinerary_items_transport_mode_length
    check (transport_mode is null or char_length(transport_mode) between 1 and 40),
  add constraint travel_itinerary_items_transport_duration_range
    check (transport_duration_minutes is null or transport_duration_minutes between 1 and 1440),
  add constraint travel_itinerary_items_transport_note_length
    check (transport_note is null or char_length(transport_note) <= 160);
