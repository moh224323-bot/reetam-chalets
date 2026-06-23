import { AppUser } from "../lib/types";
import { B, T, SL } from "../lib/colors";
import { db } from "../lib/db";
import { Bdg, SectionTitle, DataTable } from "./ui";

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
  return (
    <div>
      <SectionTitle title="⚙️ الإعدادات"/>

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
