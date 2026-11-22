-- Kemist database schema
-- Run this whole file once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to re-run.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- DRUGS  (one row per NAFDAC registration number)
-- ---------------------------------------------------------------------------
create table if not exists public.drugs (
  id                   uuid primary key default gen_random_uuid(),
  source_record_id     text not null,                   -- the source's own stable ID for this record (NOT the NRN alone)
  nrn                  text not null,                   -- NAFDAC registration number, e.g. A4-7559 (can repeat across records)
  product_name         text not null,
  active_ingredients   text,                            -- "Glucose; Sodium Chloride" (sorted by the importer)
  strength             text,                            -- "100 mg" / "4.3%; 0.9%"
  dosage_form          text,                            -- Tablet, Capsule, Suspension ...
  route                text,                            -- Oral, Intravenous ...
  atc_code             text,
  product_category     text,                            -- Drugs, Herbal, Medical Devices ...
  marketing_category   text,                            -- POM / OTC
  pack_size            text,
  applicant            text,
  manufacturer         text,
  manufacturer_country text,
  approval_date        date,
  expiry_date          date,
  status               text not null default 'Unknown', -- Active / Inactive etc., exactly as reported by the source
  smpc_url             text,
  image_url            text,
  source               text not null default 'NAFDAC Greenbook',
  source_url           text,
  fetched_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (source, source_record_id),

  -- helper columns used for searching and for "other brands"
  nrn_key              text generated always as (
                         regexp_replace(upper(nrn), '[^A-Z0-9]', '', 'g')
                       ) stored,
  ingredients_key      text generated always as (
                         lower(regexp_replace(coalesce(active_ingredients, ''), '[^a-zA-Z0-9;]', '', 'g'))
                       ) stored,
  search_text          text generated always as (
                         lower(
                           coalesce(product_name, '') || ' ' ||
                           coalesce(active_ingredients, '') || ' ' ||
                           coalesce(applicant, '') || ' ' ||
                           coalesce(manufacturer, '') || ' ' ||
                           coalesce(nrn, '')
                         )
                       ) stored
);

create index if not exists drugs_search_trgm_idx on public.drugs using gin (search_text extensions.gin_trgm_ops);
create index if not exists drugs_nrn_key_idx     on public.drugs (nrn_key);
create index if not exists drugs_ingredients_idx on public.drugs (ingredients_key);
create index if not exists drugs_name_idx        on public.drugs (lower(product_name));

-- ---------------------------------------------------------------------------
-- FACILITIES  (pharmacies, hospitals, clinics, labs; cached from OpenStreetMap)
-- ---------------------------------------------------------------------------
create table if not exists public.facilities (
  id            uuid primary key default gen_random_uuid(),
  osm_id        text unique,                -- e.g. node/123456 (null for facilities added by hand)
  name          text not null,
  type          text not null check (type in ('pharmacy','hospital','clinic','doctors','laboratory')),
  address       text,
  phone         text,
  opening_hours text,
  emergency     boolean not null default false,
  is_verified   boolean not null default false,   -- only true after a human has checked the licence
  lat           double precision not null,
  lng           double precision not null,
  source        text not null default 'OpenStreetMap',
  updated_at    timestamptz not null default now()
);

create index if not exists facilities_lat_lng_idx on public.facilities (lat, lng);
create index if not exists facilities_type_idx    on public.facilities (type);

-- Remembers which map areas we already pulled from OpenStreetMap, so we do not hit it on every visit
create table if not exists public.facility_fetch_log (
  cell        text primary key,
  fetched_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- REPORTS  (suspected fake / substandard drugs submitted by users)
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  report_type   text not null default 'suspected_fake'
                check (report_type in ('suspected_fake','packaging_mismatch','adverse_reaction','incorrect_record','other')),
  product_name  text not null,
  nrn           text,
  where_bought  text,
  details       text not null,
  contact       text,                       -- optional phone/email if the user wants a follow-up
  status        text not null default 'new' check (status in ('new','reviewing','forwarded','closed')),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- PROVENANCE: raw source payloads and import history
-- ---------------------------------------------------------------------------
create table if not exists public.source_records (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  source_record_id text not null,
  payload          jsonb not null,
  payload_hash     text not null,
  fetched_at       timestamptz not null default now(),
  unique (source, source_record_id)
);

create table if not exists public.sync_logs (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  job_name         text not null,
  external_run_id  text,
  status           text not null default 'running',   -- running / succeeded / completed_with_errors / failed
  records_seen     int not null default 0,
  records_imported int not null default 0,
  records_rejected int not null default 0,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  details          jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- FUNCTIONS
-- ---------------------------------------------------------------------------

-- Smart search: exact NRN, name prefix, substring, and typo-tolerant matching
create or replace function public.search_drugs(q text, lim int default 20, off_set int default 0)
returns setof public.drugs
language sql stable
set search_path = public, extensions
as $$
  with p as (
    select lower(trim(q)) as term,
           regexp_replace(upper(q), '[^A-Z0-9]', '', 'g') as nrn_term
  )
  select d.*
  from public.drugs d, p
  where length(p.term) >= 2
    and (
      d.nrn_key = p.nrn_term
      or d.search_text like '%' || p.term || '%'
      or p.term <% d.search_text
    )
  order by
    (d.nrn_key = p.nrn_term) desc,
    (lower(d.product_name) like p.term || '%') desc,
    word_similarity(p.term, d.search_text) desc,
    d.product_name
  limit least(lim, 50) offset greatest(off_set, 0);
$$;

-- Other registered brands with the same active ingredient(s)
create or replace function public.similar_drugs(p_id uuid, lim int default 30)
returns setof public.drugs
language sql stable
set search_path = public
as $$
  select d2.*
  from public.drugs d
  join public.drugs d2
    on d2.ingredients_key = d.ingredients_key
   and d2.id <> d.id
  where d.id = p_id
    and d.ingredients_key <> ''
  order by
    (coalesce(d2.dosage_form, '') = coalesce(d.dosage_form, '')) desc,
    (coalesce(d2.strength, '')    = coalesce(d.strength, ''))    desc,
    d2.product_name
  limit least(lim, 60);
$$;

-- Nearest facilities to a point (bounding box first, then exact distance in metres)
create or replace function public.nearby_facilities(
  in_lat double precision,
  in_lng double precision,
  radius_m int default 5000,
  types text[] default null,
  lim int default 60
)
returns table (
  id uuid, name text, type text, address text, phone text, opening_hours text,
  emergency boolean, is_verified boolean, lat double precision, lng double precision, distance_m double precision
)
language sql stable
set search_path = public
as $$
  select * from (
    select f.id, f.name, f.type, f.address, f.phone, f.opening_hours, f.emergency, f.is_verified, f.lat, f.lng,
           6371000 * 2 * asin(sqrt(
             power(sin(radians(f.lat - in_lat) / 2), 2) +
             cos(radians(in_lat)) * cos(radians(f.lat)) * power(sin(radians(f.lng - in_lng) / 2), 2)
           )) as distance_m
    from public.facilities f
    where f.lat between in_lat - (radius_m / 111320.0) and in_lat + (radius_m / 111320.0)
      and f.lng between in_lng - (radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.01)))
                    and in_lng + (radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.01)))
      and (types is null or f.type = any(types))
  ) x
  where x.distance_m <= radius_m
  order by x.distance_m
  limit least(lim, 200);
$$;

-- ---------------------------------------------------------------------------
-- SECURITY
-- The Express server uses the service-role key, which bypasses RLS.
-- RLS is switched on so that the public (anon) key cannot read or write anything directly.
-- ---------------------------------------------------------------------------
alter table public.drugs              enable row level security;
alter table public.facilities         enable row level security;
alter table public.facility_fetch_log enable row level security;
alter table public.reports            enable row level security;
alter table public.source_records     enable row level security;
alter table public.sync_logs          enable row level security;
-- Kemist migration 002: clinical label information (US labels from openFDA/DailyMed).
-- Run once in the Supabase SQL Editor. Safe to re-run.
create table if not exists public.clinical_info (
  id                uuid primary key default gen_random_uuid(),
  ingredient_key    text not null,                 -- canonical single-ingredient key, e.g. 'paracetamol'
  ingredient_label  text,
  source            text not null,                 -- 'openFDA'
  source_record_id  text not null,                 -- the label's set id
  jurisdiction      text not null default 'United States',
  title             text,
  indications       text,
  contraindications text,
  warnings          text,
  adverse_reactions text,
  interactions      text,
  label_version     text,
  effective_date    date,
  source_url        text,
  review_status     text not null default 'unreviewed',
  fetched_at        timestamptz not null default now(),
  unique (source, source_record_id)
);
create index if not exists clinical_info_ingredient_idx on public.clinical_info (ingredient_key);
alter table public.clinical_info enable row level security;

-- 1) Monthly API-call counter (so the free plan's call limit is never exceeded by accident)
create table if not exists public.api_usage (
  provider text not null,
  month    text not null,                 -- 'YYYY-MM'
  calls    int  not null default 0,
  primary key (provider, month)
);
alter table public.api_usage enable row level security;

-- 2) nearby_facilities now also returns the data source, so the app can label each listing
drop function if exists public.nearby_facilities(double precision, double precision, int, text[], int);
create or replace function public.nearby_facilities(
  in_lat double precision,
  in_lng double precision,
  radius_m int default 5000,
  types text[] default null,
  lim int default 60
)
returns table (
  id uuid, name text, type text, address text, phone text, opening_hours text,
  emergency boolean, is_verified boolean, source text, lat double precision, lng double precision, distance_m double precision
)
language sql stable
set search_path = public
as $$
  select * from (
    select f.id, f.name, f.type, f.address, f.phone, f.opening_hours, f.emergency, f.is_verified, f.source, f.lat, f.lng,
           6371000 * 2 * asin(sqrt(
             power(sin(radians(f.lat - in_lat) / 2), 2) +
             cos(radians(in_lat)) * cos(radians(f.lat)) * power(sin(radians(f.lng - in_lng) / 2), 2)
           )) as distance_m
    from public.facilities f
    where f.lat between in_lat - (radius_m / 111320.0) and in_lat + (radius_m / 111320.0)
      and f.lng between in_lng - (radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.01)))
                    and in_lng + (radius_m / (111320.0 * greatest(cos(radians(in_lat)), 0.01)))
      and (types is null or f.type = any(types))
  ) x
  where x.distance_m <= radius_m
  order by x.distance_m
  limit least(lim, 200);
$$;

-- Off switch, if you ever want the Google-sourced rows gone:
--   delete from public.facilities where source like 'Google Maps%';
create table if not exists public.alerts (
  id            uuid primary key default gen_random_uuid(),
  alert_no      text,                                  -- e.g. 023/2026
  title         text not null,
  summary       text,
  alert_type    text not null default 'notice' check (alert_type in ('counterfeit','recall','substandard','unregistered','notice')),
  nrns          text[] not null default '{}',          -- registration numbers mentioned in the alert, as written
  nrn_keys      text[] not null default '{}',          -- the same, normalised (letters+digits only) for matching
  batch_numbers text[] not null default '{}',
  published_at  date,
  source        text not null default 'NAFDAC',
  source_url    text not null,
  fetched_at    timestamptz not null default now(),
  unique (source, source_url)
);
create index if not exists alerts_nrn_keys_idx  on public.alerts using gin (nrn_keys);
create index if not exists alerts_published_idx on public.alerts (published_at desc nulls last);
alter table public.alerts enable row level security;
create table if not exists public.news_articles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  snippet      text,
  url          text not null unique,
  publisher    text,
  published_at timestamptz,
  category     text not null default 'nigeria' check (category in ('nigeria','pharmacy','safety','outbreak','world')),
  country      text,
  query_id     text,
  content_hash text not null,
  fetched_at   timestamptz not null default now()
);
create index if not exists news_published_idx on public.news_articles (published_at desc nulls last);
create index if not exists news_category_idx  on public.news_articles (category);
create index if not exists news_hash_idx      on public.news_articles (content_hash);
alter table public.news_articles enable row level security;
