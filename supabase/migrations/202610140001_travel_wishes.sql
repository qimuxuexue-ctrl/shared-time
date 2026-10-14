create table if not exists public.travel_wishes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint travel_wishes_member_event_fk
    foreign key (member_id, event_id)
    references public.event_members(id, event_id)
    on delete cascade,
  constraint travel_wishes_content_length check (char_length(content) between 1 and 280)
);

create index if not exists travel_wishes_event_created_idx
  on public.travel_wishes(event_id, created_at);

alter table public.travel_wishes enable row level security;

drop trigger if exists set_travel_wishes_updated_at on public.travel_wishes;
create trigger set_travel_wishes_updated_at
before update on public.travel_wishes
for each row execute function public.set_updated_at();

revoke all on table public.travel_wishes from anon, authenticated;
grant all on table public.travel_wishes to service_role;
