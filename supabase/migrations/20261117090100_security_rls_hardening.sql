-- تقوية الأمان: إغلاق الوصول العام المفتوح للجداول (يعتمد على دوال 20261117090000_guest_rpcs).

-- ═══ 2) حذف السياسات المفتوحة للجميع (كانت تلغي فصل البيانات حسب المالك) ═══
drop policy if exists "allow_all" on public.cleaning_expenses;
drop policy if exists "allow_all" on public.cleaning_logs;
drop policy if exists "allow_all" on public.cleaning_tasks;
drop policy if exists "allow_all" on public.cleaning_workers;
drop policy if exists "allow all" on public.expenses;
drop policy if exists "allow_all" on public.fixed_expenses;
drop policy if exists "allow_all" on public.loyalty_cards;
drop policy if exists "allow_all" on public.room_requests;
drop policy if exists "allow_all services" on public.services;
drop policy if exists "allow all" on public.social_posts;
drop policy if exists "allow all" on public.users;
drop policy if exists "allow_all business_settings" on public.business_settings;
-- قراءة الحجوزات العامة كانت تكشف أسماء وجوالات كل الضيوف
drop policy if exists "public read bookings dates" on public.bookings;
drop policy if exists "public read booking dates" on public.bookings;
-- أي مستخدم مسجّل (حتى من حساب آخر) كان يصل لهذه الجداول
drop policy if exists "blocked_guests_authenticated" on public.blocked_guests;
drop policy if exists "guest_ratings_authenticated" on public.guest_ratings;

-- إعدادات النشاط (الحساب البنكي، صفحة الموقع): لمالك الموقع وفريقه فقط
create policy business_settings_owner on public.business_settings for all to authenticated
  using (landing_owner_id = current_owner_id() or is_platform_admin())
  with check (landing_owner_id = current_owner_id() or is_platform_admin());

-- ═══ 3) جداول كانت بدون RLS ═══
alter table public.wallet enable row level security;
drop policy if exists wallet_tenant_isolation on public.wallet;
create policy wallet_tenant_isolation on public.wallet for all
  using (owner_id = current_owner_id() or is_platform_admin())
  with check (owner_id = current_owner_id() or is_platform_admin());

alter table public.investor_payments enable row level security;
drop policy if exists investor_payments_tenant_isolation on public.investor_payments;
create policy investor_payments_tenant_isolation on public.investor_payments for all
  using (exists (select 1 from investors i where i.id = investor_id and (i.owner_id = current_owner_id() or is_platform_admin())))
  with check (exists (select 1 from investors i where i.id = investor_id and (i.owner_id = current_owner_id() or is_platform_admin())));

-- ═══ 4) كلمات مرور قديمة بنص عادي (الدخول صار عبر Supabase Auth) ═══
alter table public.users drop column if exists password;

-- ═══ 5) تنظيف تحذيرات الأمان ═══
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.landing_norm_phone(text) set search_path = public;
alter function public.landing_norm_family(text) set search_path = public;
alter function public.landing_last_word(text) set search_path = public;
