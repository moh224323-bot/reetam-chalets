-- يوم استحقاق شهري للمصروف الثابت (مثل الإيجار) لحساب تاريخ الاستحقاق القادم والتذكير به.
alter table fixed_expenses add column if not exists due_day integer;
