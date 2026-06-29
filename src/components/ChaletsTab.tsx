import { memo } from "react";
import { Chalet, Room } from "../lib/types";
import { B, BD, S, SI, T, SL, SD } from "../lib/colors";
import { Bdg } from "./ui";

export interface ChaletStat extends Chalet {
  rev: number;
  totalRev: number;
  monthRev: number;
  monthExp: number;
  mtot: number;
  mop: number;
  mip: number;
  mdn: number;
  ins: number;
  goal: number;
}

interface Props {
  cStats:     ChaletStat[];
  rooms:      Room[];
  loading:    boolean;
  onAdd:      () => void;
  onEdit:     (c: ChaletStat) => void;
  onDelete:   (id: number) => void;
  onGoal:     (c: { id: number; name: string; goal: number | string }) => void;
  onQr:       (chalet: string, rooms: string[]) => void;
  onImgChange:(id: number, dataUrl: string) => void;
}

function compressImage(file: File, maxPx = 600): Promise<string> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = ev.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const ChaletCard = memo(function ChaletCard({ c, rooms, onEdit, onDelete, onGoal, onQr, onImgChange }: {
  c: ChaletStat; rooms: Room[];
  onEdit: Props["onEdit"]; onDelete: Props["onDelete"];
  onGoal: Props["onGoal"]; onQr: Props["onQr"];
  onImgChange: Props["onImgChange"];
}) {
  const netMonth = c.monthRev - c.monthExp;
  const pct      = c.goal > 0 ? Math.min(Math.round(netMonth / c.goal * 100), 100) : 0;
  const goalColor = pct >= 100 ? "#4CAF50" : pct >= 60 ? "#B8A06A" : "#C97B63";

  const stats = [
    { l:"السعة",           v: c.cap + " شخص",                  i:"👥" },
    { l:"سعر عادي",        v: c.price + " ريال",                i:"🌙" },
    { l:"سعر ويكند",       v: c.wprice ? c.wprice+" ريال" : "-", i:"🎉" },
    { l:"إيرادات النظام",  v: c.rev.toLocaleString() + " ر",   i:"📈" },
    { l:"إجمالي الإيرادات",v: c.totalRev.toLocaleString()+" ر", i:"💰" },
    { l:"التأمين",         v: c.ins.toLocaleString() + " ر",   i:"🛡️" },
  ];

  return (
    <div className="cc">
      {/* صورة الغلاف */}
      <div style={{ position:"relative", height:170, overflow:"hidden", background:`linear-gradient(135deg,${B},${BD})` }}>
        {c.img
          ? <img src={c.img} alt={c.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} loading="lazy"/>
          : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:40, opacity:.25 }}>🏠</span>
            </div>
        }
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,rgba(42,34,24,.9))", padding:"18px 14px 10px" }}>
          <div style={{ color:S, fontWeight:800, fontSize:15 }}>{c.name}</div>
          <div style={{ color:SI, fontSize:11, marginTop:2 }}>
            {"📍 " + c.loc + (c.open_date ? " · افتتح: " + c.open_date.slice(0,7) : "")}
          </div>
        </div>
        <div style={{ position:"absolute", top:8, left:8 }}>
          <Bdg bg={c.st==="active" ? "rgba(141,149,119,.85)" : "rgba(139,58,58,.85)"} color="#fff">
            {c.st==="active" ? "نشط" : "موقف"}
          </Bdg>
        </div>
        <label style={{ position:"absolute", top:8, right:8, background:"rgba(42,34,24,.7)", borderRadius:7, padding:"4px 8px", cursor:"pointer", color:S, fontSize:11, fontWeight:600 }}>
          📷 تغيير
          <input type="file" accept="image/*" style={{ display:"none" }} onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            const compressed = await compressImage(file);
            onImgChange(c.id, compressed);
          }}/>
        </label>
      </div>

      {/* تفاصيل */}
      <div style={{ padding:"14px 16px" }}>
        {c.description && <p style={{ color:T, fontSize:12, marginBottom:12 }}>{c.description}</p>}

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom:12 }}>
          {stats.map((item, i) => (
            <div key={i} style={{ background:SL, borderRadius:8, padding:"7px 9px", border:"1px solid rgba(197,172,136,.2)" }}>
              <div style={{ fontSize:10, color:T }}>{item.i + " " + item.l}</div>
              <div style={{ fontWeight:700, color:B, fontSize:12, marginTop:2 }}>{item.v}</div>
            </div>
          ))}
        </div>

        {/* حالة الصيانة */}
        <div style={{ display:"flex", gap:5, marginBottom:12 }}>
          {[
            { l:"مفتوح",  c:"#8B3A3A", bg:"#F5E6E6", v:c.mop },
            { l:"جاري",   c:"#8B6914", bg:"#F5EFD6", v:c.mip },
            { l:"منتهي",  c:SD,        bg:"#EEF0E9", v:c.mdn },
          ].map((x, i) => (
            <div key={i} style={{ flex:1, textAlign:"center", background:x.bg, borderRadius:7, padding:"6px 0" }}>
              <div style={{ fontSize:18, fontWeight:800, color:x.c }}>{x.v}</div>
              <div style={{ fontSize:10, color:x.c }}>{x.l}</div>
            </div>
          ))}
        </div>

        {/* هدف الشهر */}
        {c.goal > 0 && (
          <div style={{ marginBottom:12, background:SL, borderRadius:10, padding:"10px 12px", border:"1px solid rgba(197,172,136,.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <span style={{ fontSize:11, fontWeight:700, color:B }}>🎯 هدف الشهر</span>
              <span style={{ fontSize:11, fontWeight:800, color:goalColor }}>{pct + "%"}</span>
            </div>
            <div style={{ background:"rgba(197,172,136,.2)", borderRadius:99, height:8, overflow:"hidden", marginBottom:5 }}>
              <div style={{ width:pct+"%", height:"100%", background:goalColor, borderRadius:99, transition:"width .4s" }}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:T }}>
              <span>{"صافي: " + netMonth.toLocaleString() + " ر"}</span>
              <span>{"هدف: " + c.goal.toLocaleString() + " ر"}</span>
            </div>
          </div>
        )}

        {/* أزرار */}
        <div style={{ display:"flex", gap:7, marginBottom:7 }}>
          <button className="btn be" style={{ flex:1, padding:"8px", fontSize:13 }}
            onClick={() => onEdit({ ...c, open_date: c.open_date?.slice(0,7) ?? "" } as ChaletStat)}>
            ✏️ تعديل
          </button>
          <button className="btn bp bsm" style={{ padding:"8px 12px", fontSize:12 }}
            onClick={() => onGoal({ id:c.id, name:c.name, goal:c.goal||"" })}>
            🎯
          </button>
          <button className="btn bd bsm" style={{ padding:"8px 12px" }}
            onClick={() => onDelete(c.id)}>
            🗑️
          </button>
        </div>

        <button onClick={() => {
          const chRooms = rooms.filter(r => r.chalet === c.name).map(r => r.name);
          onQr(c.name, chRooms.length ? chRooms : ["غرفة 1","غرفة 2","غرفة 3"]);
        }} style={{
          width:"100%", background:"#4C1D95", color:"#fff", border:"none",
          borderRadius:10, padding:"9px", fontSize:13, fontWeight:700,
          cursor:"pointer", fontFamily:"'Tajawal',sans-serif", marginBottom:7,
        }}>📱 باركودات الغرف</button>

        <div style={{ display:"flex", gap:7 }}>
          <button onClick={async () => {
            const link = `${typeof window!=="undefined"?window.location.origin:""}?guest=1&m=chalet&ch=${encodeURIComponent(c.name)}`;
            await navigator.clipboard.writeText(link);
            alert("تم نسخ رابط الشاليه ✅\n" + link);
          }} style={{
            flex:1, background:"rgba(197,172,136,.15)", color:B, border:"1px solid rgba(197,172,136,.3)",
            borderRadius:10, padding:"9px", fontSize:13, fontWeight:700,
            cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
          }}>🔗 رابط الزبون</button>
          <button onClick={() => {
            const link = `${typeof window!=="undefined"?window.location.origin:""}?guest=1&m=chalet&ch=${encodeURIComponent(c.name)}`;
            const msg = `شاليه ${c.name} 🏡%0aشوف الصور والمميزات واحجز مباشرة:%0a${encodeURIComponent(link)}`;
            window.open(`https://wa.me/?text=${msg}`,"_blank");
          }} style={{
            flex:1, background:"#25D366", color:"#fff", border:"none",
            borderRadius:10, padding:"9px", fontSize:13, fontWeight:700,
            cursor:"pointer", fontFamily:"'Tajawal',sans-serif",
          }}>📲 مشاركة</button>
        </div>
      </div>
    </div>
  );
});

export default function ChaletsTab({ cStats, rooms, loading, onAdd, onEdit, onDelete, onGoal, onQr, onImgChange }: Props) {
  if (loading && cStats.length === 0) {
    return (
      <div className="cg">
        {[1,2,3].map(i => (
          <div key={i} className="cc">
            <div className="skeleton" style={{ height:170, borderRadius:"12px 12px 0 0" }}/>
            <div style={{ padding:16 }}>
              {[80,60,40].map((w,j) => <div key={j} className="skeleton" style={{ height:13, width:w+"%", marginBottom:10 }}/>)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontWeight:800, color:B, fontSize:18 }}>إدارة الشاليهات</div>
        <button className="btn bp" onClick={onAdd}>+ إضافة شاليه</button>
      </div>
      <div className="cg">
        {cStats.map(c => (
          <ChaletCard
            key={c.id}
            c={c}
            rooms={rooms}
            onEdit={onEdit}
            onDelete={onDelete}
            onGoal={onGoal}
            onQr={onQr}
            onImgChange={onImgChange}
          />
        ))}
      </div>
    </div>
  );
}
