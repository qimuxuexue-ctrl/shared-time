alter table public.travel_stays
  add column if not exists hotel_url text not null default '';

alter table public.travel_stays
  drop constraint if exists travel_stays_hotel_url_length,
  drop constraint if exists travel_stays_hotel_url_format;

alter table public.travel_stays
  add constraint travel_stays_hotel_url_length check (char_length(hotel_url) <= 1000),
  add constraint travel_stays_hotel_url_format check (hotel_url = '' or hotel_url ~* '^https?://');
