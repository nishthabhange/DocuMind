-- Run once in Supabase: SQL Editor -> New query -> paste -> Run
create extension if not exists vector;

create table if not exists documents (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  original_filename text not null,
  storage_path text not null,
  file_type text,
  file_size_bytes bigint,
  sha256 text,
  page_count int,
  pages jsonb,
  metadata jsonb default '{}',
  summary text,
  document_type text,
  keywords jsonb,
  important_points jsonb,
  suggested_questions jsonb,
  security_notes jsonb,
  created_at timestamptz default now()
);

create table if not exists chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null,
  page_number int,
  content text not null,
  embedding vector(384)  -- matches the local all-MiniLM-L6-v2 model used in main.py
);

create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_user_idx on chunks (user_id);
create index if not exists documents_user_idx on documents (user_id);

-- Tables are only reached through the backend (which filters by user_id), so block direct access.
alter table documents enable row level security;
alter table chunks enable row level security;

-- Semantic search: closest chunks for one user (optionally one document).
create or replace function match_chunks(
  query_embedding vector(384), match_user uuid, match_doc uuid default null, match_count int default 6
) returns table (id bigint, document_id uuid, filename text, page_number int, content text, similarity float)
language sql stable as $$
  select c.id, c.document_id, d.original_filename, c.page_number, c.content,
         1 - (c.embedding <=> query_embedding)
  from chunks c join documents d on d.id = c.document_id
  where c.user_id = match_user and (match_doc is null or c.document_id = match_doc)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Private bucket for original files
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;