-- Kemist migration 005: Medicine safety alerts and counterfeit reports.
-- Run once in the Supabase SQL Editor. Safe to re-run.

-- Medicine alerts: verified counterfeit/recall notices from official sources (NAFDAC, WHO, etc.)
create table if not exists public.medicine_alerts (
  id                  uuid primary key default gen_random_uuid(),
  alert_type          text not null check (alert_type in ('counterfeit', 'recall', 'substandard', 'adverse_event', 'quality_issue', 'other')),
  severity            text not null check (severity in ('critical', 'high', 'medium', 'low')) default 'medium',
  title               text not null,
  description         text not null,
  product_name        text,
  nrn                 text,                           -- NAFDAC registration number if known
  batch_numbers       text[],                         -- specific batch numbers affected
  active_ingredients  text,
  strength            text,
  dosage_form         text,
  manufacturer        text,
  manufacturer_country text,
  source              text not null,                  -- 'NAFDAC', 'WHO', 'Manufacturer', 'Health Authority'
  source_url          text,                           -- link to official notice
  source_date         date,                           -- date of official notice
  affected_countries  text[] default '{NG}',          -- countries affected
  status              text not null check (status in ('active', 'resolved', 'superseded')) default 'active',
  published_by        uuid,                           -- admin user who published (if applicable)
  published_at        timestamptz not null default now(),
  expires_at          timestamptz,                    -- when alert is no longer relevant
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists medicine_alerts_status_idx on public.medicine_alerts (status);
create index if not exists medicine_alerts_product_idx on public.medicine_alerts (product_name);
create index if not exists medicine_alerts_nrn_idx on public.medicine_alerts (nrn);
create index if not exists medicine_alerts_ingredients_idx on public.medicine_alerts (active_ingredients);
create index if not exists medicine_alerts_published_idx on public.medicine_alerts (published_at desc);
alter table public.medicine_alerts enable row level security;

-- Community reports of suspected fake/substandard medicines
create table if not exists public.medicine_reports (
  id                  uuid primary key default gen_random_uuid(),
  report_type         text not null check (report_type in ('suspected_fake', 'packaging_mismatch', 'adverse_reaction', 'quality_concern', 'incorrect_record', 'other')),
  product_name        text not null,
  nrn                 text,
  batch_number        text,
  expiry_date         date,
  manufacturer        text,
  where_bought        text,                           -- pharmacy/shop name and location
  purchase_date       date,
  details             text not null,                  -- what the user noticed
  contact             text,                           -- optional contact for follow-up
  images              text[],                         -- URLs to uploaded images (if any)
  status              text not null check (status in ('new', 'under_review', 'verified', 'rejected', 'escalated')) default 'new',
  review_notes        text,                           -- internal review notes
  reviewed_by         uuid,                           -- admin who reviewed
  reviewed_at         timestamptz,
  related_alert_id    uuid references public.medicine_alerts(id), -- if this report led to an alert
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists medicine_reports_status_idx on public.medicine_reports (status);
create index if not exists medicine_reports_product_idx on public.medicine_reports (product_name);
create index if not exists medicine_reports_nrn_idx on public.medicine_reports (nrn);
create index if not exists medicine_reports_created_idx on public.medicine_reports (created_at desc);
alter table public.medicine_reports enable row level security;

-- Function to search medicine alerts
create or replace function public.search_medicine_alerts(
  q text default '',
  p_status text default 'active',
  p_alert_type text default null,
  p_severity text default null,
  lim int default 50,
  off_set int default 0
)
returns setof public.medicine_alerts
language sql stable
set search_path = public
as $$
  select a.*
  from public.medicine_alerts a
  where a.status = p_status
    and (p_alert_type is null or a.alert_type = p_alert_type)
    and (p_severity is null or a.severity = p_severity)
    and (q = '' or 
      a.product_name ilike '%' || q || '%' or
      a.nrn ilike '%' || q || '%' or
      a.active_ingredients ilike '%' || q || '%' or
      a.description ilike '%' || q || '%' or
      a.title ilike '%' || q || '%'
    )
    and (a.expires_at is null or a.expires_at > now())
  order by
    case a.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
    a.published_at desc
  limit least(lim, 100) offset greatest(off_set, 0);
$$;

-- Function to search medicine reports (admin)
create or replace function public.search_medicine_reports(
  q text default '',
  p_status text default null,
  p_report_type text default null,
  lim int default 50,
  off_set int default 0
)
returns setof public.medicine_reports
language sql stable
set search_path = public
as $$
  select r.*
  from public.medicine_reports r
  where (p_status is null or r.status = p_status)
    and (p_report_type is null or r.report_type = p_report_type)
    and (q = '' or
      r.product_name ilike '%' || q || '%' or
      r.nrn ilike '%' || q || '%' or
      r.details ilike '%' || q || '%' or
      r.where_bought ilike '%' || q || '%'
    )
  order by r.created_at desc
  limit least(lim, 100) offset greatest(off_set, 0);
$$;