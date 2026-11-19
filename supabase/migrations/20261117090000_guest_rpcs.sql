-- دوال آمنة لصفحات الضيف والعامل (بدون تسجيل دخول) بدل الوصول المباشر للجداول بالمفتاح العام.

-- ═══ 1) دوال صفحات الضيف ═══

-- صفحة الحجز/التسجيل/التقييم/المسبح/معلومات الوصول: بيانات الحجز بدون الجوال والسعر
create or replace function public.guest_booking(p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare b bookings; c chalets;
begin
  select * into b from bookings where id = p_id;
  if b.id is null then return null; end if;
  select * into c from chalets where name = b.chalet and owner_id = b.owner_id order by id limit 1;
  return jsonb_build_object(
    'booking', jsonb_build_object('id', b.id, 'chalet', b.chalet, 'guest', b.guest,
      'date_from', b.date_from, 'date_to', b.date_to, 'checkin_time', b.checkin_time, 'checkout_time', b.checkout_time,
      'status', b.status, 'pool_preference', b.pool_preference, 'pool_approved', b.pool_approved),
    'chalet', case when c.id is null then null else jsonb_build_object('name', c.name, 'loc', c.loc, 'img', c.img,
      'terms', c.terms, 'entry_method', c.entry_method, 'map_url', c.map_url) end,
    'has_review', exists (select 1 from reviews where booking_id = b.id),
    'has_checkin', exists (select 1 from guest_checkins where booking_id = b.id));
end $$;

create or replace function public.guest_checkin(p_booking bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'رابط غير صحيح'); end if;
  if not exists (select 1 from guest_checkins where booking_id = b.id) then
    insert into guest_checkins (booking_id, chalet, guest, phone, checked_in_at, terms_accepted, terms_accepted_at, owner_id)
    values (b.id, b.chalet, b.guest, b.phone, now(), true, now(), b.owner_id);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- التقييم + تذكرة الولاء؛ يرجع جوال الضيف لرابط بطاقة الولاء
create or replace function public.guest_submit_review(p_booking bigint, p_rating integer, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b bookings; ph text; lc loyalty_cards;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'رابط غير صحيح'); end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then return jsonb_build_object('ok', false, 'error', 'اختر عدد النجوم'); end if;
  if exists (select 1 from reviews where booking_id = b.id) then return jsonb_build_object('ok', false, 'error', 'سبق وقيّمت هذا الحجز، شكراً لك'); end if;

  insert into reviews (booking_id, chalet, guest, rating, comment, owner_id)
  values (b.id, b.chalet, b.guest, p_rating, left(nullif(trim(p_comment), ''), 1000), b.owner_id);

  ph := landing_norm_phone(b.phone);
  if coalesce(ph, '') <> '' then
    select * into lc from loyalty_cards where owner_id = b.owner_id and landing_norm_phone(phone) = ph order by id limit 1;
    if lc.id is not null then
      update loyalty_cards set
        tickets = case when coalesce(tickets, 0) >= 2 then 0 else coalesce(tickets, 0) + 1 end,
        free_nights = case when coalesce(tickets, 0) >= 2 then coalesce(free_nights, 0) + 1 else coalesce(free_nights, 0) end,
        total_reviews = coalesce(total_reviews, 0) + 1, name = b.guest, updated_at = now()
      where id = lc.id;
    else
      insert into loyalty_cards (phone, name, tickets, free_nights, total_reviews, owner_id)
      values (ph, b.guest, 1, 0, 1, b.owner_id);
    end if;
  end if;
  return jsonb_build_object('ok', true, 'phone', ph);
end $$;

create or replace function public.guest_pool_preference(p_booking bigint, p_pref text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_pref is null or p_pref !~ '^(on_arrival|ready(:[0-9]{1,2}:[0-9]{2})?)$' then
    return jsonb_build_object('ok', false, 'error', 'اختيار غير صحيح');
  end if;
  update bookings set pool_preference = p_pref, pool_approved = false where id = p_booking;
  if not found then return jsonb_build_object('ok', false, 'error', 'رابط غير صحيح'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- طلب من الغرفة عبر رمز QR
create or replace function public.guest_room_request(p_chalet text, p_room text, p_type text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c chalets;
begin
  select * into c from chalets where name = p_chalet order by id limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'الشاليه غير موجود'); end if;
  if coalesce(trim(p_type), '') = '' then return jsonb_build_object('ok', false, 'error', 'اختر نوع الطلب'); end if;
  if (select count(*) from room_requests where chalet = c.name and room = p_room and coalesce(resolved, false) = false) >= 10 then
    return jsonb_build_object('ok', false, 'error', 'عندك طلبات كثيرة قيد التنفيذ، تواصل معنا واتساب');
  end if;
  insert into room_requests (chalet, room, type, note, resolved, owner_id)
  values (c.name, left(p_room, 100), left(p_type, 50), left(nullif(trim(p_note), ''), 500), false, c.owner_id);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.guest_loyalty_card(p_phone text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'tickets', tickets, 'free_nights', free_nights, 'total_reviews', total_reviews)
  from loyalty_cards where landing_norm_phone(phone) = landing_norm_phone(p_phone) order by id limit 1
$$;

-- صفحة العامل: تسجيل إنجاز مهمة نظافة
create or replace function public.cleaning_task_done(p_log bigint, p_note text, p_media_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_media_url is null or p_media_url not like 'https://kduoasfaqtrotesohqpf.supabase.co/storage/v1/object/public/cleaning-media/%' then
    return jsonb_build_object('ok', false, 'error', 'الملف غير صحيح');
  end if;
  update cleaning_logs set status = 'done', done_at = now(), done_note = left(nullif(trim(p_note), ''), 1000),
    worker_done = true, done_media_url = p_media_url
  where id = p_log;
  if not found then return jsonb_build_object('ok', false, 'error', 'المهمة غير موجودة'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- صفحة الشاليه العامة: بيانات العرض والحساب البنكي والفترات المحجوزة فقط (بدون أسماء أو جوالات)
create or replace function public.guest_chalet_page(p_name text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s business_settings; c chalets;
begin
  select * into s from business_settings where id = 1;
  select * into c from chalets where name = p_name
    order by (owner_id is not distinct from s.landing_owner_id) desc, id limit 1;
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'chalet', jsonb_build_object('id', c.id, 'name', c.name, 'loc', c.loc, 'cap', c.cap, 'price', c.price, 'wprice', c.wprice,
      'description', c.description, 'st', c.st, 'img', c.img, 'gallery', c.gallery, 'amenities', c.amenities,
      'allow_overnight', c.allow_overnight, 'allow_hourly', c.allow_hourly, 'hourly_slots', c.hourly_slots,
      'terms', c.terms, 'map_url', c.map_url),
    'bank', jsonb_build_object('bank_name', s.bank_name, 'bank_account_name', s.bank_account_name, 'bank_iban', s.bank_iban),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('date_from', b.date_from, 'date_to', b.date_to,
        'checkin_time', b.checkin_time, 'checkout_time', b.checkout_time, 'status', b.status))
      from bookings b where b.chalet = c.name and b.owner_id = c.owner_id
        and b.status in ('confirmed', 'pending') and b.date_to >= current_date - 1), '[]'::jsonb));
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'guest_booking(bigint)', 'guest_checkin(bigint)', 'guest_submit_review(bigint, integer, text)',
    'guest_pool_preference(bigint, text)', 'guest_room_request(text, text, text, text)',
    'guest_loyalty_card(text)', 'cleaning_task_done(bigint, text, text)', 'guest_chalet_page(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

