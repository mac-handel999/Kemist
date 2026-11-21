-- Kemist migration 006: AI Assistant RAG - Vector embeddings for documents.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Document embeddings for RAG
create table if not exists public.document_embeddings (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,                 -- 'drugs', 'clinical_info', 'alerts', 'facilities'
  source_id       text not null,                 -- primary key of the source record
  content_type    text not null,                 -- 'drug_record', 'clinical_section', 'alert', 'facility'
  title           text,                          -- human-readable title
  content         text not null,                 -- the text content that was embedded
  embedding       vector(1536),                  -- OpenAI-compatible 1536-dim embedding
  metadata        jsonb not null default '{}'::jsonb, -- additional context (ingredient, category, etc.)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source, source_id, content_type)
);

create index if not exists document_embeddings_source_idx on public.document_embeddings (source, content_type);
create index if not exists document_embeddings_embedding_idx on public.document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
alter table public.document_embeddings enable row level security;

-- Function to search similar documents
create or replace function public.search_documents(
  query_embedding vector(1536),
  p_source text[] default null,
  p_content_type text[] default null,
  match_threshold float default 0.7,
  match_count int default 10
)
returns table (
  id uuid,
  source text,
  source_id text,
  content_type text,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select
    de.id,
    de.source,
    de.source_id,
    de.content_type,
    de.title,
    de.content,
    de.metadata,
    1 - (de.embedding <=> query_embedding) as similarity
  from public.document_embeddings de
  where de.embedding is not null
    and (p_source is null or de.source = any(p_source))
    and (p_content_type is null or de.content_type = any(p_content_type))
    and 1 - (de.embedding <=> query_embedding) > match_threshold
  order by de.embedding <=> query_embedding
  limit least(match_count, 50);
$$;

-- AI chat conversation history
create table if not exists public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  session_id      text not null,                 -- anonymous session identifier
  user_message    text not null,
  assistant_message text not null,
  retrieved_docs  jsonb,                         -- documents used for this response
  model           text,                          -- LLM model used
  tokens_used     int,
  created_at      timestamptz not null default now()
);

create index if not exists ai_conversations_session_idx on public.ai_conversations (session_id, created_at);
alter table public.ai_conversations enable row level security;