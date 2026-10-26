-- صفحة الموقع العامة كانت تعرف فقط عن الحجز بالمبيت (تاريخ وصول/مغادرة)، رغم إن لوحة
-- التحكم تتيح للمالك يفعّل "حجز بالساعة" بفترات محددة لكل شاليه (allow_hourly +
-- hourly_slots). الدالتين تحت يصلحون هذا: landing_public ترجع بيانات الفترات وتوقيتها
-- لكل حجز، و landing_create_booking تتحقق من توفر الفترة وتمنع حجزها مرتين (ومنع تعارضها
-- مع حجز مبيت يغطي نفس اليوم والعكس) على مستوى الخادم.

CREATE OR REPLACE FUNCTION public.landing_public()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s business_settings;
  own uuid;
  preview boolean := false;
begin
  select * into s from business_settings where id = 1;
  if s is null then return jsonb_build_object('enabled', false); end if;

  own := s.landing_owner_id;
  if not coalesce(s.landing_enabled, false) or own is null then
    if current_owner_id() is not null then
      own := current_owner_id();
      preview := true;
    else
      return jsonb_build_object('enabled', false, 'name', s.landing_name, 'logo', s.landing_logo);
    end if;
  end if;

  return jsonb_build_object(
    'enabled',        coalesce(s.landing_enabled, false) and not preview,
    'preview',        preview,
    'name',           s.landing_name,
    'logo',           s.landing_logo,
    'about',          s.landing_about,
    'tagline',        s.landing_tagline,
    'phone',          s.contact_phone,
    'whatsapp',       s.contact_whatsapp,
    'email',          s.contact_email,
    'instagram',      s.instagram_url,
    'tiktok',         s.tiktok_url,
    'snapchat',       s.snapchat_url,
    'x',              s.x_url,
    'location_text',  s.location_text,
    'location_url',   s.location_url,
    'bank_name',      s.bank_name,
    'bank_account_name', s.bank_account_name,
    'bank_iban',      s.bank_iban,
    'chalets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'loc', c.loc, 'cap', c.cap,
        'price', c.price, 'wprice', c.wprice, 'description', c.description,
        'img', c.img, 'gallery', c.gallery, 'amenities', c.amenities,
        'allow_overnight', coalesce(c.allow_overnight, true),
        'allow_hourly', coalesce(c.allow_hourly, false),
        'hourly_slots', c.hourly_slots,
        'rating', (select round(avg(r.rating)::numeric, 1) from reviews r where r.owner_id = own and r.chalet = c.name),
        'reviews', (select count(*) from reviews r where r.owner_id = own and r.chalet = c.name)
      ) order by c.sort_order nulls last, c.id)
      from chalets c
      where c.owner_id = own and coalesce(c.st, 'active') <> 'inactive'
        and (coalesce(c.allow_overnight, true) or coalesce(c.allow_hourly, false))
    ), '[]'::jsonb),
    'rating', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*)) from reviews where owner_id = own),
    'booked', coalesce((
      select jsonb_agg(jsonb_build_object('chalet', b.chalet, 'from', b.date_from, 'to', b.date_to, 'checkin_time', b.checkin_time, 'checkout_time', b.checkout_time))
      from bookings b
      where b.owner_id = own and b.status in ('confirmed','pending') and b.date_to >= current_date
    ), '[]'::jsonb)
  );
end
$function$;

CREATE OR REPLACE FUNCTION public.landing_create_booking(
  p_chalet_id bigint, p_name text, p_phone text, p_from date, p_to date,
  p_slot_index integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  s business_settings;
  c chalets;
  ph text := landing_norm_phone(p_phone);
  nm text := trim(coalesce(p_name, ''));
  total int := 0;
  d date;
  new_id bigint;
  slots jsonb;
  slot jsonb;
  slot_from text;
  slot_to text;
  slot_name text;
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
  if exists (select 1 from blocked_guests bg where bg.owner_id = s.landing_owner_id and landing_norm_phone(bg.phone) = ph) then
    return jsonb_build_object('ok', false, 'error', 'تعذّر إتمام الحجز من الموقع، تواصل معنا مباشرة');
  end if;
  if (select count(*) from bookings b where b.owner_id = s.landing_owner_id and landing_norm_phone(b.phone) = ph and b.status = 'pending' and b.date_to >= current_date) >= 3 then
    return jsonb_build_object('ok', false, 'error', 'عندك طلبات حجز معلقة، تواصل معنا لتأكيدها');
  end if;

  if p_slot_index is not null then
    -- حجز بالساعة (فترة محددة ليوم واحد)
    if not coalesce(c.allow_hourly, false) then
      return jsonb_build_object('ok', false, 'error', 'هذا الشاليه ما يتيح الحجز بالساعة');
    end if;
    if p_from is null then return jsonb_build_object('ok', false, 'error', 'اختر اليوم'); end if;
    if p_from < current_date then return jsonb_build_object('ok', false, 'error', 'تاريخ الحجز في الماضي'); end if;
    slots := coalesce(c.hourly_slots::jsonb, '[]'::jsonb);
    if p_slot_index < 0 or p_slot_index >= jsonb_array_length(slots) then
      return jsonb_build_object('ok', false, 'error', 'الفترة المختارة غير موجودة');
    end if;
    slot := slots -> p_slot_index;
    slot_name := slot ->> 'name';
    slot_from := slot ->> 'from';
    slot_to := slot ->> 'to';
    total := round(coalesce((slot ->> 'price')::numeric, 0))::int;

    if exists (
      select 1 from bookings b
      where b.owner_id = s.landing_owner_id and b.chalet = c.name and b.status in ('confirmed','pending')
        and b.date_from = b.date_to and b.date_from = p_from
        and b.checkin_time is not distinct from slot_from and b.checkout_time is not distinct from slot_to
    ) then
      return jsonb_build_object('ok', false, 'error', 'هذي الفترة محجوزة، اختر فترة أخرى');
    end if;
    if exists (
      select 1 from bookings b
      where b.owner_id = s.landing_owner_id and b.chalet = c.name and b.status in ('confirmed','pending')
        and b.date_from < b.date_to and b.date_from <= p_from and b.date_to > p_from
    ) then
      return jsonb_build_object('ok', false, 'error', 'هذا اليوم محجوز بالكامل (مبيت)');
    end if;

    insert into bookings (chalet, guest, phone, date_from, date_to, checkin_time, checkout_time, price, status, note, owner_id)
    values (c.name, nm, ph, p_from, p_from, slot_from, slot_to, total, 'pending', 'حجز بالساعة ('||coalesce(slot_name,'')||') من صفحة الموقع (تحويل بنكي) — بانتظار تأكيد التحويل', s.landing_owner_id)
    returning id into new_id;

    return jsonb_build_object('ok', true, 'id', new_id, 'price', total, 'chalet', c.name, 'slot', slot_name);
  end if;

  -- حجز مبيت (الوضع الأصلي)
  if p_from is null or p_to is null or p_to <= p_from then return jsonb_build_object('ok', false, 'error', 'تاريخ المغادرة لازم يكون بعد الوصول'); end if;
  if p_from < current_date then return jsonb_build_object('ok', false, 'error', 'تاريخ الوصول في الماضي'); end if;
  if p_to - p_from > 30 then return jsonb_build_object('ok', false, 'error', 'أقصى مدة للحجز من الموقع 30 ليلة'); end if;
  if exists (
    select 1 from bookings b
    where b.owner_id = s.landing_owner_id and b.chalet = c.name and b.status in ('confirmed','pending')
      and (
        (b.date_from < b.date_to and b.date_from < p_to and b.date_to > p_from)
        or (b.date_from = b.date_to and b.date_from >= p_from and b.date_from < p_to)
      )
  ) then
    return jsonb_build_object('ok', false, 'error', 'التواريخ المختارة محجوزة، اختر تواريخ ثانية');
  end if;

  d := p_from;
  while d < p_to loop
    total := total + case when extract(dow from d) in (5,6) and coalesce(c.wprice,0) > 0 then c.wprice else coalesce(c.price,0) end;
    d := d + 1;
  end loop;

  insert into bookings (chalet, guest, phone, date_from, date_to, price, status, note, owner_id)
  values (c.name, nm, ph, p_from, p_to, total, 'pending', 'حجز من صفحة الموقع (تحويل بنكي) — بانتظار تأكيد التحويل', s.landing_owner_id)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'id', new_id, 'price', total, 'nights', p_to - p_from, 'chalet', c.name);
end
$function$;
