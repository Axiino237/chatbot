-- ============================================================
-- CHATBOT PLUGIN - Complete Database Schema (Fresh Install)
-- Run this entirely in Supabase SQL Editor
-- ============================================================

-- 1. Enable pgvector extension (required for embeddings)
create extension if not exists vector;

-- ============================================================
-- TABLES
-- ============================================================

-- Stores text chunks + embeddings from PDFs (for RAG search)
create table if not exists documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  file_name   text not null,
  content     text not null,
  embedding   vector(384),
  created_at  timestamp with time zone default now()
);

-- Tracks whether a user has uploaded knowledge
create table if not exists knowledge_status (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  is_uploaded boolean default false,
  updated_at  timestamp with time zone default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table documents       enable row level security;
alter table knowledge_status enable row level security;

-- documents: users can only access their own rows
drop policy if exists "Users can manage their own documents" on documents;
create policy "Users can manage their own documents"
  on documents for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- knowledge_status: users can only access their own row
drop policy if exists "Users can manage their own knowledge status" on knowledge_status;
create policy "Users can manage their own knowledge status"
  on knowledge_status for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- VECTOR SEARCH FUNCTION
-- ============================================================

-- Returns top matching document chunks for a given embedding,
-- filtered to the currently logged-in user only.
create or replace function match_documents (
  query_embedding  vector(384),
  match_threshold  float,
  match_count      int
)
returns table (
  id         uuid,
  content    text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.content,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where documents.user_id = auth.uid()
    and 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
