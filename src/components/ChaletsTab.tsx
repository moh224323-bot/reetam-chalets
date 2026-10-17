import { memo, useState } from "react";
import { Chalet, Room, FixedExpense } from "../lib/types";
import { B, BD, S, SI, T, SL, SD } from "../lib/colors";
import { Bdg } from "./ui";
import { nextDueInfo, formatDueDate, RENT_REMINDER_DAYS } from "../lib/dueDate";

// أرقام سالبة داخل صفحة RTL تحتاج اتجاه LTR صريح، وإلا تنعكس إشارة السالب بصرياً (نفس نمط Money في FinancialTab).
function Money({ value, size, weight, color }: { value: number; size?: number; weight?: number; color?: string }) {
  return (
    <span dir="ltr" style={{ fontSize:size, fontWeight:weight, color, whiteSpace:"nowrap" }}>
      {value<0?"−":""}{Math.abs(value).toLocaleString()} <span style={{ fontSize:size?size*0.6:"0.5em", fontWeight:500, opacity:.7 }}>ر.س</span>
    </span>
  );
}

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
  onAdd:         () => void;
  onEdit:        (c: ChaletStat) => void;
  onDelete:      (id: number) => void;
  onGoal:        (c: { id: number; name: string; goal: number | string }) => void;
  onQr:          (chalet: string, rooms: string[]) => void;
  onImgChange:   (id: number, dataUrl: string) => void;
  onAddRent:     (chalet: string) => void;
  onEditRent:    (fx: FixedExpense) => void;
  onAcknowledgeRent: (fx: FixedExpense) => Promise<void>;
}

function chaletNeedsAttention(c: ChaletStat, fixedExpenses: FixedExpense[]): boolean {
  if (c.mop > 0) return true;
  return fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => nextDueInfo(fx))
    .some(info => info && info.daysUntil <= RENT_REMINDER_DAYS);
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
const ChaletSummaryCard = memo(function ChaletSummaryCard({ c, fixedExpenses, onOpen }: {
  c: ChaletStat; fixedExpenses: FixedExpense[];
  onOpen: (name: string) => void;
}) {
  const netMonth = c.monthRev - c.monthExp;
  const rentWarn = fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => nextDueInfo(fx))
    .some(info => info && info.daysUntil <= RENT_REMINDER_DAYS);

  const chips = [
    { l:"السعة",        v: c.cap + " شخص", i:"👥" },
    { l:"سعر الليلة",   v: c.price + " ر",  i:"🌙" },
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
        <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"linear-gradient(transparent,rgba(23,19,15,.9))", padding:"16px 14px 10px" }}>
          <div style={{ color:S, fontWeight:800, fontSize:15 }}>{c.name}</div>
          <div style={{ color:SI, fontSize:11, marginTop:2 }}>{"📍 " + c.loc}</div>
        </div>
        <div style={{ position:"absolute", top:8, left:8 }}>
          <Bdg bg={c.st==="active" ? "rgba(30,107,69,.85)" : "rgba(166,58,42,.85)"} color="#fff">
            {c.st==="active" ? "نشط" : "موقف"}
          </Bdg>
        </div>
      </div>

      <div style={{ padding:"12px 14px 14px" }}>
        {/* الرقم الأهم (صافي الشهر) بارز وحده فوق، بدل ما يكون مساوي بالحجم للسعة والسعر */}
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:10 }}>
          <span style={{ fontSize:11, color:T }}>💰 صافي الشهر</span>
          <Money value={netMonth} size={19} weight={900} color={netMonth >= 0 ? SD : "#A63A2A"}/>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom: (c.mop > 0 || rentWarn) ? 10 : 12 }}>
          {chips.map((item, i) => (
            <div key={i} style={{ background:SL, borderRadius:8, padding:"7px 9px", border:"1px solid rgba(201,163,106,.2)" }}>
              <div style={{ fontSize:10, color:T }}>{item.i + " " + item.l}</div>
              <div style={{ fontWeight:700, color:B, fontSize:12, marginTop:2 }}>{item.v}</div>
            </div>
          ))}
        </div>

        {(c.mop > 0 || rentWarn) && (
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
            {c.mop > 0 && (
              <span style={{ fontSize:10.5, fontWeight:700, color:"#A63A2A", background:"#FBEDEA", borderRadius:7, padding:"4px 9px" }}>
                🔧 {c.mop} صيانة مفتوحة
              </span>
            )}
            {rentWarn && (
              <span style={{ fontSize:10.5, fontWeight:700, color:"#7A5A0E", background:"#FBF3DF", borderRadius:7, padding:"4px 9px" }}>
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

// أيقونات خطية لصفحة الشاليه
const IC: Record<string, React.ReactNode> = {
  back:   <path d="M9 18l6-6-6-6"/>,
  pin:    <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></>,
  edit:   <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/>,
  share:  <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></>,
  link:   <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>,
  qr:     <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 20h4v-3"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  trash:  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>,
  users:  <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/></>,
  moon:   <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>,
  star:   <path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"/>,
  wrench: <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>,
  home:   <><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></>,
  plus:   <path d="M12 5v14M5 12h14"/>,
  check:  <path d="M5 12l5 5 9-10"/>,
  clock:  <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
};
function Ic({ n, s = 17 }: { n: string; s?: number }) {
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{IC[n]}</svg>;
}

/** صفحة إدارة شاليه واحد — كل التفاصيل والإعدادات والأدوات المتعلقة به. */
const ChaletDetail = memo(function ChaletDetail({ c, rooms, fixedExpenses, onBack, onEdit, onDelete, onGoal, onQr, onImgChange, onAddRent, onEditRent, onAcknowledgeRent }: {
  c: ChaletStat; rooms: Room[]; fixedExpenses: FixedExpense[];
  onBack: () => void;
  onEdit: Props["onEdit"]; onDelete: Props["onDelete"];
  onGoal: Props["onGoal"]; onQr: Props["onQr"];
  onImgChange: Props["onImgChange"];
  onAddRent: Props["onAddRent"]; onEditRent: Props["onEditRent"]; onAcknowledgeRent: Props["onAcknowledgeRent"];
}) {
  const netMonth = c.monthRev - c.monthExp;
  const pct      = c.goal > 0 ? Math.min(Math.round(netMonth / c.goal * 100), 100) : 0;
  const goalColor = pct >= 100 ? "var(--ok)" : pct >= 60 ? "var(--gold)" : "var(--bad)";
  const monthName = new Date().toLocaleDateString("ar-SA-u-ca-gregory", { month:"long" });

  const rentItems = fixedExpenses
    .filter(fx => fx.chalet === c.name && fx.active && fx.category === "إيجار")
    .map(fx => ({ fx, info: nextDueInfo(fx) }));

  const guestLink = () => `${typeof window!=="undefined"?window.location.origin:""}?guest=1&m=chalet&ch=${encodeURIComponent(c.name)}`;

  const baseStats = [
    { l:"السعة",     v: String(c.cap), u:"شخص",         i:"users" },
    { l:"سعر عادي",  v: String(c.price), u:"ريال / ليلة", i:"moon" },
    { l:"سعر ويكند", v: c.wprice ? String(c.wprice) : "-", u: c.wprice ? "ريال / ليلة" : "", i:"star" },
  ];

  return (
    <div className="cd">
      <button type="button" className="cd-back" onClick={onBack}><Ic n="back" s={16}/>رجوع لكل الشاليهات</button>

      {/* الترويسة: الاسم والحالة والموقع + كل الإجراءات في صف واحد */}
      <div className="cd-head">
        <div>
          <div className="cd-title-row">
            <h1 className="cd-title">{c.name}</h1>
            <span className={"cd-pill " + (c.st==="active" ? "ok" : "bad")}><span className="cd-dot"/>{c.st==="active" ? "نشط" : "موقف"}</span>
          </div>
          <div className="cd-loc">
            <Ic n="pin" s={16}/>{c.loc}{c.open_date ? " · افتتح: " + c.open_date.slice(0,7) : ""}
          </div>
        </div>
        <div className="cd-actions">
          <button type="button" className="btn bp" onClick={() => onEdit({ ...c, open_date: c.open_date?.slice(0,7) ?? "" } as ChaletStat)}>
            <Ic n="edit"/>تعديل الشاليه
          </button>
          <button type="button" className="btn bshare" onClick={() => {
            const msg = `شاليه ${c.name} 🏡%0aشوف الصور والمميزات واحجز مباشرة:%0a${encodeURIComponent(guestLink())}`;
            window.open(`https://wa.me/?text=${msg}`,"_blank");
          }}><Ic n="share"/>مشاركة</button>
          <button type="button" className="btn bo" onClick={async () => {
            const link = guestLink();
            await navigator.clipboard.writeText(link);
            alert("تم نسخ رابط الشاليه ✅\n" + link);
          }}><Ic n="link"/>رابط الزبون</button>
          <button type="button" className="btn bo" onClick={() => {
            const chRooms = rooms.filter(r => r.chalet === c.name).map(r => r.name);
            onQr(c.name, chRooms.length ? chRooms : ["غرفة 1","غرفة 2","غرفة 3"]);
          }}><Ic n="qr"/>باركودات الغرف</button>
          <button type="button" className="btn bo cd-icon-btn" aria-label="هدف الشهر" title="هدف الشهر"
            onClick={() => onGoal({ id:c.id, name:c.name, goal:c.goal||"" })}><Ic n="target" s={18}/></button>
          <button type="button" className="btn bd cd-icon-btn" aria-label="حذف الشاليه" title="حذف الشاليه"
            onClick={() => { onDelete(c.id); onBack(); }}><Ic n="trash" s={18}/></button>
        </div>
      </div>

      {/* الصورة + بيانات الشاليه */}
      <div className="cd-row">
        <div className="cd-photo">
          {c.img
            ? <img src={c.img} alt={c.name} loading="lazy"/>
            : <div className="cd-photo-empty"><Ic n="home" s={48}/></div>}
          <label className="cd-photo-change">
            <Ic n="camera" s={16}/>تغيير الصورة
            <input type="file" accept="image/*" style={{ display:"none" }} onChange={async e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const compressed = await compressImage(file);
              onImgChange(c.id, compressed);
            }}/>
          </label>
        </div>
        <div className="cd-panel cd-facts">
          <h2 className="cd-h2" style={{ fontSize:16, marginBottom:4 }}>بيانات الشاليه</h2>
          {baseStats.map((x, i) => (
            <div key={i} className="cd-fact">
              <span className="cd-fact-k"><Ic n={x.i} s={18}/>{x.l}</span>
              <span className="cd-fact-v">{x.v} {x.u && <span className="cd-unit">{x.u}</span>}</span>
            </div>
          ))}
          {c.description && <p className="cd-desc">{c.description}</p>}
        </div>
      </div>

      {/* الأداء المالي */}
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div className="cd-sec-head"><h2 className="cd-h2" style={{ fontSize:18 }}>الأداء المالي</h2><span>{monthName}</span></div>
        <div className="cd-kpis">
          <div className="cd-kpi">
            <span className="cd-kpi-k">صافي الشهر
              <span className={"cd-pill " + (netMonth >= 0 ? "ok" : "bad")}>{netMonth >= 0 ? "موجب" : "سالب"}</span>
            </span>
            <span className={"cd-kpi-v " + (netMonth >= 0 ? "cd-pos" : "cd-neg")}><Money value={netMonth}/></span>
          </div>
          <div className="cd-kpi">
            <span className="cd-kpi-k">إيرادات النظام</span>
            <span className="cd-kpi-v"><Money value={c.rev}/></span>
          </div>
          {/* "إجمالي الإيرادات" يُعرض فقط لو يختلف فعلاً عن إيرادات النظام (أي فيه إيراد سابق مسجّل). */}
          {c.totalRev !== c.rev && (
            <div className="cd-kpi">
              <span className="cd-kpi-k">إجمالي الإيرادات</span>
              <span className="cd-kpi-v"><Money value={c.totalRev}/></span>
            </div>
          )}
          <div className="cd-kpi">
            <span className="cd-kpi-k">التأمين</span>
            <span className="cd-kpi-v"><Money value={c.ins}/></span>
          </div>
        </div>

        {c.goal > 0 && (
          <div className="cd-panel" style={{ gap:12 }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
              <h2 className="cd-h2"><Ic n="target" s={18}/>هدف الشهر</h2>
              <span dir="ltr" style={{ fontSize:20, fontWeight:700, color:goalColor }}>{pct + "%"}</span>
            </div>
            <div className="cd-track" role="img" aria-label={"التقدم نحو الهدف " + pct + "%"}>
              <div className="cd-fill" style={{ width: Math.max(pct, 0) + "%", minWidth: 6, background:goalColor }}/>
            </div>
            <div className="cd-goal-foot">
              <span>الصافي: <strong className={netMonth < 0 ? "cd-neg" : ""}><Money value={netMonth}/></strong></span>
              <span>الهدف: <strong>{c.goal.toLocaleString()}</strong> ر.س</span>
            </div>
          </div>
        )}
      </div>

      {/* الصيانة + الإيجار */}
      <div className="cd-row">
        <section className="cd-panel" style={{ flex:"1 1 320px" }}>
          <h2 className="cd-h2"><Ic n="wrench" s={18}/>الصيانة</h2>
          <div className="cd-status">
            <div className="cd-st open"><b>{c.mop}</b><span>مفتوح</span></div>
            <div className="cd-st prog"><b>{c.mip}</b><span>جاري</span></div>
            <div className="cd-st done"><b>{c.mdn}</b><span>منتهي</span></div>
          </div>
        </section>

        <section className="cd-panel" style={{ flex:"1 1 320px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
            <h2 className="cd-h2"><Ic n="home" s={18}/>الإيجار</h2>
            <button type="button" className="btn bo bsm" onClick={() => onAddRent(c.name)}><Ic n="plus" s={15}/>إضافة</button>
          </div>
          {rentItems.length === 0 && <div className="cd-empty">لا يوجد إيجار مسجّل لهذا الشاليه</div>}
          {rentItems.map(({ fx, info }) => {
            const overdue  = info ? info.daysUntil < 0  : false;
            const dueToday = info ? info.daysUntil === 0 : false;
            const soon     = info ? info.daysUntil > 0 && info.daysUntil <= RENT_REMINDER_DAYS : false;
            const urgent   = overdue || dueToday || soon;
            const tone     = !info ? "muted" : overdue ? "bad" : dueToday || soon ? "warn" : "ok";
            const dueDateLabel = info ? formatDueDate(info.nextDue) : null;
            const badgeText  = !info
              ? "حدّد يوم الاستحقاق"
              : overdue  ? `متأخر ${Math.abs(info.daysUntil)} يوم · ${dueDateLabel}`
              : dueToday ? `يستحق اليوم · ${dueDateLabel}`
              : `${dueDateLabel} · باقي ${info.daysUntil} يوم`;
            return (
              <div key={fx.id} className="cd-rent">
                <div className="cd-rent-info">
                  <span className="cd-rent-amt">{fx.name} · <b>{Number(fx.amount).toLocaleString()}</b> ر.س</span>
                  <span className={"cd-pill " + tone}><Ic n="clock" s={13}/>{badgeText}</span>
                </div>
                <div className="cd-rent-acts">
                  <button type="button" className="btn bo cd-icon-btn" aria-label="تعديل الإيجار" onClick={() => onEditRent(fx)}><Ic n="edit"/></button>
                  <button type="button" className={"btn " + (urgent ? "bp" : "bo")} title="تأكيد الاطلاع والتحويل لتاريخ الشهر القادم"
                    onClick={() => onAcknowledgeRent(fx)}><Ic n="check" s={16}/>تم</button>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
});

export default function ChaletsTab({ cStats, rooms, loading, fixedExpenses, onAdd, onEdit, onDelete, onGoal, onQr, onImgChange, onAddRent, onEditRent, onAcknowledgeRent }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery]       = useState("");

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
        onBack={() => setSelected(null)}
        onEdit={onEdit}
        onDelete={onDelete}
        onGoal={onGoal}
        onQr={onQr}
        onImgChange={onImgChange}
        onAddRent={onAddRent}
        onEditRent={onEditRent}
        onAcknowledgeRent={onAcknowledgeRent}
      />
    );
  }

  const activeCount    = cStats.filter(c => c.st==="active").length;
  const totalNetMonth  = cStats.reduce((s,c) => s + (c.monthRev-c.monthExp), 0);
  const attentionList  = cStats.map(c => chaletNeedsAttention(c, fixedExpenses));
  const attentionCount = attentionList.filter(Boolean).length;

  const q = query.trim();
  const filtered = q
    ? cStats.filter(c => c.name.includes(q) || c.loc.includes(q))
    : cStats;
  // الشاليهات اللي تحتاج متابعة بمجموعة منفصلة أول، بعنوان واضح — بدل ترتيب صامت يصعب فهمه.
  const attentionGroup = filtered.filter(c => chaletNeedsAttention(c, fixedExpenses));
  const restGroup      = filtered.filter(c => !chaletNeedsAttention(c, fixedExpenses));

  const renderGrid = (list: ChaletStat[]) => (
    <div className="cg">
      {list.map(c => (
        <ChaletSummaryCard
          key={c.id}
          c={c}
          fixedExpenses={fixedExpenses}
          onOpen={setSelected}
        />
      ))}
    </div>
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontWeight:800, color:B, fontSize:18 }}>إدارة الشاليهات</div>
        <button className="btn bp" onClick={onAdd}>+ إضافة شاليه</button>
      </div>

      {cStats.length > 0 && (
        <div className="card" style={{ padding:"14px 16px", marginBottom:18, display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:14 }}>
          {([
            { i:"🏠", l:"الشاليهات النشطة",   v:`${activeCount} من ${cStats.length}` },
            { i:"💰", l:"صافي الشهر (الإجمالي)", v: <Money value={totalNetMonth} size={15} weight={800} color={totalNetMonth>=0?SD:"#A63A2A"}/> },
            { i: attentionCount>0?"🔔":"✅", l:"يحتاج متابعة", v: attentionCount>0?`${attentionCount} شاليه`:"لا شيء، تمام", color: attentionCount>0?"#A63A2A":SD },
          ] as { i: string; l: string; v: React.ReactNode; color?: string }[]).map((x,i) => (
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

      {cStats.length > 3 && (
        <div style={{ position:"relative", marginBottom:18 }}>
          <span style={{ position:"absolute", top:"50%", right:14, transform:"translateY(-50%)", fontSize:14, color:T, pointerEvents:"none" }}>🔍</span>
          <input
            className="inp"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ابحث باسم الشاليه أو الموقع..."
            style={{ paddingRight:36 }}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card" style={{ padding:"30px 16px", textAlign:"center", color:T, fontSize:13 }}>
          لا يوجد شاليه مطابق لبحثك
        </div>
      ) : (
        <>
          {attentionGroup.length > 0 && (
            <>
              {restGroup.length > 0 && (
                <div style={{ fontSize:13, fontWeight:800, color:"#A63A2A", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                  🔔 يحتاج متابعة
                </div>
              )}
              {renderGrid(attentionGroup)}
            </>
          )}
          {restGroup.length > 0 && (
            <>
              {attentionGroup.length > 0 && (
                <div style={{ fontSize:13, fontWeight:800, color:B, margin:"20px 0 10px", display:"flex", alignItems:"center", gap:6 }}>
                  باقي الشاليهات
                </div>
              )}
              {renderGrid(restGroup)}
            </>
          )}
        </>
      )}
    </div>
  );
}
