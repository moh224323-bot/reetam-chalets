-- Re-link ريتام data to the new Auth account after recreating the user.
do $$
declare
  reetam_id uuid := '054425b4-8905-474f-8827-85933131b8f6';
  reetam_email text;
  t text;
begin
  update auth.users set email_confirmed_at = now() where id = reetam_id and email_confirmed_at is null;

  select email into reetam_email from auth.users where id = reetam_id;

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
