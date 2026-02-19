alter table if exists public.study_sessions
  add column if not exists tag text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_sessions_tag_length_check'
      and conrelid = 'public.study_sessions'::regclass
  ) then
    alter table public.study_sessions
      add constraint study_sessions_tag_length_check
      check (tag is null or char_length(tag) <= 60);
  end if;
end $$;
