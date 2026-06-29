-- Backfill: link existing ريتام data to the newly created Supabase Auth account.
-- Run once. Safe to re-run (idempotent where possible).

do $$
declare
  reetam_id uuid := '30b067f3-e3a0-4753-bb16-a6008d38fdef';
  reetam_email text;
  t text;
begin
  select email into reetam_email from auth.users where id = reetam_id;

  -- platform_admin sees every tenant's data AND owns the original ريتام records
  insert into profiles (id, owner_id, role, name, email)
  values (reetam_id, reetam_id, 'platform_admin', 'ريتام', reetam_email)
  on conflict (id) do update set role = 'platform_admin', owner_id = reetam_id;

  insert into subscriptions (owner_id, plan_name, status)
  values (reetam_id, 'ريتام - مالك المنصة', 'active')
  on conflict (owner_id) do nothing;

  foreach t in array array[
    'chalets','bookings','maintenance','wallet_transactions','cleaning','cleaning_expenses',
    'cleaning_tasks','cleaning_logs','cleaning_workers','expenses','fixed_expenses',
    'rooms','reviews','loyalty_cards','room_requests','smart_devices','guest_checkins'
  ]
  loop
    if to_regclass(quote_ident(t)) is not null then
      execute format('update %I set owner_id = %L where owner_id is null', t, reetam_id);
    end if;
  end loop;
end $$;
