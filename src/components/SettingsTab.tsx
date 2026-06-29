import { useState, useEffect } from "react";
import { AppUser } from "../lib/types";
import { B, T, SL } from "../lib/colors";
import { db } from "../lib/db";
import { Bdg, SectionTitle, DataTable } from "./ui";

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

const ROLE_INFO = {
  admin:           { label:"أدمن",        bg:"#2C2419", color:"#C5AC88", desc:"يرى كل شيء ويتحكم بالكامل" },
  staff:           { label:"موظف",        bg:"#E8F0F0", color:"#576D6F", desc:"الحجوزات والشاليهات والصيانة" },
  chalet_manager:  { label:"مدير شاليه", bg:"#F5EFD6", color:"#8B6914", desc:"يرى شاليهه فقط — حجوزات وصيانة وولاء" },
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
    <div>
      <SectionTitle title="⚙️ الإعدادات"/>

      {/* الحساب البنكي للتحويل */}
      <div className="card" style={{ padding:24, marginBottom:20 }}>
        <div style={{ fontWeight:800, color:B, fontSize:15, marginBottom:6 }}>🏦 الحساب البنكي</div>
        <div style={{ fontSize:12, color:T, marginBottom:18 }}>تظهر هذي البيانات للزبون عند اختياره الدفع بالتحويل البنكي في صفحة حجز الشاليه</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginBottom:20 }}>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:B, display:"block", marginBottom:6 }}>اسم البنك</label>
            <input value={bank.bank_name||""} onChange={e=>setBank(p=>({...p,bank_name:e.target.value}))} placeholder="مثال: البنك الأهلي"
              style={{ width:"100%", border:"1.5px solid rgba(197,172,136,.4)", borderRadius:10, padding:"10px 14px", fontSize:14, fontFamily:"'Tajawal',sans-serif", color:B, background:"#FAFAF8", boxSizing:"border-box" }}/>
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:B, display:"block", marginBottom:6 }}>اسم صاحب الحساب</label>
            <input value={bank.bank_account_name||""} onChange={e=>setBank(p=>({...p,bank_account_name:e.target.value}))} placeholder="مثال: محمد العتيبي"
              style={{ width:"100%", border:"1.5px solid rgba(197,172,136,.4)", borderRadius:10, padding:"10px 14px", fontSize:14, fontFamily:"'Tajawal',sans-serif", color:B, background:"#FAFAF8", boxSizing:"border-box" }}/>
          </div>
          <div>
            <label style={{ fontSize:13, fontWeight:600, color:B, display:"block", marginBottom:6 }}>رقم الآيبان (IBAN)</label>
            <input value={bank.bank_iban||""} onChange={e=>setBank(p=>({...p,bank_iban:e.target.value}))} placeholder="SA00 0000 0000 0000 0000 0000" dir="ltr"
              style={{ width:"100%", border:"1.5px solid rgba(197,172,136,.4)", borderRadius:10, padding:"10px 14px", fontSize:14, fontFamily:"monospace", color:B, background:"#FAFAF8", boxSizing:"border-box" }}/>
          </div>
        </div>
        <button onClick={saveBank} disabled={saving}
          style={{ background: saved?"#52B788":"linear-gradient(135deg,#413523,#2A2218)", color:"#C5AC88", border:"none", borderRadius:12, padding:"12px 28px", fontFamily:"'Tajawal',sans-serif", fontWeight:700, fontSize:15, cursor:saving?"not-allowed":"pointer" }}>
          {saving ? "جاري الحفظ..." : saved ? "✓ تم الحفظ!" : "حفظ بيانات الحساب"}
        </button>
      </div>

      {/* شرح الصلاحيات */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:12, marginBottom:20 }}>
        {Object.entries(ROLE_INFO).map(([key, r]) => (
          <div key={key} style={{ background:"var(--card,#fff)", borderRadius:12, padding:"14px 16px", border:"1px solid rgba(197,172,136,.2)" }}>
            <Bdg bg={r.bg} color={r.color}>{r.label}</Bdg>
            <div style={{ fontSize:12, color:T, marginTop:8, lineHeight:1.6 }}>{r.desc}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", background:SL, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:700, color:B, fontSize:14 }}>👥 إدارة المستخدمين</span>
          <button className="btn bp" onClick={onAdd}>+ إضافة مستخدم</button>
        </div>
        <DataTable
          heads={["الاسم","اسم المستخدم","الصلاحية","الشاليه","إجراءات"]}
          rows={users.map(u => {
            const ri = ROLE_INFO[u.role] || ROLE_INFO.staff;
            return (
              <tr key={u.id}>
                <td data-label="الاسم" style={{ fontWeight:700 }}>
                  <div>{u.name}</div>
                  {u.email && <div style={{ fontSize:11, color:T, marginTop:2 }}>{u.email}</div>}
                </td>
                <td data-label="اسم المستخدم" style={{ color:T, fontFamily:"monospace", fontSize:13 }}>{u.username||"—"}</td>
                <td data-label="الصلاحية"><Bdg bg={ri.bg} color={ri.color}>{ri.label}</Bdg></td>
                <td data-label="الشاليه">
                  {u.chalet
                    ? <span style={{ fontWeight:700, color:B }}>{u.chalet}</span>
                    : <span style={{ color:T, fontSize:12 }}>كل الشاليهات</span>
                  }
                </td>
                <td data-label="">
                  <div style={{ display:"flex", gap:4 }}>
                    <button className="btn be bsm" onClick={() => onEdit(u)}>تعديل</button>
                    {u.role !== "admin" && (
                      <button className="btn bd bsm" onClick={async () => {
                        if (!window.confirm("حذف "+u.name+"؟")) return;
                        await db("users","DELETE",null,u.id);
                        onReload();
                      }}>حذف</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        />
      </div>
    </div>
  );
}
