-- Create a function to update the updated_at column
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 1. Enable pg_trgm extension for similarity search (ilike support)
create extension if not exists pg_trgm with schema extensions;

-- 2. Add search_vector column to youtube_videos
alter table youtube_videos add column if not exists search_vector tsvector;
create index if not exists youtube_videos_search_vector_idx on youtube_videos using gin(search_vector);

create or replace function youtube_videos_search_vector_trigger() returns trigger as $$
begin
  new.search_vector := to_tsvector('turkish', coalesce(new.title, ''));
  return new;
end
$$ language plpgsql;

create trigger tsvector_update_youtube_videos
before insert or update on youtube_videos
for each row execute function youtube_videos_search_vector_trigger();


-- 3. Add search_vector column to youtube_video_notes
alter table youtube_video_notes add column if not exists search_vector tsvector;
create index if not exists youtube_video_notes_search_vector_idx on youtube_video_notes using gin(search_vector);

create or replace function youtube_video_notes_search_vector_trigger() returns trigger as $$
begin
  new.search_vector := to_tsvector('turkish', coalesce(new.content, ''));
  return new;
end
$$ language plpgsql;

create trigger tsvector_update_youtube_video_notes
before insert or update on youtube_video_notes
for each row execute function youtube_video_notes_search_vector_trigger();

