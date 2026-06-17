import { useState } from "react";
import { MaintenanceRequest } from "../lib/types";
import { B, T, SA, SD, SI, SL, W } from "../lib/colors";
import { MAINTENANCE_STATUS } from "../lib/constants";
import { formatDate, db } from "../lib/db";
import { Bdg, SectionTitle, DataTable } from "./ui";

interface ChaletStat {
  id:   number;
  name: string;
  mop:  number;
  mip:  number;
  mdn:  number;
  mtot: number;
}

interface Props {
  maintenance: MaintenanceRequest[];
  names:       string[];
  cStats:      ChaletStat[];
  mCost:       number;
  onAdd:       () => void;
  onEdit:      (m: MaintenanceRequest) => void;
  onReload:    () => void;
}

export default function MaintenanceTab({ maintenance, names, cStats, mCost, onAdd, onEdit, onReload }: Props) {
  const [fch, setFch] = useState("الكل");
  const MS = MAINTENANCE_STATUS;

  const rows = maintenance
    .filter(m => fch === "الكل" || m.chalet === fch)
    .sort((a, b) => {
      const p: Record<string,number> = { عالي:0, متوسط:1, منخفض:2 };
      const s: Record<string,number> = { open:0, in_progress:1, done:2 };
      return (p[a.priority]??1)-(p[b.priority]??1) || (s[a.status]??1)-(s[b.status]??1);
    });

  return (
    <div>
      {/* إحصاء سريع */}
      <div className="sg" style={{ marginBottom:18 }}>
        {[
          { l:"مفتوح",           cnt:maintenance.filter(m=>m.status==="open").length,        bg:"#F5E6E6", c:"#8B3A3A", i:"🔴" },
          { l:"قيد التنفيذ",     cnt:maintenance.filter(m=>m.status==="in_progress").length, bg:"#F5EFD6", c:"#8B6914", i:"🟡" },
          { l:"منتهي",           cnt:maintenance.filter(m=>m.status==="done").length,         bg:"#EEF0E9", c:SD,        i:"🟢" },
          { l:"إجمالي التكاليف", cnt:mCost.toLocaleString()+" ر",                             bg:SL,        c:B,         i:"💰" },
        ].map((s, i) => (
          <div key={i} style={{ background:s.bg, borderRadius:10, padding:"12px 14px", border:"1px solid rgba(197,172,136,.2)" }}>
            <div style={{ fontSize:16 }}>{s.i}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.cnt}</div>
            <div style={{ fontSize:11, color:s.c, opacity:.8 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <SectionTitle title="طلبات الصيانة"/>
        <div style={{ display:"flex", gap:8 }}>
          <select className="inp" style={{ width:"auto" }} value={fch} onChange={e => setFch(e.target.value)}>
            <option value="الكل">الكل</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn bp" onClick={onAdd}>+ طلب صيانة</button>
        </div>
      </div>

      {/* بطاقات الشاليهات */}
      <div className="mg" style={{ marginBottom:16 }}>
        {cStats.map(c => (
          <div key={c.id} style={{ background:W, borderRadius:10, padding:12, boxShadow:"0 2px 8px rgba(65,53,35,.07)", borderRight:"4px solid "+(c.mop>0?"#8B3A3A":SA) }}>
            <div style={{ fontWeight:700, color:B, marginBottom:7, fontSize:13 }}>{"🏠 "+c.name}</div>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
              <Bdg bg="#F5E6E6" color="#8B3A3A">{c.mop+" مفتوح"}</Bdg>
              <Bdg bg="#F5EFD6" color="#8B6914">{c.mip+" جاري"}</Bdg>
              <Bdg bg="#EEF0E9" color={SD}>{c.mdn+" منتهي"}</Bdg>
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ overflow:"hidden" }}>
        <DataTable
          heads={["الشاليه","المشكلة","مقدم الطلب","التاريخ","الأولوية","الحالة","التكلفة","صورة","إجراءات"]}
          rows={rows.map(m => (
            <tr key={m.id}>
              <td style={{ fontWeight:600 }}>{m.chalet}</td>
              <td>{m.issue}</td>
              <td style={{ fontSize:12, color:T }}>{m.req||"-"}</td>
              <td>{formatDate(m.maint_date)}</td>
              <td>
                <Bdg
                  bg={m.priority==="عالي"?"#F5E6E6":m.priority==="متوسط"?"#F5EFD6":"#EEF0E9"}
                  color={m.priority==="عالي"?"#8B3A3A":m.priority==="متوسط"?"#8B6914":SD}>
                  {m.priority}
                </Bdg>
              </td>
              <td><Bdg bg={MS[m.status]?.bg||"#eee"} color={MS[m.status]?.color||"#333"}>{MS[m.status]?.label||m.status}</Bdg></td>
              <td style={{ fontWeight:700, color:m.cost?T:SI }}>{m.cost?Number(m.cost).toLocaleString()+" ر":"-"}</td>
              <td>
                {m.image
                  ? <img src={m.image} alt="صورة" onClick={() => window.open(m.image!,"_blank")} style={{ width:40, height:40, objectFit:"cover", borderRadius:6, cursor:"pointer", border:"1px solid rgba(197,172,136,.3)" }}/>
                  : <span style={{ color:SI, fontSize:12 }}>-</span>}
              </td>
              <td>
                <div style={{ display:"flex", gap:4 }}>
                  <button className="btn be bsm" onClick={() => onEdit(m)}>تعديل</button>
                  <button className="btn bd bsm" onClick={async () => { if (window.confirm("حذف طلب الصيانة؟")) { await db("maintenance","DELETE",null,m.id); onReload(); } }}>حذف</button>
                </div>
              </td>
            </tr>
          ))}
        />
      </div>
    </div>
  );
}
