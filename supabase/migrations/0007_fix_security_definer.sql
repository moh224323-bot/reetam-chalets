-- إصلاح: current_owner_id() و is_platform_admin() لازم تكون security definer.
-- بدونها تحصل حلقة مفرغة: الدالتين تقرآن من profiles، وسياسة RLS على profiles
-- نفسها تحتاج نتيجة الدالتين عشان تسمح بالقراءة — فما حد يقدر يسجّل دخول.
-- (كان هذا مُصلَح يدوياً على قاعدة الإنتاج، لكن 0001 القديم بالكود رجع يكتب
-- النسخة المكسورة فوقه أول ما اشتغلت الأتمتة تلقائياً.)

create or replace function current_owner_id()
returns uuid
language sql stable
security definer set search_path = public
as $$
  select owner_id from profiles where id = auth.uid()
$$;

create or replace function is_platform_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'platform_admin')
$$;
