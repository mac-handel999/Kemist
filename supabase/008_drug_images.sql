-- Kemist migration 008: drug pack images
-- Run once in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.drug_images (
  id           uuid primary key default gen_random_uuid(),
  drug_id      uuid not null references public.drugs(id) on delete cascade,
  storage_path text not null,                      -- file in the 'drug-images' bucket
  kind         text not null default 'pack' check (kind in ('pack','front','back','blister','label')),
  uploaded_by  text not null default 'owner',      -- owner | manufacturer | pharmacy | user
  licence      text not null default 'owner-supplied',
  credit       text,
  status       text not null default 'approved' check (status in ('pending','approved','rejected')),
  created_at   timestamptz not null default now()
);
create index if not exists drug_images_drug_idx on public.drug_images (drug_id, status);
alter table public.drug_images enable row level security;

-- Allow public read of approved images
drop policy if exists "public read approved drug images" on public.drug_images;
create policy "public read approved drug images"
  on public.drug_images for select
  using (status = 'approved');

-- Allow service role full access
drop policy if exists "service role full access drug images" on public.drug_images;
create policy "service role full access drug images"
  on public.drug_images for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Storage bucket: create via Supabase Dashboard > Storage > New bucket
-- Name: drug-images
-- Public bucket: yes
-- File size limit: 3MB
-- Allowed MIME types: image/jpeg, image/png, image/webp