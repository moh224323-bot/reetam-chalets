-- صفحة الهبوط العامة + بوابة "حجزي" للضيف.
-- كل وصول الزوار (بدون تسجيل دخول) يمر عبر دوال security definer محددة،
-- ترجع فقط البيانات اللازمة وتتحقق من جوال الضيف قبل أي كتابة،
-- بدل فتح جداول الشاليهات والحجوزات للقراءة/الكتابة العامة.

alter table business_settings add column if not exists landing_enabled  boolean not null default false;
alter table business_settings add column if not exists landing_owner_id uuid;
alter table business_settings add column if not exists landing_about    text;
alter table business_settings add column if not exists landing_tagline  text;

alter table room_requests add column if not exists booking_id bigint references bookings(id) on delete set null;
alter table room_requests add column if not exists source text;
create index if not exists room_requests_booking_id_idx on room_requests(booking_id);

-- توحيد صيغة الجوال: أرقام عربية/إنجليزية، +966 / 00966 / 966 / 5xxxxxxxx → 05xxxxxxxx
create or replace function landing_norm_phone(p text)
returns text language sql immutable as $$
  select case
    when d ~ '^5[0-9]{8}$' then '0' || d
    else d
  end
  from (
    select regexp_replace(
             regexp_replace(
               regexp_replace(translate(coalesce(p,''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
             '^00966', '0'),
           '^966', '0') as d
  ) x
$$;

-- توحيد اسم العائلة: بدون "ال" التعريف، الهمزات والتاء المربوطة، والمسافات
create or replace function landing_norm_family(p text)
returns text language sql immutable as $$
  select regexp_replace(
           translate(regexp_replace(trim(coalesce(p,'')), '^ال', ''), 'أإآة', 'اااه'),
         '\s+', '', 'g')
$$;

-- آخر كلمة من اسم الضيف (اسم العائلة)
create or replace function landing_last_word(p text)
returns text language sql immutable as $$
  select regexp_replace(trim(coalesce(p,'')), '^.*\s', '')
$$;

-- ───────────── بيانات الصفحة العامة ─────────────
create or replace function landing_public()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s business_settings;
  own uuid;
  preview boolean := false;
begin
  select * into s from business_settings where id = 1;
  if s is null then return jsonb_build_object('enabled', false); end if;

  own := s.landing_owner_id;
  if not coalesce(s.landing_enabled, false) or own is null then
    -- معاينة المالك وهو مسجّل دخول حتى لو الصفحة غير منشورة
    if current_owner_id() is not null then
      own := current_owner_id();
      preview := true;
    else
      return jsonb_build_object('enabled', false);
    end if;
  end if;

  return jsonb_build_object(
    'enabled',        coalesce(s.landing_enabled, false) and not preview,
    'preview',        preview,
    'about',          s.landing_about,
    'tagline',        s.landing_tagline,
    'phone',          s.contact_phone,
    'whatsapp',       s.contact_whatsapp,
    'email',          s.contact_email,
    'instagram',      s.instagram_url,
    'tiktok',         s.tiktok_url,
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
        'rating', (select round(avg(r.rating)::numeric, 1) from reviews r where r.owner_id = own and r.chalet = c.name),
        'reviews', (select count(*) from reviews r where r.owner_id = own and r.chalet = c.name)
      ) order by c.sort_order nulls last, c.id)
      from chalets c
      where c.owner_id = own and coalesce(c.st, 'active') <> 'inactive'
        and coalesce(c.allow_overnight, true)
    ), '[]'::jsonb),
    'rating', (select jsonb_build_object('avg', round(avg(rating)::numeric, 1), 'count', count(*)) from reviews where owner_id = own),
    'booked', coalesce((
      select jsonb_agg(jsonb_build_object('chalet', b.chalet, 'from', b.date_from, 'to', b.date_to))
      from bookings b
      where b.owner_id = own and b.status in ('confirmed','pending') and b.date_to >= current_date
    ), '[]'::jsonb)
  );
end $$;

-- ───────────── حجز جديد من الصفحة ─────────────
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

-- ───────────── الدخول إلى "حجزي" بالجوال واسم العائلة ─────────────
create or replace function landing_guest_booking(p_phone text, p_family text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  s business_settings;
  ph text := landing_norm_phone(p_phone);
  fam text := landing_norm_family(p_family);
  b bookings;
  c chalets;
  lc loyalty_cards;
begin
  select * into s from business_settings where id = 1;
  if s is null or s.landing_owner_id is null then return jsonb_build_object('ok', false); end if;
  if ph !~ '^05[0-9]{8}$' or length(fam) < 2 then return jsonb_build_object('ok', false); end if;

  select * into b from bookings bk
  where bk.owner_id = s.landing_owner_id
    and landing_norm_phone(bk.phone) = ph
    and landing_norm_family(landing_last_word(bk.guest)) = fam
    and bk.status in ('confirmed','pending','completed')
    and bk.date_to >= current_date - 30
  order by (bk.date_to < current_date), abs(bk.date_from - current_date)
  limit 1;
  if b is null then return jsonb_build_object('ok', false); end if;

  select * into c from chalets where owner_id = s.landing_owner_id and name = b.chalet limit 1;
  select * into lc from loyalty_cards where landing_norm_phone(phone) = ph order by id limit 1;

  return jsonb_build_object(
    'ok', true,
    'id', b.id, 'chalet', b.chalet, 'guest', b.guest,
    'date_from', b.date_from, 'date_to', b.date_to,
    'checkin_time', b.checkin_time, 'checkout_time', b.checkout_time,
    'status', b.status, 'price', b.price,
    'nights', b.date_to - b.date_from,
    'stage', case when b.date_to < current_date or b.status = 'completed' then 'after'
                  when b.date_from <= current_date then 'during' else 'before' end,
    'map_url', case when b.status in ('confirmed','completed') then c.map_url end,
    'terms', c.terms,
    'img', c.img,
    'tickets', coalesce(lc.tickets, 0), 'free_nights', coalesce(lc.free_nights, 0),
    'reviewed', exists (select 1 from reviews r where r.booking_id = b.id),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('type', rr.type, 'note', rr.note, 'resolved', coalesce(rr.resolved,false), 'at', rr.created_at) order by rr.created_at desc)
      from room_requests rr where rr.booking_id = b.id
    ), '[]'::jsonb),
    'whatsapp', coalesce(s.contact_whatsapp, s.contact_phone)
  );
end $$;

-- تحقق مشترك: الحجز موجود، يخص صاحب الصفحة، والجوال مطابق
create or replace function landing_check_booking(p_booking bigint, p_phone text)
returns bookings language plpgsql stable security definer set search_path = public as $$
declare
  s business_settings;
  b bookings;
begin
  select * into s from business_settings where id = 1;
  select * into b from bookings
  where id = p_booking and owner_id = s.landing_owner_id
    and landing_norm_phone(phone) = landing_norm_phone(p_phone)
    and status in ('confirmed','pending','completed');
  return b;
end $$;

-- ───────────── طلبات الضيف: مستلزمات / نظافة / صيانة ─────────────
create or replace function landing_guest_request(p_booking bigint, p_phone text, p_kind text, p_items text, p_note text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b bookings := landing_check_booking(p_booking, p_phone);
  kind text := case p_kind when 'supplies' then 'مستلزمات' when 'cleaning' then 'نظافة' when 'maintenance' then 'صيانة' else null end;
  body text := left(trim(coalesce(p_items,'') || case when coalesce(trim(p_note),'') <> '' then ' — ' || trim(p_note) else '' end), 500);
begin
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'تعذّر التحقق من الحجز'); end if;
  if kind is null or body = '' then return jsonb_build_object('ok', false, 'error', 'اختر طلبك أولاً'); end if;
  if b.date_to < current_date - 1 then return jsonb_build_object('ok', false, 'error', 'انتهت مدة الحجز'); end if;
  if (select count(*) from room_requests where booking_id = b.id and coalesce(resolved,false) = false) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'عندك طلبات كثيرة قيد التنفيذ، تواصل معنا واتساب');
  end if;

  insert into room_requests (chalet, room, type, note, resolved, owner_id, booking_id, source)
  values (b.chalet, 'حجزي · ' || b.guest, kind, body, false, b.owner_id, b.id, 'landing');

  if kind = 'صيانة' then
    insert into maintenance (chalet, issue, maint_date, priority, status, note, req, owner_id)
    values (b.chalet, left(coalesce(nullif(trim(p_items),''), 'بلاغ من الضيف'), 200), current_date, 'متوسط', 'open', nullif(trim(p_note),''), 'الضيف: ' || b.guest, b.owner_id);
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- ───────────── تقييم الضيف + تذكرة ولاء ─────────────
create or replace function landing_guest_review(p_booking bigint, p_phone text, p_rating int, p_comment text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  b bookings := landing_check_booking(p_booking, p_phone);
  ph text := landing_norm_phone(p_phone);
  lc loyalty_cards;
begin
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'تعذّر التحقق من الحجز'); end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then return jsonb_build_object('ok', false, 'error', 'اختر عدد النجوم'); end if;
  if b.date_from > current_date then return jsonb_build_object('ok', false, 'error', 'التقييم يكون بعد الوصول'); end if;
  if exists (select 1 from reviews where booking_id = b.id) then return jsonb_build_object('ok', false, 'error', 'سبق وقيّمت هذا الحجز، شكراً لك'); end if;

  insert into reviews (booking_id, chalet, guest, rating, comment, owner_id)
  values (b.id, b.chalet, b.guest, p_rating, left(nullif(trim(p_comment),''), 1000), b.owner_id);

  -- نفس منطق صفحة التقييم: كل تقييم تذكرة، و3 تذاكر = ليلة مجانية
  select * into lc from loyalty_cards where landing_norm_phone(phone) = ph order by id limit 1;
  if lc.id is not null then
    update loyalty_cards set
      tickets = case when coalesce(tickets,0) >= 2 then 0 else coalesce(tickets,0) + 1 end,
      free_nights = case when coalesce(tickets,0) >= 2 then coalesce(free_nights,0) + 1 else coalesce(free_nights,0) end,
      total_reviews = coalesce(total_reviews,0) + 1, name = b.guest, updated_at = now()
    where id = lc.id;
  else
    insert into loyalty_cards (phone, name, tickets, free_nights, total_reviews, owner_id)
    values (ph, b.guest, 1, 0, 1, b.owner_id);
  end if;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function landing_check_booking(bigint, text) from public, anon, authenticated;
grant execute on function landing_public() to anon, authenticated;
grant execute on function landing_create_booking(bigint, text, text, date, date) to anon, authenticated;
grant execute on function landing_guest_booking(text, text) to anon, authenticated;
grant execute on function landing_guest_request(bigint, text, text, text, text) to anon, authenticated;
grant execute on function landing_guest_review(bigint, text, int, text) to anon, authenticated;
