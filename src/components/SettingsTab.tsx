import { useState, useEffect } from "react";
import { AppUser } from "../lib/types";
import { db } from "../lib/db";
import { Icon, Pill, PageHead, CardHead, Empty } from "./ds";

const SUPA_URL = process.env.EXPO_PUBLIC_SUPA_URL!;
const SUPA_KEY = process.env.EXPO_PUBLIC_SUPA_KEY!;

interface BankSettings {
  bank_name?: string;
  bank_account_name?: string;
  bank_iban?: string;
}

interface Props {
  users:    AppUser[];
  onAdd:    () => void;
  onEdit:   (u: AppUser) => void;
  onReload: () => void;
}

const ROLE_INFO: Record<string,{label:string;tone:"info"|"muted"|"warn";desc:string}> = {
  admin:           { label:"أدمن",        tone:"info",  desc:"يرى كل شيء ويتحكم بالكامل" },
  staff:           { label:"موظف",        tone:"muted", desc:"الحجوزات والشاليهات والصيانة" },
  chalet_manager:  { label:"مدير شاليه", tone:"warn",  desc:"يرى شاليهه فقط: حجوزات وصيانة وولاء" },
};

export default function SettingsTab({ users, onAdd, onEdit, onReload }: Props) {
  const [bank, setBank] = useState<BankSettings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1&select=*`, {
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    }).then(r => r.json()).then(rows => { if (rows?.[0]) setBank(rows[0]); }).catch(()=>{});
  }, []);

  async function saveBank() {
    setSaving(true);
    await fetch(`${SUPA_URL}/rest/v1/business_settings?id=eq.1`, {
      method: "PATCH",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(bank),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="x-page">
      <PageHead title="الإعدادات" sub="المستخدمون والصلاحيات وبيانات الدفع"/>

      <div className="x-card">
        <CardHead icon="users" title="المستخدمون" sub={users.length + " مستخدم"}>
          <button className="btn bp bsm" onClick={onAdd}><Icon n="plus" s={15}/>إضافة مستخدم</button>
        </CardHead>
        {users.length === 0 ? <Empty>لا يوجد مستخدمون</Empty> : (
          <div className="tbl-wrap"><table className="x-tbl">
            <thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الصلاحية</th><th>الشاليه</th><th className="end"></th></tr></thead>
            <tbody>{users.map(u => {
              const ri = ROLE_INFO[u.role] || ROLE_INFO.staff;
              return (
                <tr key={u.id}>
                  <td className="strong">{u.name}{u.email && <div className="x-muted" style={{ fontSize:12, fontWeight:400 }}>{u.email}</div>}</td>
                  <td className="x-mono x-muted">{u.username||"—"}</td>
                  <td><Pill tone={ri.tone}>{ri.label}</Pill></td>
                  <td>{u.chalet || <span className="x-muted">كل الشاليهات</span>}</td>
                  <td className="end">
                    <div style={{ display:"inline-flex", gap:6 }}>
                      <button className="btn bo bsm" aria-label={"تعديل " + u.name} onClick={() => onEdit(u)}><Icon n="edit" s={15}/></button>
                      {u.role !== "admin" && (
                        <button className="btn bd bsm" aria-label={"حذف " + u.name} onClick={async () => {
                          if (!window.confirm("حذف "+u.name+"؟ (يفقد صلاحية الدخول للنظام)")) return;
                          await db("profiles","DELETE",null,u.id);
                          onReload();
                        }}><Icon n="trash" s={15}/></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        <div className="x-pad" style={{ borderTop:"1px solid var(--line)", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,220px),1fr))", gap:12 }}>
          {Object.entries(ROLE_INFO).map(([key, r]) => (
            <div key={key} style={{ border:"1px solid var(--border)", borderRadius:12, padding:14, display:"flex", flexDirection:"column", gap:6 }}>
              <Pill tone={r.tone}>{r.label}</Pill>
              <span className="x-muted" style={{ fontSize:13 }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="x-card">
        <CardHead icon="bank" title="الحساب البنكي" sub="يظهر للزبون عند اختيار التحويل البنكي"/>
        <div className="x-pad" style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))", gap:14 }}>
            <div>
              <label className="lbl" htmlFor="bank_name">اسم البنك</label>
              <input id="bank_name" className="x-input" value={bank.bank_name||""} onChange={e=>setBank(p=>({...p,bank_name:e.target.value}))} placeholder="مثال: البنك الأهلي"/>
            </div>
            <div>
              <label className="lbl" htmlFor="bank_account_name">اسم صاحب الحساب</label>
              <input id="bank_account_name" className="x-input" value={bank.bank_account_name||""} onChange={e=>setBank(p=>({...p,bank_account_name:e.target.value}))} placeholder="مثال: محمد العتيبي"/>
            </div>
            <div style={{ gridColumn:"1 / -1" }}>
              <label className="lbl" htmlFor="bank_iban">رقم الآيبان (IBAN)</label>
              <input id="bank_iban" className="x-input x-mono" value={bank.bank_iban||""} onChange={e=>setBank(p=>({...p,bank_iban:e.target.value}))} placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr" style={{ textAlign:"left" }}/>
            </div>
          </div>
          <div><button className="btn bp" onClick={saveBank} disabled={saving}>{saving ? "جاري الحفظ..." : saved ? "تم الحفظ" : "حفظ بيانات الحساب"}</button></div>
        </div>
      </div>
    </div>
  );
}
