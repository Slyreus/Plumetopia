-- Plumetopia — schéma Supabase sécurisé
-- À exécuter dans l'éditeur SQL d'un nouveau projet Supabase.

create extension if not exists pgcrypto;

create table if not exists public.admin_discord_users (
  discord_user_id text primary key check (discord_user_id ~ '^[0-9]{17,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.birds (
  slug text primary key check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100),
  english_name text not null default '' check (char_length(english_name) <= 100),
  zones text[] not null check (cardinality(zones) >= 1),
  weather text[] not null check (
    cardinality(weather) >= 1
    and weather <@ array['Soleil', 'Pluie', 'Arc-en-ciel']::text[]
  ),
  periods text[] not null check (
    cardinality(periods) >= 1
    and periods <@ array['Matin', 'Après-midi', 'Soir', 'Nuit']::text[]
  ),
  unlock_level smallint not null check (unlock_level between 1 and 20),
  details text not null check (char_length(details) = 0 or char_length(details) between 12 and 500),
  tip text not null default '' check (char_length(tip) <= 400),
  category text not null default 'Oiseau' check (char_length(category) <= 80),
  is_event boolean not null default false,
  availability_label text check (availability_label is null or char_length(availability_label) <= 120),
  image_url text not null default './assets/birds/bird-placeholder.svg' check (
    image_url like 'https://%' or image_url like './assets/%'
  ),
  image_alt text not null check (char_length(image_alt) between 5 and 180),
  source_urls text[] not null default '{}',
  confidence text not null default 'communautaire' check (confidence in ('high', 'medium', 'communautaire', 'administrateur')),
  verified_at date,
  published boolean not null default true,
  position integer not null default 0 check (position >= 0),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Met aussi à niveau un projet existant : la description peut rester vide
-- jusqu'à sa rédaction manuelle depuis l'administration.
alter table public.birds drop constraint if exists birds_details_check;
alter table public.birds
  add constraint birds_details_check
  check (char_length(details) = 0 or char_length(details) between 12 and 500);

create table if not exists public.bird_coordinates (
  bird_slug text primary key references public.birds(slug) on update cascade on delete cascade,
  coordinates jsonb not null default '[]'::jsonb check (jsonb_typeof(coordinates) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.user_bird_observations (
  user_id uuid not null references auth.users(id) on delete cascade,
  bird_slug text not null references public.birds(slug) on update cascade on delete cascade,
  observed_at timestamptz not null default now(),
  primary key (user_id, bird_slug)
);

create table if not exists public.bird_audit_log (
  id bigint generated always as identity primary key,
  bird_slug text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create index if not exists birds_name_idx on public.birds (name);
create index if not exists birds_level_idx on public.birds (unlock_level);
create index if not exists birds_published_idx on public.birds (published) where published = true;
create index if not exists birds_zones_gin_idx on public.birds using gin (zones);
create index if not exists birds_weather_gin_idx on public.birds using gin (weather);
create index if not exists birds_periods_gin_idx on public.birds using gin (periods);
create index if not exists bird_audit_slug_idx on public.bird_audit_log (bird_slug, changed_at desc);
create index if not exists user_bird_observations_user_idx
on public.user_bird_observations (user_id, observed_at desc);

create or replace function public.is_plumetopia_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.identities as i
    inner join public.admin_discord_users as a
      on a.discord_user_id = i.provider_id
    where i.user_id = (select auth.uid())
      and i.provider = 'discord'
  );
$$;

create or replace function public.is_plumetopia_mfa_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_plumetopia_admin()
    and coalesce((select auth.jwt() ->> 'aal') = 'aal2', false);
$$;

revoke all on function public.is_plumetopia_admin() from public;
revoke all on function public.is_plumetopia_mfa_admin() from public;
grant execute on function public.is_plumetopia_admin() to authenticated;
grant execute on function public.is_plumetopia_mfa_admin() to authenticated;

create or replace function public.stamp_bird_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function public.stamp_coordinate_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create or replace function public.audit_bird_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.bird_audit_log (bird_slug, operation, old_data, new_data, changed_by)
  values (
    coalesce(new.slug, old.slug),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists birds_stamp_update on public.birds;
create trigger birds_stamp_update
before update on public.birds
for each row execute function public.stamp_bird_update();

drop trigger if exists coordinates_stamp_update on public.bird_coordinates;
create trigger coordinates_stamp_update
before update on public.bird_coordinates
for each row execute function public.stamp_coordinate_update();

drop trigger if exists birds_audit_change on public.birds;
create trigger birds_audit_change
after insert or update or delete on public.birds
for each row execute function public.audit_bird_change();

alter table public.admin_discord_users enable row level security;
alter table public.birds enable row level security;
alter table public.bird_coordinates enable row level security;
alter table public.bird_audit_log enable row level security;
alter table public.user_bird_observations enable row level security;

drop policy if exists "Public can read published birds" on public.birds;
create policy "Public can read published birds"
on public.birds for select
to anon, authenticated
using (published = true);

drop policy if exists "MFA admins can read all birds" on public.birds;
create policy "MFA admins can read all birds"
on public.birds for select
to authenticated
using (public.is_plumetopia_mfa_admin());

drop policy if exists "MFA admins can insert birds" on public.birds;
create policy "MFA admins can insert birds"
on public.birds for insert
to authenticated
with check (public.is_plumetopia_mfa_admin());

drop policy if exists "MFA admins can update birds" on public.birds;
create policy "MFA admins can update birds"
on public.birds for update
to authenticated
using (public.is_plumetopia_mfa_admin())
with check (public.is_plumetopia_mfa_admin());

drop policy if exists "MFA admins can delete birds" on public.birds;
create policy "MFA admins can delete birds"
on public.birds for delete
to authenticated
using (public.is_plumetopia_mfa_admin());

drop policy if exists "MFA admins manage coordinates" on public.bird_coordinates;
create policy "MFA admins manage coordinates"
on public.bird_coordinates for all
to authenticated
using (public.is_plumetopia_mfa_admin())
with check (public.is_plumetopia_mfa_admin());

drop policy if exists "MFA admins read audit log" on public.bird_audit_log;
create policy "MFA admins read audit log"
on public.bird_audit_log for select
to authenticated
using (public.is_plumetopia_mfa_admin());

drop policy if exists "Users read own observations" on public.user_bird_observations;
create policy "Users read own observations"
on public.user_bird_observations for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Users insert own observations" on public.user_bird_observations;
create policy "Users insert own observations"
on public.user_bird_observations for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users update own observations" on public.user_bird_observations;
create policy "Users update own observations"
on public.user_bird_observations for update
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Users delete own observations" on public.user_bird_observations;
create policy "Users delete own observations"
on public.user_bird_observations for delete
to authenticated
using (user_id = (select auth.uid()));

-- Sauvegarde atomique : la fiche et ses coordonnées sont validées dans la même transaction.
create or replace function public.save_bird_with_coordinates(
  p_slug text,
  p_expected_version integer,
  p_bird jsonb,
  p_coordinates jsonb
)
returns setof public.birds
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated public.birds;
begin
  if not public.is_plumetopia_mfa_admin() then
    raise exception 'admin_mfa_required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_bird -> 'zones') <> 'array'
    or jsonb_typeof(p_bird -> 'weather') <> 'array'
    or jsonb_typeof(p_bird -> 'periods') <> 'array'
    or jsonb_typeof(p_bird -> 'source_urls') <> 'array' then
    raise exception 'invalid_array_fields' using errcode = '22023';
  end if;

  update public.birds
  set
    name = p_bird ->> 'name',
    english_name = coalesce(p_bird ->> 'english_name', ''),
    zones = array(select jsonb_array_elements_text(p_bird -> 'zones')),
    weather = array(select jsonb_array_elements_text(p_bird -> 'weather')),
    periods = array(select jsonb_array_elements_text(p_bird -> 'periods')),
    unlock_level = (p_bird ->> 'unlock_level')::smallint,
    category = coalesce(p_bird ->> 'category', 'Oiseau'),
    details = p_bird ->> 'details',
    tip = coalesce(p_bird ->> 'tip', ''),
    is_event = coalesce((p_bird ->> 'is_event')::boolean, false),
    availability_label = nullif(p_bird ->> 'availability_label', ''),
    image_url = coalesce(p_bird ->> 'image_url', './assets/birds/bird-placeholder.svg'),
    image_alt = p_bird ->> 'image_alt',
    source_urls = array(select jsonb_array_elements_text(p_bird -> 'source_urls')),
    published = coalesce((p_bird ->> 'published')::boolean, true),
    confidence = coalesce(p_bird ->> 'confidence', 'administrateur'),
    verified_at = nullif(p_bird ->> 'verified_at', '')::date
  where slug = p_slug
    and version = p_expected_version
  returning * into v_updated;

  if not found then
    raise exception 'version_conflict' using errcode = '40001';
  end if;

  if p_coordinates is null or p_coordinates = 'null'::jsonb then
    delete from public.bird_coordinates where bird_slug = p_slug;
  else
    if jsonb_typeof(p_coordinates) <> 'array' then
      raise exception 'coordinates_must_be_array' using errcode = '22023';
    end if;

    insert into public.bird_coordinates (bird_slug, coordinates)
    values (p_slug, p_coordinates)
    on conflict (bird_slug)
    do update set coordinates = excluded.coordinates;
  end if;

  return next v_updated;
end;
$$;

revoke all on function public.save_bird_with_coordinates(text, integer, jsonb, jsonb) from public;
grant execute on function public.save_bird_with_coordinates(text, integer, jsonb, jsonb) to authenticated;

revoke all on table public.admin_discord_users from anon, authenticated;
revoke all on table public.user_bird_observations from anon;
grant select, insert, update, delete on table public.user_bird_observations to authenticated;
grant select on table public.birds to anon, authenticated;
grant insert, update, delete on table public.birds to authenticated;
grant select, insert, update, delete on table public.bird_coordinates to authenticated;
grant select on table public.bird_audit_log to authenticated;

-- L'audit est alimenté exclusivement par le trigger SECURITY DEFINER.
revoke insert, update, delete on public.bird_audit_log from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'birds'
  ) then
    alter publication supabase_realtime add table public.birds;
  end if;
end;
$$;

-- Ajoutez votre identifiant utilisateur Discord (le snowflake numérique, pas votre pseudo) :
-- insert into public.admin_discord_users (discord_user_id) values ('VOTRE_ID_DISCORD');
