-- تتبّع منفصل لإرسال رسالة "قبل الوصول بساعة" عن رسالة "قبل الوصول بيوم"
-- (pre_arrival_sent الموجود يُستخدم لرسالة اليوم السابق).
alter table bookings add column if not exists pre_arrival_hour_sent boolean not null default false;
