-- Allow a brand-new authenticated user to bootstrap their own owner profile
-- and trial subscription. Without this, profiles_modify/subscriptions_modify
-- block the very first insert because current_owner_id() has nothing to read yet.

drop policy if exists profiles_self_signup on profiles;
create policy profiles_self_signup on profiles for insert
  with check (id = auth.uid() and owner_id = auth.uid());

drop policy if exists subscriptions_self_trial on subscriptions;
create policy subscriptions_self_trial on subscriptions for insert
  with check (owner_id = auth.uid());
