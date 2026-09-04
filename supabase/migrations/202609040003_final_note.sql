alter table public.events
  add column if not exists final_note text;

alter table public.events
  drop constraint if exists events_final_note_length;

alter table public.events
  add constraint events_final_note_length check (
    final_note is null or char_length(final_note) <= 300
  );
