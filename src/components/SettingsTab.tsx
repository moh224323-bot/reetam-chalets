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

export default function SettingsTab({ users, onAdd, onEdit, onReload }: Props) {
  return (
    <div>
      <SectionTitle title="⚙️ الإعدادات"/>
      <div className="card" style={{ overflow:"hidden", marginBottom:20 }}>
        <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", background:SL, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontWeight:700, color:B, fontSize:14 }}>👥 إدارة المستخدمين</span>
          <button className="btn bp" onClick={onAdd}>+ إضافة مستخدم</button>
        </div>
        <DataTable
          heads={["الاسم","اسم المستخدم","البريد","الصلاحية","الشاليه","إجراءات"]}
          rows={users.map(u => (
            <tr key={u.id}>
              <td style={{ fontWeight:600 }}>{u.name}</td>
              <td style={{ color:T }}>{u.username||"—"}</td>
              <td style={{ color:T, fontSize:12 }}>{u.email||"—"}</td>
              <td>
                <Bdg
                  bg={u.role==="admin"?"#2C2419":u.role==="chalet_manager"?"#F5EFD6":"#E8F0F0"}
                  color={u.role==="admin"?"#C5AC88":u.role==="chalet_manager"?"#8B6914":"#576D6F"}>
                  {u.role==="admin"?"أدمن":u.role==="chalet_manager"?"مدير شاليه":"موظف"}
                </Bdg>
              </td>
              <td style={{ color:T, fontSize:12 }}>{u.chalet||"كل الشاليهات"}</td>
              <td>
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
          ))}
        />
      </div>
    </div>
  );
}
