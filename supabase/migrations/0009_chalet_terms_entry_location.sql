-- كل شاليه له شروط وأحكام، طريقة دخول، ورابط موقع خاص به — تُستخدم
-- في رسائل ما قبل الوصول.
alter table chalets add column if not exists terms        text;
alter table chalets add column if not exists entry_method text;
alter table chalets add column if not exists map_url      text;
