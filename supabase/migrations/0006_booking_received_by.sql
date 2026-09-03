-- تسجيل اسم الشخص اللي استلم المبلغ عند تسجيل خروج الحجز.
alter table bookings add column if not exists received_by text;
