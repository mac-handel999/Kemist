-- Kemist migration 003: SerpApi facilities support. Run once in the Supabase SQL Editor. Safe to re-run.

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
