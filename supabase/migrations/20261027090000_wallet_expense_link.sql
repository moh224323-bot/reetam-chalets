-- ربط إيداعات المحافظ (التأمين/الإيجار في wallet، والنظافة في cleaning) بالمصروف الذي أنشأها،
-- بحيث يحذف حذفُ المصروف إيداعَه تلقائياً.
alter table wallet   add column if not exists expense_id bigint references expenses(id) on delete cascade;
alter table cleaning add column if not exists expense_id bigint references expenses(id) on delete cascade;
create index if not exists wallet_expense_id_idx   on wallet(expense_id);
create index if not exists cleaning_expense_id_idx on cleaning(expense_id);

-- ربط الإيداعات القديمة: نفس الشاليه والمبلغ والتاريخ والفئة، إيداع واحد لكل مصروف
do $$
declare r record; eid bigint;
begin
  for r in select id, chalet, cat, amount, trans_date from wallet
           where type = 'إيداع' and note like 'من مصروف%' and expense_id is null order by id loop
    select e.id into eid from expenses e
     where e.chalet = r.chalet and e.category = r.cat and e.amount = r.amount and e.expense_date = r.trans_date
       and not exists (select 1 from wallet w where w.expense_id = e.id)
     order by e.id limit 1;
    if eid is not null then update wallet set expense_id = eid where id = r.id; end if;
  end loop;
  for r in select id, chalet, amount, trans_date from cleaning
           where type = 'إيداع' and note like 'من مصروف%' and expense_id is null order by id loop
    select e.id into eid from expenses e
     where e.chalet = r.chalet and e.category = 'تنظيف' and e.amount = r.amount and e.expense_date = r.trans_date
       and not exists (select 1 from cleaning c where c.expense_id = e.id)
     order by e.id limit 1;
    if eid is not null then update cleaning set expense_id = eid where id = r.id; end if;
  end loop;
end $$;
