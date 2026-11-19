-- بوابة المستثمر (ربع سنوي): صافي الربح ونصيب الشريك فقط بدون تفاصيل الإيرادات والمصاريف،
-- مع أداء الشاليه (الإشغال، عدد الحجوزات، التقييم) وتحويلاته.
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
    -- الكشوف الشهرية المعتمدة: صافي ربح الشاليه ونصيب الشريك فقط
    'statements', coalesce((select jsonb_agg(jsonb_build_object(
        'chalet', s.chalet, 'period', s.period, 'net', s.net, 'closed_at', s.closed_at,
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
      where i.profile_id = me.id and i.owner_id = me.owner_id), '[]'::jsonb),
    -- أداء الشاليه لآخر 4 أرباع: الإشغال (أيام محجوزة ÷ أيام الربع حتى اليوم)، الحجوزات، متوسط التقييم
    'performance', coalesce((select jsonb_agg(jsonb_build_object(
        'chalet', h.chalet, 'quarter', to_char(q.qs, 'YYYY') || '-Q' || to_char(q.qs, 'Q'),
        'bookings', pf.bookings, 'booked_days', pf.booked_days,
        'occupancy', case when q.days > 0 then round(least(100, pf.booked_days * 100.0 / q.days)) else 0 end,
        'rating', rv.rating, 'reviews', rv.cnt) order by q.qs desc, h.chalet)
      from (select distinct i.chalet from investors i where i.profile_id = me.id and i.owner_id = me.owner_id) h
      cross join lateral (
        select qs, greatest(0, least((qs + interval '3 months')::date, current_date + 1) - qs) days
        from generate_series(date_trunc('quarter', current_date)::date - interval '9 months', date_trunc('quarter', current_date)::date, interval '3 months') g(qs0)
        cross join lateral (select g.qs0::date qs) x
      ) q
      -- الأيام المحجوزة: كل ليلة مبيت + يوم الحجز بالساعة، بدون تكرار اليوم الواحد
      cross join lateral (
        select
          (select count(*) from bookings b where b.owner_id = me.owner_id and b.chalet = h.chalet
             and b.status in ('completed', 'confirmed')
             and b.date_from >= q.qs and b.date_from < (q.qs + interval '3 months')::date) bookings,
          (select count(distinct d::date) from bookings b
             cross join lateral generate_series(b.date_from, greatest(b.date_to - 1, b.date_from), interval '1 day') d
             where b.owner_id = me.owner_id and b.chalet = h.chalet and b.status in ('completed', 'confirmed')
               and d >= q.qs and d < (q.qs + interval '3 months') and d <= current_date) booked_days
      ) pf
      cross join lateral (
        select round(avg(r.rating)::numeric, 1) rating, count(*) cnt
        from reviews r where r.owner_id = me.owner_id and r.chalet = h.chalet
          and r.created_at >= q.qs and r.created_at < (q.qs + interval '3 months')
      ) rv), '[]'::jsonb));
end $$;

revoke all on function public.investor_portal() from public;
grant execute on function public.investor_portal() to authenticated;
