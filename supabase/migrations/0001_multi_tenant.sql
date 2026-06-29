-- Multi-tenant foundation: profiles, subscriptions, owner_id columns, RLS.
-- Run this in the Supabase SQL editor (or `supabase db push`) on a single environment.
-- IMPORTANT: take a database backup before running this on production.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'staff'
             check (role in ('platform_admin','owner','admin','staff','chalet_manager')),
  name       text,
  username   text,
  email      text,
  chalet     text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_owner_id_idx on profiles(owner_id);

-- helper: owner_id of the currently authenticated user (their own tenant scope)
create or replace function current_owner_id()
returns uuid
language sql stable
as $$
  select owner_id from profiles where id = auth.uid()
$$;

create or replace function is_platform_admin()
returns boolean
language sql stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'platform_admin')
$$;

-- ───────────────────────── subscriptions ─────────────────────────
create table if not exists subscriptions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  plan_name   text not null default 'تجريبي',
  status      text not null default 'trial'
              check (status in ('trial','active','suspended','expired')),
  price       numeric default 0,
  started_at  timestamptz not null default now(),
  expires_at  timestamptz,
  notes       text
);

-- ───────────────────────── owner_id on tenant tables ─────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'chalets','bookings','maintenance','wallet_transactions','cleaning','cleaning_expenses',
    'cleaning_tasks','cleaning_logs','cleaning_workers','expenses','fixed_expenses',
    'rooms','reviews','loyalty_cards','room_requests','smart_devices','guest_checkins'
  ]
  loop
    if to_regclass(quote_ident(t)) is not null then
      execute format('alter table %I add column if not exists owner_id uuid references auth.users(id)', t);
      execute format('create index if not exists %I_owner_id_idx on %I(owner_id)', t, t);
    else
      raise notice 'skipping missing table: %', t;
    end if;
  end loop;
end $$;

-- ───────────────────────── backfill: migrate existing data + users table ─────────────────────────
-- 1) Create one Supabase Auth user manually for "ريتام" BEFORE running the block below
--    (Dashboard → Authentication → Add user), then replace :reetam_auth_id with that UUID.
-- Example (run separately, after creating the auth user):
--
-- update chalets set owner_id = '<reetam-auth-uuid>' where owner_id is null;
-- update bookings set owner_id = '<reetam-auth-uuid>' where owner_id is null;
-- ... (repeat for every table listed above)
--
-- insert into profiles (id, owner_id, role, name, username, email)
--   select '<reetam-auth-uuid>', '<reetam-auth-uuid>', 'owner', name, username, email from users where role='admin' limit 1;
--
-- insert into subscriptions (owner_id, plan_name, status)
--   values ('<reetam-auth-uuid>', 'ريتام - مالك المنصة', 'active');

-- ───────────────────────── RLS ─────────────────────────
alter table profiles enable row level security;
alter table subscriptions enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select
  using (owner_id = current_owner_id() or is_platform_admin());

drop policy if exists profiles_modify on profiles;
create policy profiles_modify on profiles for all
  using (owner_id = current_owner_id() or is_platform_admin())
  with check (owner_id = current_owner_id() or is_platform_admin());

drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions for select
  using (owner_id = current_owner_id() or is_platform_admin());

drop policy if exists subscriptions_modify on subscriptions;
create policy subscriptions_modify on subscriptions for all
  using (is_platform_admin())
  with check (is_platform_admin());

do $$
declare
  t text;
begin
  foreach t in array array[
    'chalets','bookings','maintenance','wallet_transactions','cleaning','cleaning_expenses',
    'cleaning_tasks','cleaning_logs','cleaning_workers','expenses','fixed_expenses',
    'rooms','reviews','loyalty_cards','room_requests','smart_devices','guest_checkins'
  ]
  loop
    if to_regclass(quote_ident(t)) is not null then
      execute format('alter table %I enable row level security', t);
      execute format('drop policy if exists %I_tenant_isolation on %I', t, t);
      execute format(
        'create policy %I_tenant_isolation on %I for all using (owner_id = current_owner_id() or is_platform_admin()) with check (owner_id = current_owner_id() or is_platform_admin())',
        t, t
      );
    end if;
  end loop;
end $$;
