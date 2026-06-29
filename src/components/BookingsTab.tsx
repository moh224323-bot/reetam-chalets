import { useState, useMemo, useEffect } from "react";
import { Booking } from "../lib/types";
import { B, T, SI, SL, S } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { formatDate, nightsBetween, db } from "../lib/db";
import { Bdg } from "./ui";
import BookingCalendar from "./BookingCalendar";

function useIsMobile() {
  const [m, setM] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}

interface Props {
  bookings:       Booking[];
  names:          string[];
  filteredNames?: string[];
  onAdd:          () => void;
  onEdit:         (b: Booking) => void;
  onReload:       () => void;
}

const STATUS = BOOKING_STATUS;
const fd = formatDate;
const fn = nightsBetween;

function sendWA(b: Booking, mode: "checkin"|"review") {
  const phone = b.phone?.replace(/[^0-9]/g,"").replace(/^0/,"966");
  if (!phone) return;
  const BASE = "https://reetam-chalets.vercel.app";
  if (mode === "checkin") {
    const url = `${BASE}?guest=1&b=${b.id}&m=checkin`;
    const msg = `مرحباً ${b.guest} 👋%0aأهلاً بك في ${b.chalet}%0a%0aرابط تسجيل الدخول:%0a${encodeURIComponent(url)}`;
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  } else {
    const url = `${BASE}?guest=1&b=${b.id}&m=review`;
    const msg = `${b.guest} 😊%0aرابط التقييم:%0a${encodeURIComponent(url)}`;
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
  }
}

function exportCSV(rows: Booking[]) {
  const h = (s: string) => `"${(s||"").replace(/"/g,'""')}"`;
  const header = ["الضيف","الهاتف","الشاليه","من","إلى","ليالي","السعر","الحالة","ملاحظات"];
  const data = rows.map(b => [
    b.guest, b.phone||"", b.chalet,
    b.date_from||"", b.date_to||"",
    String(fn(b.date_from,b.date_to)), String(Number(b.price)),
    STATUS[b.status]?.label||b.status, b.note||"",
  ]);
  const csv = [header, ...data].map(r => r.map(h).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"}));
  a.download = `ريتام-حجوزات-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function BookingCard({ b, onEdit, onReload }: { b: Booking; onEdit:(b:Booking)=>void; onReload:()=>void }) {
  const st = STATUS[b.status] || { label: b.status, bg:"#eee", color:"#333" };
  const nights = fn(b.date_from, b.date_to);
  const [confirming, setConfirming] = useState(false);

  async function doDelete() {
    if (!confirming) { setConfirming(true); setTimeout(()=>setConfirming(false), 3000); return; }
    await db("bookings","DELETE",null,b.id);
    onReload();
  }

  return (
    <div className="list-item" style={{
      background:"var(--card,#fff)",
      borderRadius:14,
      border:"1px solid rgba(197,172,136,.18)",
      overflow:"hidden",
      display:"flex",
      flexDirection:"column",
    }}>
      {/* شريط الحالة اللوني */}
      <div style={{height:4, background:st.color, opacity:.8}}/>

      <div style={{padding:"14px 16px"}}>
        {/* الرأس: اسم + شاليه + حالة */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:800,color:B,fontSize:15,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.guest}</div>
            <div style={{fontSize:12,color:T,marginTop:2,display:"flex",alignItems:"center",gap:4}}>
              <span>🏠</span>
              <span>{b.chalet}</span>
              {b.phone && <>
                <span style={{color:"rgba(197,172,136,.4)"}}>·</span>
                <span style={{direction:"ltr"}}>{b.phone}</span>
              </>}
            </div>
          </div>
          <Bdg bg={st.bg} color={st.color}>{st.label}</Bdg>
        </div>

        {/* التواريخ والسعر */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          <div style={{background:"rgba(197,172,136,.07)",borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:SI,fontWeight:600,marginBottom:2}}>📅 الوصول</div>
            <div style={{fontWeight:700,color:B,fontSize:13}}>{fd(b.date_from)||"—"}</div>
            {b.checkin_time && <div style={{fontSize:10,color:T}}>{b.checkin_time}</div>}
          </div>
          <div style={{background:"rgba(197,172,136,.07)",borderRadius:10,padding:"8px 10px"}}>
            <div style={{fontSize:9,color:SI,fontWeight:600,marginBottom:2}}>🚪 المغادرة</div>
            <div style={{fontWeight:700,color:B,fontSize:13}}>{fd(b.date_to)||"—"}</div>
            {b.checkout_time && <div style={{fontSize:10,color:T}}>{b.checkout_time}</div>}
          </div>
          <div style={{background:"rgba(197,172,136,.07)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
            <div style={{fontSize:9,color:SI,fontWeight:600,marginBottom:2}}>💰 الإجمالي</div>
            <div style={{fontWeight:900,color:B,fontSize:14}}>{Number(b.price).toLocaleString()}</div>
            <div style={{fontSize:10,color:T}}>{nights} ليلة · ر.س</div>
          </div>
        </div>

        {/* ملاحظة */}
        {b.note && (
          <div style={{background:"rgba(197,172,136,.06)",borderRadius:8,padding:"6px 10px",marginBottom:10,fontSize:12,color:T,fontStyle:"italic"}}>
            💬 {b.note}
          </div>
        )}

        {/* الأزرار */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <button className="btn bsm" onClick={()=>sendWA(b,"checkin")}
            style={{background:"#25D366",color:"#fff",flex:1,minWidth:80,justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>
            <span>📲</span><span>واتساب</span>
          </button>
          <button className="btn bsm" onClick={()=>sendWA(b,"review")}
            style={{background:"#F59E0B",color:"#fff",flex:1,minWidth:64,justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>
            <span>⭐</span><span>تقييم</span>
          </button>
          <button className="btn be bsm" onClick={()=>onEdit(b)}
            style={{flex:1,minWidth:64,justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>
            <span>✏️</span><span>تعديل</span>
          </button>
          <button className="btn bsm" onClick={doDelete}
            style={{background:confirming?"#dc3232":"rgba(220,50,50,.1)",color:confirming?"#fff":"#dc3232",minWidth:64,justifyContent:"center",display:"flex",alignItems:"center",gap:4,transition:"all .2s"}}>
            {confirming ? "تأكيد الحذف؟" : "🗑️"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BookingsTab({ bookings, names, filteredNames, onAdd, onEdit, onReload }: Props) {
  const isMobile = useIsMobile();
  const [fch,    setFch]    = useState("الكل");
  const [fst,    setFst]    = useState("الكل");
  const [search, setSearch] = useState("");
  const [view,   setView]   = useState<"cards"|"table">("cards");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort,     setSort]     = useState("newest");
  const [showAdv,  setShowAdv]  = useState(false);

  const visibleNames = filteredNames ?? names;

  // اختصارات الفترة
  function setQuick(q: "this_month"|"next_month"|"this_week") {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (q === "this_month") {
      setDateFrom(`${y}-${String(m+1).padStart(2,"0")}-01`);
      setDateTo(`${y}-${String(m+1).padStart(2,"0")}-${new Date(y,m+1,0).getDate()}`);
    } else if (q === "next_month") {
      const nm = m === 11 ? 0 : m+1, ny = m === 11 ? y+1 : y;
      setDateFrom(`${ny}-${String(nm+1).padStart(2,"0")}-01`);
      setDateTo(`${ny}-${String(nm+1).padStart(2,"0")}-${new Date(ny,nm+1,0).getDate()}`);
    } else {
      const mon = new Date(now); mon.setDate(now.getDate()-now.getDay());
      const sun = new Date(mon); sun.setDate(mon.getDate()+6);
      setDateFrom(mon.toISOString().slice(0,10));
      setDateTo(sun.toISOString().slice(0,10));
    }
  }

  const activeFilters = [fch!=="الكل",fst!=="الكل",search,dateFrom||dateTo,minPrice||maxPrice].filter(Boolean).length;

  function clearAll() { setFch("الكل"); setFst("الكل"); setSearch(""); setDateFrom(""); setDateTo(""); setMinPrice(""); setMaxPrice(""); setSort("newest"); }

  // الفلترة
  const filtered = useMemo(() => {
    let res = bookings.filter(b => {
      if (fch !== "الكل" && b.chalet !== fch) return false;
      if (fst !== "الكل" && b.status !== fst) return false;
      if (search && !b.guest?.includes(search) && !b.phone?.includes(search) && !b.chalet?.includes(search)) return false;
      if (dateFrom && b.date_from && b.date_from < dateFrom) return false;
      if (dateTo   && b.date_from && b.date_from > dateTo)   return false;
      if (minPrice && Number(b.price) < Number(minPrice)) return false;
      if (maxPrice && Number(b.price) > Number(maxPrice)) return false;
      return true;
    });
    res = [...res].sort((a,b) => {
      if (sort === "newest")    return (b.date_from||"").localeCompare(a.date_from||"");
      if (sort === "oldest")    return (a.date_from||"").localeCompare(b.date_from||"");
      if (sort === "price_hi")  return Number(b.price)-Number(a.price);
      if (sort === "price_lo")  return Number(a.price)-Number(b.price);
      return 0;
    });
    return res;
  }, [bookings, fch, fst, search, dateFrom, dateTo, minPrice, maxPrice, sort]);

  // الإحصائيات السريعة
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const stats = useMemo(() => ({
    confirmed: bookings.filter(b=>b.status==="confirmed").length,
    pending:   bookings.filter(b=>b.status==="pending").length,
    completed: bookings.filter(b=>b.status==="completed").length,
    todayIn:   bookings.filter(b=>b.date_from===today).length,
    todayOut:  bookings.filter(b=>b.date_to===today).length,
    monthRev:  bookings.filter(b=>["confirmed","completed"].includes(b.status)&&b.date_from?.startsWith(today.slice(0,7))).reduce((s,b)=>s+Number(b.price),0),
  }),[bookings]);

  // تجميع الكروت حسب الوقت
  const groups = useMemo(() => {
    const todayDate = new Date(today);
    const upcoming: Booking[] = [], active: Booking[] = [], past: Booking[] = [], cancelled: Booking[] = [];
    filtered.forEach(b => {
      if (b.status === "cancelled") { cancelled.push(b); return; }
      const from = b.date_from ? new Date(b.date_from) : null;
      const to   = b.date_to   ? new Date(b.date_to)   : null;
      if (to && to < todayDate)        past.push(b);
      else if (from && from <= todayDate && to && to >= todayDate) active.push(b);
      else upcoming.push(b);
    });
    upcoming.sort((a,b)=>(a.date_from||"").localeCompare(b.date_from||""));
    active.sort((a,b)=>(a.date_to||"").localeCompare(b.date_to||""));
    past.sort((a,b)=>(b.date_from||"").localeCompare(a.date_from||""));
    return { active, upcoming, past, cancelled };
  }, [filtered, today]);

  const statusFilters = [
    { key:"الكل", label:"الكل", count: bookings.length },
    { key:"confirmed", label:"مؤكد", count: stats.confirmed },
    { key:"pending",   label:"معلق",  count: stats.pending },
    { key:"completed", label:"مكتمل", count: stats.completed },
    { key:"cancelled", label:"ملغي",  count: bookings.filter(b=>b.status==="cancelled").length },
  ];

  function GroupSection({ title, icon, items, color }: { title:string; icon:string; items:Booking[]; color:string }) {
    if (!items.length) return null;
    return (
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:18}}>{icon}</span>
          <span style={{fontWeight:800,color,fontSize:15}}>{title}</span>
          <span style={{background:color+"22",color,borderRadius:20,fontSize:11,fontWeight:700,padding:"1px 8px"}}>{items.length}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
          {items.map(b => <BookingCard key={b.id} b={b} onEdit={onEdit} onReload={onReload}/>)}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* التقويم */}
      <BookingCalendar bookings={filtered} names={visibleNames}/>

      {/* الإحصائيات السريعة */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(3,1fr)",gap:10,marginBottom:20}}>
        {[
          { icon:"✅", label:"مؤكد",     val:stats.confirmed, color:"#4CAF50" },
          { icon:"⏳", label:"معلق",      val:stats.pending,   color:"#F59E0B" },
          { icon:"📥", label:"وصول اليوم",val:stats.todayIn,   color:"#4A9BAF" },
          { icon:"📤", label:"مغادرة اليوم",val:stats.todayOut, color:"#C97B63" },
          { icon:"✔️", label:"مكتمل",     val:stats.completed, color:T },
          { icon:"💰", label:"إيرادات الشهر",val:stats.monthRev.toLocaleString()+" ر", color:B },
        ].map(s=>(
          <div key={s.label} className="stat-card" style={{background:"var(--card,#fff)",borderRadius:12,padding:"12px 14px",border:"1px solid rgba(197,172,136,.15)",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:22}}>{s.icon}</span>
            <div>
              <div style={{fontWeight:900,color:s.color,fontSize:16,lineHeight:1}}>{s.val}</div>
              <div style={{fontSize:10,color:SI,marginTop:2}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* شريط الفلاتر والبحث — لاصق */}
      <div style={{position:"sticky",top:isMobile?52:0,zIndex:150,background:"var(--card,#fff)",borderRadius:14,padding:"12px 14px",marginBottom:16,border:"1px solid rgba(197,172,136,.15)",boxShadow:"0 4px 16px rgba(0,0,0,.08)"}}>

        {/* الصف الأول: بحث + أزرار */}
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{position:"relative",flex:1}}>
            <span style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",fontSize:14,pointerEvents:"none"}}>🔍</span>
            <input className="inp" value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="بحث باسم الضيف أو الجوال أو الشاليه..."
              style={{width:"100%",padding:"9px 36px 9px 12px",borderRadius:10,border:"1px solid rgba(197,172,136,.25)",background:"rgba(197,172,136,.04)",fontSize:13,fontFamily:"'Tajawal',sans-serif",color:B,direction:"rtl"}}
            />
          </div>
          <button className="btn bsm" onClick={()=>setShowAdv(v=>!v)}
            style={{background:showAdv||activeFilters>0?B:"rgba(197,172,136,.12)",color:showAdv||activeFilters>0?"#fff":T,padding:"7px 12px",whiteSpace:"nowrap",position:"relative"}}>
            ⚙️ فلاتر {activeFilters>0&&<span style={{position:"absolute",top:-5,left:-5,background:"#dc3232",color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>{activeFilters}</span>}
          </button>
        </div>

        {/* فلتر الحالة */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {statusFilters.map(f=>(
            <button key={f.key} className="btn tab-pill" onClick={()=>setFst(f.key)}
              style={{padding:"5px 12px",fontSize:12,background:fst===f.key?B:"rgba(197,172,136,.1)",color:fst===f.key?"#fff":T,border:"none",fontFamily:"'Tajawal',sans-serif",fontWeight:fst===f.key?700:500}}>
              {f.label} <span style={{opacity:.7,fontSize:11}}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* الفلاتر المتقدمة */}
        {showAdv && (
          <div style={{borderTop:"1px solid rgba(197,172,136,.15)",paddingTop:10,marginBottom:10}}>
            {/* اختصارات سريعة */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              <span style={{fontSize:11,color:SI,alignSelf:"center",fontWeight:600}}>سريع:</span>
              {[
                {label:"هذا الشهر",  key:"this_month"},
                {label:"الشهر القادم",key:"next_month"},
                {label:"هذا الأسبوع",key:"this_week"},
              ].map(q=>(
                <button key={q.key} className="btn bsm" onClick={()=>setQuick(q.key as any)}
                  style={{padding:"4px 10px",fontSize:11,background:"rgba(197,172,136,.12)",color:T}}>
                  📅 {q.label}
                </button>
              ))}
              {(dateFrom||dateTo)&&(
                <button className="btn bsm" onClick={()=>{setDateFrom("");setDateTo("");}}
                  style={{padding:"4px 10px",fontSize:11,background:"rgba(220,50,50,.1)",color:"#dc3232"}}>✕ مسح الفترة</button>
              )}
            </div>
            {/* تواريخ + سعر */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr 1fr",gap:8,marginBottom:8}}>
              {[
                {label:"من تاريخ",  val:dateFrom, set:setDateFrom, type:"date"},
                {label:"إلى تاريخ", val:dateTo,   set:setDateTo,   type:"date"},
                {label:"سعر أدنى", val:minPrice, set:setMinPrice, type:"number", ph:"0"},
                {label:"سعر أعلى", val:maxPrice, set:setMaxPrice, type:"number", ph:"99999"},
              ].map(f=>(
                <div key={f.label}>
                  <div style={{fontSize:10,color:SI,fontWeight:600,marginBottom:4}}>{f.label}</div>
                  <input className="inp" type={f.type} value={f.val} placeholder={f.ph||""}
                    onChange={e=>f.set(e.target.value)}
                    style={{width:"100%",padding:"6px 8px",borderRadius:8,border:"1px solid rgba(197,172,136,.25)",fontSize:12,fontFamily:"'Tajawal',sans-serif",background:"rgba(197,172,136,.04)",color:B}}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* الصف الأخير: شاليه + ترتيب + أزرار */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
          <select className="inp" value={fch} onChange={e=>setFch(e.target.value)}
            style={{flex:1,minWidth:120,padding:"7px 10px",borderRadius:8,border:"1px solid rgba(197,172,136,.25)",fontSize:13,fontFamily:"'Tajawal',sans-serif",background:"rgba(197,172,136,.04)",color:B}}>
            <option value="الكل">🏠 كل الشاليهات</option>
            {names.map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <select className="inp" value={sort} onChange={e=>setSort(e.target.value)}
            style={{minWidth:130,padding:"7px 10px",borderRadius:8,border:"1px solid rgba(197,172,136,.25)",fontSize:13,fontFamily:"'Tajawal',sans-serif",background:"rgba(197,172,136,.04)",color:B}}>
            <option value="newest">↓ الأحدث</option>
            <option value="oldest">↑ الأقدم</option>
            <option value="price_hi">↓ أعلى سعر</option>
            <option value="price_lo">↑ أدنى سعر</option>
          </select>
          <div style={{display:"flex",gap:6,marginRight:"auto"}}>
            {activeFilters>0&&(
              <button className="btn bsm" onClick={clearAll}
                style={{background:"rgba(220,50,50,.1)",color:"#dc3232",padding:"7px 10px"}}>✕ مسح الكل</button>
            )}
            <button className="btn bsm" onClick={()=>setView(v=>v==="cards"?"table":"cards")}
              style={{background:"rgba(197,172,136,.12)",color:T,padding:"7px 12px"}}>
              {view==="cards"?"📋 جدول":"🃏 كروت"}
            </button>
            <button className="btn bsm" onClick={()=>exportCSV(filtered)}
              style={{background:"#059669",color:"#fff",padding:"7px 12px"}}>⬇ تصدير</button>
            <button className="btn bp bsm" onClick={onAdd} style={{padding:"7px 14px"}}>+ إضافة</button>
          </div>
        </div>
      </div>

      {/* النتائج */}
      {filtered.length === 0 ? (
        <div style={{textAlign:"center",padding:"60px 20px",color:SI}}>
          <div style={{fontSize:48,marginBottom:12}}>📭</div>
          <div style={{fontWeight:700,fontSize:16,color:T,marginBottom:6}}>لا توجد حجوزات</div>
          <div style={{fontSize:13}}>جرّب تغيير الفلاتر أو أضف حجزاً جديداً</div>
        </div>
      ) : view === "cards" ? (
        <div>
          <GroupSection title="داخل حالياً"  icon="🟢" items={groups.active}    color="#4CAF50"/>
          <GroupSection title="قادم"           icon="🔵" items={groups.upcoming}  color="#4A9BAF"/>
          <GroupSection title="سابق"           icon="⚫" items={groups.past}      color={SI}/>
          <GroupSection title="ملغي"           icon="🔴" items={groups.cancelled} color="#dc3232"/>
        </div>
      ) : (
        /* عرض الجدول المضغوط */
        <div className="card" style={{overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,fontFamily:"'Tajawal',sans-serif"}}>
              <thead>
                <tr style={{background:SL}}>
                  {["الضيف","الشاليه","من — إلى","ليالي","السعر","الحالة",""].map((h,i)=>(
                    <th key={i} style={{padding:"10px 12px",fontWeight:700,color:B,textAlign:"right",whiteSpace:"nowrap",borderBottom:"2px solid rgba(197,172,136,.2)"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(b=>{
                  const st = STATUS[b.status]||{label:b.status,bg:"#eee",color:"#333"};
                  return (
                    <tr key={b.id} className="list-item" style={{borderBottom:"1px solid rgba(197,172,136,.08)"}}>
                      <td style={{padding:"10px 12px",fontWeight:700,color:B,borderRight:"3px solid "+st.color}}>
                        {b.guest}
                        {b.phone&&<div style={{fontSize:11,color:SI,fontWeight:400,direction:"ltr"}}>{b.phone}</div>}
                      </td>
                      <td style={{padding:"10px 12px",color:T}}>{b.chalet}</td>
                      <td style={{padding:"10px 12px",color:T,whiteSpace:"nowrap"}}>
                        {fd(b.date_from)} <span style={{color:SI}}>←</span> {fd(b.date_to)}
                      </td>
                      <td style={{padding:"10px 12px",textAlign:"center",color:T}}>{fn(b.date_from,b.date_to)}</td>
                      <td style={{padding:"10px 12px",fontWeight:700,color:B,whiteSpace:"nowrap"}}>{Number(b.price).toLocaleString()} ر</td>
                      <td style={{padding:"10px 12px"}}><Bdg bg={st.bg} color={st.color}>{st.label}</Bdg></td>
                      <td style={{padding:"8px 10px"}}>
                        <div style={{display:"flex",gap:4}}>
                          <button className="btn be bsm" onClick={()=>onEdit(b)}>✏️</button>
                          <button className="btn bsm" onClick={()=>sendWA(b,"checkin")} style={{background:"#25D366",color:"#fff"}}>📲</button>
                          <button className="btn bd bsm" onClick={async()=>{if(window.confirm("حذف الحجز؟")){await db("bookings","DELETE",null,b.id);onReload();}}}>🗑️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
