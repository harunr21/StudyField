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

-- 2. Add search_vector column to pages (Notes)
alter table pages add column if not exists search_vector tsvector;
create index if not exists pages_search_vector_idx on pages using gin(search_vector);

create or replace function pages_search_vector_trigger() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('turkish', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('turkish', coalesce(public.extract_text_from_json(new.content), '')), 'B');
  return new;
end
$$ language plpgsql;

create trigger tsvector_update_pages
before insert or update on pages
for each row execute function pages_search_vector_trigger();

-- Helper function to extract text from JSONB content (Tiptap)
create or replace function public.extract_text_from_json(data jsonb) returns text as $$
declare
  txt text := '';
  k text;
  v jsonb;
begin
  if jsonb_typeof(data) = 'string' then
    return data #>> '{}';
  elsif jsonb_typeof(data) = 'object' then
    for k, v in select * from jsonb_each(data) loop
      txt := txt || ' ' || public.extract_text_from_json(v);
    end loop;
  elsif jsonb_typeof(data) = 'array' then
    for v in select * from jsonb_array_elements(data) loop
      txt := txt || ' ' || public.extract_text_from_json(v);
    end loop;
  end if;
  return trim(txt);
end
$$ language plpgsql immutable;


-- 3. Add search_vector column to youtube_videos
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


-- 4. Add search_vector column to youtube_video_notes
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


-- 5. Add search_vector column to pdf_documents
alter table pdf_documents add column if not exists search_vector tsvector;
create index if not exists pdf_documents_search_vector_idx on pdf_documents using gin(search_vector);

create or replace function pdf_documents_search_vector_trigger() returns trigger as $$
begin
  new.search_vector := to_tsvector('turkish', coalesce(new.title, ''));
  return new;
end
$$ language plpgsql;

create trigger tsvector_update_pdf_documents
before insert or update on pdf_documents
for each row execute function pdf_documents_search_vector_trigger();


-- 6. Add search_vector column to pdf_notes
alter table pdf_notes add column if not exists search_vector tsvector;
create index if not exists pdf_notes_search_vector_idx on pdf_notes using gin(search_vector);

create or replace function pdf_notes_search_vector_trigger() returns trigger as $$
begin
  new.search_vector := to_tsvector('turkish', coalesce(new.content, ''));
  return new;
end
$$ language plpgsql;

create trigger tsvector_update_pdf_notes
before insert or update on pdf_notes
for each row execute function pdf_notes_search_vector_trigger();
