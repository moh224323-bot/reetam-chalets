-- هوية صفحة الهبوط (الاسم والشعار) وحسابات تواصل إضافية (سناب شات و X)،
-- وإرجاعها من landing_public().
alter table business_settings add column if not exists landing_logo  text;
alter table business_settings add column if not exists snapchat_url  text;
alter table business_settings add column if not exists x_url         text;
alter table business_settings add column if not exists landing_name  text;

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
