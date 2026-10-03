import { memo, useState } from "react";
import { Chalet, Room, FixedExpense, Expense } from "../lib/types";
import { B, BD, S, SI, T, SL, SD } from "../lib/colors";
import { Bdg } from "./ui";
import { nextDueInfo } from "../lib/dueDate";

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
  cStats:        ChaletStat[];
  rooms:         Room[];
  loading:       boolean;
  fixedExpenses: FixedExpense[];
  expenses:      Expense[];
  onAdd:         () => void;
  onEdit:        (c: ChaletStat) => void;
  onDelete:      (id: number) => void;
  onGoal:        (c: { id: number; name: string; goal: number | string }) => void;
  onQr:          (chalet: string, rooms: string[]) => void;
  onImgChange:   (id: number, dataUrl: string) => void;
  onAddRent:     (chalet: string) => void;
  onEditRent:    (fx: FixedExpense) => void;
  onPayRent:     (fx: FixedExpense) => Promise<void>;
}

function chaletNeedsAttention(c: ChaletStat, fixedExpenses: FixedExpense[], expenses: Expense[]): boolean {
  if (c.mop > 0) return true;
  return fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => nextDueInfo(fx, expenses))
    .some(info => info && info.daysUntil <= 5);
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

/** بطاقة مختصرة في شبكة الشاليهات — فقط الأرقام المهمة وإشارات الانتباه، والتفاصيل الكاملة في صفحة الإدارة. */
const ChaletSummaryCard = memo(function ChaletSummaryCard({ c, fixedExpenses, expenses, onOpen }: {
  c: ChaletStat; fixedExpenses: FixedExpense[]; expenses: Expense[];
  onOpen: (name: string) => void;
}) {
  const netMonth = c.monthRev - c.monthExp;
  const rentWarn = fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => nextDueInfo(fx, expenses))
    .some(info => info && info.daysUntil <= 5);

  const chips = [
    { l:"السعة",        v: c.cap + " شخص", i:"👥" },
    { l:"سعر الليلة",   v: c.price + " ر",  i:"🌙" },
    { l:"صافي الشهر",   v: netMonth.toLocaleString() + " ر", i:"💰", color: netMonth >= 0 ? SD : "#8B3A3A" },
  ];

  return (
    <div className="cc" onClick={() => onOpen(c.name)} style={{ cursor:"pointer" }}>
      <div style={{ position:"relative", height:140, overflow:"hidden", background:`linear-gradient(135deg,${B},${BD})` }}>
        {c.img
          ? <img src={c.img} alt={c.name} style={{ width:"100%", height:"100%", objectFit:"cover" }} loading="lazy"/>
          : <div style={{ width:"100%", height:"100%", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:36, opacity:.25 }}>🏠</span>
            </div>
        }
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,rgba(42,34,24,.9))", padding:"16px 14px 10px" }}>
          <div style={{ color:S, fontWeight:800, fontSize:15 }}>{c.name}</div>
          <div style={{ color:SI, fontSize:11, marginTop:2 }}>{"📍 " + c.loc}</div>
        </div>
        <div style={{ position:"absolute", top:8, left:8 }}>
          <Bdg bg={c.st==="active" ? "rgba(141,149,119,.85)" : "rgba(139,58,58,.85)"} color="#fff">
            {c.st==="active" ? "نشط" : "موقف"}
          </Bdg>
        </div>
      </div>

      <div style={{ padding:"12px 14px 14px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom: (c.mop > 0 || rentWarn) ? 10 : 12 }}>
          {chips.map((item, i) => (
            <div key={i} style={{ background:SL, borderRadius:8, padding:"7px 9px", border:"1px solid rgba(197,172,136,.2)" }}>
              <div style={{ fontSize:10, color:T }}>{item.i + " " + item.l}</div>
              <div style={{ fontWeight:700, color:item.color||B, fontSize:12, marginTop:2 }}>{item.v}</div>
            </div>
          ))}
        </div>

        {(c.mop > 0 || rentWarn) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
            {c.mop > 0 && (
              <span style={{ fontSize:10.5, fontWeight:700, color:"#8B3A3A", background:"#F5E6E6", borderRadius:7, padding:"4px 9px" }}>
                🔧 {c.mop} صيانة مفتوحة
              </span>
            )}
            {rentWarn && (
              <span style={{ fontSize:10.5, fontWeight:700, color:"#8B6914", background:"#F5EFD6", borderRadius:7, padding:"4px 9px" }}>
                🏠 الإيجار يحتاج متابعة
              </span>
            )}
          </div>
        )}

        <button onClick={e => { e.stopPropagation(); onOpen(c.name); }} className="btn bp" style={{ width:"100%", padding:"9px", fontSize:13 }}>
          إدارة الشاليه ←
        </button>
      </div>
    </div>
  );
});

/** صفحة إدارة شاليه واحد — كل التفاصيل والإعدادات والأدوات المتعلقة به. */
const ChaletDetail = memo(function ChaletDetail({ c, rooms, fixedExpenses, expenses, onBack, onEdit, onDelete, onGoal, onQr, onImgChange, onAddRent, onEditRent, onPayRent }: {
  c: ChaletStat; rooms: Room[]; fixedExpenses: FixedExpense[]; expenses: Expense[];
  onBack: () => void;
  onEdit: Props["onEdit"]; onDelete: Props["onDelete"];
  onGoal: Props["onGoal"]; onQr: Props["onQr"];
  onImgChange: Props["onImgChange"];
  onAddRent: Props["onAddRent"]; onEditRent: Props["onEditRent"]; onPayRent: Props["onPayRent"];
}) {
  const netMonth = c.monthRev - c.monthExp;
  const pct      = c.goal > 0 ? Math.min(Math.round(netMonth / c.goal * 100), 100) : 0;
  const goalColor = pct >= 100 ? "#4CAF50" : pct >= 60 ? "#B8A06A" : "#C97B63";

  const rentItems = fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => ({ fx, info: nextDueInfo(fx, expenses) }));

  // بيانات ثابتة عن الشاليه (سعة وأسعار) منفصلة عن الأداء المالي المتغيّر — تجميع أوضح من قائمة واحدة مختلطة.
  const baseStats: { l: string; v: string; i: string; color?: string }[] = [
    { l:"السعة",           v: c.cap + " شخص",                  i:"👥" },
    { l:"سعر عادي",        v: c.price + " ريال",                i:"🌙" },
    { l:"سعر ويكند",       v: c.wprice ? c.wprice+" ريال" : "-", i:"🎉" },
  ];
  const financeStats: { l: string; v: string; i: string; color?: string }[] = [
    { l:"صافي الشهر",      v: netMonth.toLocaleString() + " ر", i: netMonth>=0?"✅":"⚠️", color: netMonth>=0?SD:"#8B3A3A" },
    { l:"إيرادات النظام",  v: c.rev.toLocaleString() + " ر",   i:"📈" },
    // "إجمالي الإيرادات" يُعرض فقط لو يختلف فعلاً عن إيرادات النظام (أي فيه إيراد سابق مسجّل)، تجنباً لتكرار نفس الرقم بلا فائدة.
    ...(c.totalRev !== c.rev ? [{ l:"إجمالي الإيرادات", v: c.totalRev.toLocaleString()+" ر", i:"💰" }] : []),
    { l:"التأمين",         v: c.ins.toLocaleString() + " ر",   i:"🛡️" },
  ];

  return (
    <div className="cc" style={{ maxWidth:520, margin:"0 auto" }}>
      <button onClick={onBack} style={{
        display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer",
        color:T, fontSize:13, fontWeight:700, padding:"12px 14px 0", fontFamily:"'Tajawal',sans-serif",
      }}>→ رجوع لكل الشاليهات</button>

      {/* صورة الغلاف */}
      <div style={{ position:"relative", height:170, overflow:"hidden", background:`linear-gradient(135deg,${B},${BD})`, marginTop:10 }}>
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

        <div style={{ fontSize:11, fontWeight:700, color:T, marginBottom:6 }}>📋 بيانات الشاليه</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom:14 }}>
          {baseStats.map((item, i) => (
            <div key={i} style={{ background:SL, borderRadius:8, padding:"7px 9px", border:"1px solid rgba(197,172,136,.2)" }}>
              <div style={{ fontSize:10, color:T }}>{item.i + " " + item.l}</div>
              <div style={{ fontWeight:700, color:item.color||B, fontSize:12, marginTop:2 }}>{item.v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize:11, fontWeight:700, color:T, marginBottom:6 }}>📊 الأداء المالي</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:7, marginBottom:14 }}>
          {financeStats.map((item, i) => (
            <div key={i} style={{ background:SL, borderRadius:8, padding:"7px 9px", border:"1px solid rgba(197,172,136,.2)" }}>
              <div style={{ fontSize:10, color:T }}>{item.i + " " + item.l}</div>
              <div style={{ fontWeight:700, color:item.color||B, fontSize:12, marginTop:2 }}>{item.v}</div>
            </div>
          ))}
        </div>

        {/* حالة الصيانة */}
        <div style={{ fontSize:11, fontWeight:700, color:T, marginBottom:6 }}>🔧 الصيانة</div>
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

        {/* الإيجار - تاريخ الاستحقاق والتذكير */}
        <div style={{ marginBottom:12, background:SL, borderRadius:10, padding:"10px 12px", border:"1px solid rgba(197,172,136,.2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: rentItems.length ? 8 : 0 }}>
            <span style={{ fontSize:11, fontWeight:700, color:B }}>🏠 الإيجار</span>
            <button onClick={() => onAddRent(c.name)} style={{
              background:"none", border:"none", color:T, fontSize:11, fontWeight:700, cursor:"pointer", padding:0,
            }}>+ إضافة</button>
          </div>
          {rentItems.length === 0 && (
            <div style={{ fontSize:10.5, color:T }}>لا يوجد إيجار مسجّل لهذا الشاليه</div>
          )}
          {rentItems.map(({ fx, info }) => {
            const overdue  = info ? info.daysUntil < 0  : false;
            const dueToday = info ? info.daysUntil === 0 : false;
            const soon     = info ? info.daysUntil > 0 && info.daysUntil <= 5 : false;
            const urgent   = overdue || dueToday || soon;
            const badgeColor = !info ? SI : overdue ? "#8B3A3A" : dueToday || soon ? "#8B6914" : SD;
            const badgeBg    = !info ? "rgba(197,172,136,.15)" : overdue ? "#F5E6E6" : dueToday || soon ? "#F5EFD6" : "#EEF0E9";
            const badgeText  = !info
              ? "حدّد يوم الاستحقاق"
              : overdue  ? `متأخر ${Math.abs(info.daysUntil)} يوم`
              : dueToday ? "يستحق اليوم"
              : `باقي ${info.daysUntil} يوم`;
            return (
              <div key={fx.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 0", borderTop:"1px solid rgba(197,172,136,.15)" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11.5, fontWeight:700, color:B, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                    {fx.name + " · " + Number(fx.amount).toLocaleString() + " ر"}
                  </div>
                  <div style={{ display:"inline-block", marginTop:3, fontSize:10, fontWeight:700, color:badgeColor, background:badgeBg, borderRadius:6, padding:"2px 7px" }}>
                    {badgeText}
                  </div>
                </div>
                <button onClick={() => onEditRent(fx)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, flexShrink:0 }}>✏️</button>
                <button onClick={() => onPayRent(fx)} style={{
                  background: urgent ? B : "transparent", color: urgent ? S : T,
                  border: urgent ? "none" : "1px solid rgba(197,172,136,.4)",
                  borderRadius:7, padding:"5px 10px",
                  fontSize:10.5, fontWeight:700, cursor:"pointer", fontFamily:"'Tajawal',sans-serif", flexShrink:0,
                }}>تسديد</button>
              </div>
            );
          })}
        </div>

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
            onClick={() => { onDelete(c.id); onBack(); }}>
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

export default function ChaletsTab({ cStats, rooms, loading, fixedExpenses, expenses, onAdd, onEdit, onDelete, onGoal, onQr, onImgChange, onAddRent, onEditRent, onPayRent }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

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

  const openChalet = selected ? cStats.find(c => c.name === selected) : undefined;
  if (selected && openChalet) {
    return (
      <ChaletDetail
        c={openChalet}
        rooms={rooms}
        fixedExpenses={fixedExpenses}
        expenses={expenses}
        onBack={() => setSelected(null)}
        onEdit={onEdit}
        onDelete={onDelete}
        onGoal={onGoal}
        onQr={onQr}
        onImgChange={onImgChange}
        onAddRent={onAddRent}
        onEditRent={onEditRent}
        onPayRent={onPayRent}
      />
    );
  }

  const activeCount    = cStats.filter(c => c.st==="active").length;
  const totalNetMonth  = cStats.reduce((s,c) => s + (c.monthRev-c.monthExp), 0);
  const attentionList  = cStats.map(c => chaletNeedsAttention(c, fixedExpenses, expenses));
  const attentionCount = attentionList.filter(Boolean).length;
  // الشاليهات اللي تحتاج متابعة تطلع أول — أهم شي يشوفه المدير أول ما يفتح الصفحة.
  const sortedStats = cStats
    .map((c,i) => ({ c, attn: attentionList[i] }))
    .sort((a,b) => Number(b.attn) - Number(a.attn))
    .map(x => x.c);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontWeight:800, color:B, fontSize:18 }}>إدارة الشاليهات</div>
        <button className="btn bp" onClick={onAdd}>+ إضافة شاليه</button>
      </div>

      {cStats.length > 0 && (
        <div className="card" style={{ padding:"14px 16px", marginBottom:18, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14 }}>
          {[
            { i:"🏠", l:"الشاليهات النشطة",   v:`${activeCount} من ${cStats.length}` },
            { i:"💰", l:"صافي الشهر (الإجمالي)", v: totalNetMonth.toLocaleString()+" ر", color: totalNetMonth>=0?SD:"#8B3A3A" },
            { i: attentionCount>0?"🔔":"✅", l:"يحتاج متابعة", v: attentionCount>0?`${attentionCount} شاليه`:"لا شيء، تمام", color: attentionCount>0?"#8B3A3A":SD },
          ].map((x,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>{x.i}</span>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10.5, color:T }}>{x.l}</div>
                <div style={{ fontSize:15, fontWeight:800, color:x.color||B }}>{x.v}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="cg">
        {sortedStats.map(c => (
          <ChaletSummaryCard
            key={c.id}
            c={c}
            fixedExpenses={fixedExpenses}
            expenses={expenses}
            onOpen={setSelected}
          />
        ))}
      </div>
    </div>
  );
}
