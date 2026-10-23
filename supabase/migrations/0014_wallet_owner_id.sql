-- جدول wallet كان الوحيد بدون عمود owner_id بين كل الجداول اللي تمرّ على نفس آلية الحفظ
-- في db() (تحقن owner_id تلقائياً بأي POST). غيابه كان يفشّل أي إيداع/سحب جديد بمحفظتي
-- التأمين والإيجار بخطأ PostgREST PGRST204 ("لم يُعثر على العمود")، بينما PATCH (تعديل
-- حركة موجودة) يستمر يشتغل عادي لأنه ما يمر على نفس حقن owner_id.
alter table wallet add column if not exists owner_id uuid;
update wallet set owner_id = 'b73bb73f-9b80-48fb-9953-fc9097d2a5ad' where owner_id is null;
