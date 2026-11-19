-- بوابة المستثمر: الشريك يدخل لوحة التحكم بحسابه ويشوف شاليهاته وكشوفه المُقفلة وتوزيعاته فقط.

-- ربط صفوف الشريك (صف لكل شاليه) بحساب الدخول
alter table public.investors add column if not exists profile_id uuid references public.profiles(id) on delete set null;
create index if not exists investors_profile_id_idx on public.investors(profile_id);

-- حساب المستثمر ما ياخذ owner_id: كل سياسات فصل البيانات (owner_id = current_owner_id()) تقفل عليه
-- تلقائياً، وبياناته توصله فقط عبر investor_portal() أدناه.
create or replace function public.current_owner_id()
returns uuid language sql stable security definer set search_path = public as $$
  select owner_id from profiles where id = auth.uid() and role <> 'investor'
$$;

-- كل مستخدم يقرا ملفه الشخصي (يحتاجه المستثمر بعد الدخول لمعرفة دوره)
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles for select using (id = auth.uid());

create or replace function public.investor_portal()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me profiles;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or me.role <> 'investor' then return null; end if;
  return jsonb_build_object(
    'name', me.name,
    'holdings', coalesce((select jsonb_agg(jsonb_build_object('investor_id', i.id, 'chalet', i.chalet, 'pct', i.percentage) order by i.chalet)
      from investors i where i.profile_id = me.id and i.owner_id = me.owner_id), '[]'::jsonb),
    -- الكشوف المُقفلة لشاليهاته: كل بنود الشاليه + نصيبه هو فقط (بدون أسماء أو أنصبة باقي الشركاء)
    'statements', coalesce((select jsonb_agg(jsonb_build_object(
        'chalet', s.chalet, 'period', s.period, 'revenue', s.revenue, 'bookings_count', s.bookings_count,
        'expenses', s.expenses, 'expenses_total', s.expenses_total, 'mgmt_fee_pct', s.mgmt_fee_pct, 'mgmt_fee', s.mgmt_fee,
        'net', s.net, 'reserve_spent', s.reserve_spent, 'closed_at', s.closed_at,
        'my_pct', sh.pct, 'my_share', sh.amount) order by s.period desc, s.chalet)
      from investor_statements s
      join investors i on i.chalet = s.chalet and i.owner_id = s.owner_id and i.profile_id = me.id
      cross join lateral (
        select coalesce(sum((x->>'amount')::numeric), 0) amount, max((x->>'pct')::numeric) pct
        from jsonb_array_elements(s.shares) x where (x->>'investor_id')::bigint = i.id
      ) sh
      where s.owner_id = me.owner_id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('chalet', i.chalet, 'amount', p.amount, 'paid_date', p.paid_date,
        'method', p.method, 'receipt_url', p.receipt_url, 'note', p.note) order by p.paid_date desc)
      from investor_payments p join investors i on i.id = p.investor_id
      where i.profile_id = me.id and i.owner_id = me.owner_id), '[]'::jsonb));
end $$;

revoke all on function public.investor_portal() from public;
grant execute on function public.investor_portal() to authenticated;

-- دور "investor" مسموح في الملفات الشخصية
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['platform_admin','owner','admin','staff','chalet_manager','investor']));
