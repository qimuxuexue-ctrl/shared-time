alter table public.travel_itinerary_items
  alter column trip_date drop not null,
  alter column start_hour drop not null,
  alter column end_hour drop not null,
  alter column place_name drop not null,
  alter column address drop not null,
  alter column latitude drop not null,
  alter column longitude drop not null;

alter table public.travel_itinerary_items
  drop constraint if exists travel_itinerary_items_hours,
  drop constraint if exists travel_itinerary_items_place_name_length,
  drop constraint if exists travel_itinerary_items_address_length,
  drop constraint if exists travel_itinerary_items_latitude,
  drop constraint if exists travel_itinerary_items_longitude;

alter table public.travel_itinerary_items
  add constraint travel_itinerary_items_schedule_consistency check (
    (trip_date is null and start_hour is null and end_hour is null)
    or (
      trip_date is not null
      and start_hour between 10 and 23
      and end_hour between 11 and 24
      and end_hour > start_hour
    )
  ),
  add constraint travel_itinerary_items_location_consistency check (
    (place_name is null and latitude is null and longitude is null)
    or (
      place_name is not null
      and char_length(place_name) between 1 and 120
      and latitude between -90 and 90
      and longitude between -180 and 180
    )
  ),
  add constraint travel_itinerary_items_address_length check (
    address is null or char_length(address) <= 300
  );
