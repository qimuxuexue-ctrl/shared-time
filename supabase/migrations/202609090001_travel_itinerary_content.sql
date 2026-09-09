alter table public.travel_itinerary_items
  add column if not exists title text,
  add column if not exists note text not null default '';

update public.travel_itinerary_items
set title = place_name
where title is null or btrim(title) = '';

alter table public.travel_itinerary_items
  alter column title set not null;

alter table public.travel_itinerary_items
  drop constraint if exists travel_itinerary_items_title_length;

alter table public.travel_itinerary_items
  add constraint travel_itinerary_items_title_length
  check (char_length(title) between 1 and 80);

alter table public.travel_itinerary_items
  drop constraint if exists travel_itinerary_items_note_length;

alter table public.travel_itinerary_items
  add constraint travel_itinerary_items_note_length
  check (char_length(note) <= 300);
