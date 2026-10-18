-- تصحيح: جدول الحجوزات ما فيه عمود payment_method، فطريقة الدفع تنكتب في الملاحظة.
create or replace function landing_create_booking(p_chalet_id bigint, p_name text, p_phone text, p_from date, p_to date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  s business_settings;
  c chalets;
  ph text := landing_norm_phone(p_phone);
  nm text := trim(coalesce(p_name, ''));
  total int := 0;
  d date;
  new_id bigint;
begin
  select * into s from business_settings where id = 1;
  if s is null or not coalesce(s.landing_enabled, false) or s.landing_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'الحجز من الموقع غير متاح حالياً');
  end if;
  select * into c from chalets where id = p_chalet_id and owner_id = s.landing_owner_id and coalesce(st,'active') <> 'inactive';
  if c is null then return jsonb_build_object('ok', false, 'error', 'الشاليه غير متاح'); end if;
  if length(nm) < 3 or position(' ' in nm) = 0 then
    return jsonb_build_object('ok', false, 'error', 'اكتب اسمك الأول واسم العائلة');
  end if;
  if ph !~ '^05[0-9]{8}$' then return jsonb_build_object('ok', false, 'error', 'رقم الجوال غير صحيح، اكتبه بصيغة 05XXXXXXXX'); end if;
  if p_from is null or p_to is null or p_to <= p_from then return jsonb_build_object('ok', false, 'error', 'تاريخ المغادرة لازم يكون بعد الوصول'); end if;
  if p_from < current_date then return jsonb_build_object('ok', false, 'error', 'تاريخ الوصول في الماضي'); end if;
  if p_to - p_from > 30 then return jsonb_build_object('ok', false, 'error', 'أقصى مدة للحجز من الموقع 30 ليلة'); end if;
  if exists (select 1 from blocked_guests bg where bg.owner_id = s.landing_owner_id and landing_norm_phone(bg.phone) = ph) then
    return jsonb_build_object('ok', false, 'error', 'تعذّر إتمام الحجز من الموقع، تواصل معنا مباشرة');
  end if;
  if exists (
    select 1 from bookings b
    where b.owner_id = s.landing_owner_id and b.chalet = c.name and b.status in ('confirmed','pending')
      and b.date_from < p_to and b.date_to > p_from
  ) then
    return jsonb_build_object('ok', false, 'error', 'التواريخ المختارة محجوزة، اختر تواريخ ثانية');
  end if;
  -- حد بسيط ضد الإزعاج: 3 طلبات معلقة كحد أقصى لنفس الجوال
  if (select count(*) from bookings b where b.owner_id = s.landing_owner_id and landing_norm_phone(b.phone) = ph and b.status = 'pending' and b.date_to >= current_date) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'عندك طلبات حجز معلقة، تواصل معنا لتأكيدها');
  end if;

  d := p_from;
  while d < p_to loop
    -- الجمعة والسبت بسعر الويكند (نفس منطق صفحة الشاليه)
    total := total + case when extract(dow from d) in (5,6) and coalesce(c.wprice,0) > 0 then c.wprice else coalesce(c.price,0) end;
    d := d + 1;
  end loop;

  insert into bookings (chalet, guest, phone, date_from, date_to, price, status, note, owner_id)
  values (c.name, nm, ph, p_from, p_to, total, 'pending', 'حجز من صفحة الموقع (تحويل بنكي) — بانتظار تأكيد التحويل', s.landing_owner_id)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'price', total, 'nights', p_to - p_from, 'chalet', c.name);
end $$;
