import { useState, useEffect } from "react";
import { Booking } from "../lib/types";

function useCalMobile() {
  const [mobile, setMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 640 : false);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

interface Props {
  bookings: Booking[];
  names:    string[];
  /** فتح تفاصيل حجز موجود (مثلاً عند الضغط على شريط في الجدول الزمني) */
  onSelectBooking?: (b: Booking) => void;
  /** فتح نموذج إضافة حجز جديد مُعبّأ مسبقاً بالشاليه والتاريخ (عند الضغط على خانة فارغة) */
  onAddAt?: (chalet: string, dateISO: string) => void;
}

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS   = ["أح","اث","ثل","أر","خم","جم","سب"];

const ST: Record<string, { label: string; pill: string; pillTxt: string; bar: string; text: string; dot: string; solid: string }> = {
  confirmed: { label:"مؤكد",  pill:"#DCFCE7", pillTxt:"#166534", bar:"rgba(34,197,94,.14)",  text:"#15803D", dot:"#22C55E", solid:"linear-gradient(180deg,#4ADE80,#16A34A)" },
  pending:   { label:"معلق",  pill:"#FEF9C3", pillTxt:"#854D0E", bar:"rgba(234,179,8,.13)",   text:"#A16207", dot:"#EAB308", solid:"linear-gradient(180deg,#FDE047,#CA8A04)" },
  completed: { label:"مكتمل", pill:"#F1F5F9", pillTxt:"#475569", bar:"rgba(100,116,139,.12)", text:"#64748B", dot:"#94A3B8", solid:"linear-gradient(180deg,#CBD5E1,#64748B)" },
  cancelled: { label:"ملغي",  pill:"#FEE2E2", pillTxt:"#991B1B", bar:"rgba(239,68,68,.1)",   text:"#DC2626", dot:"#EF4444", solid:"linear-gradient(180deg,#FCA5A5,#DC2626)" },
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function toISO(d: Date) { return d.toISOString().slice(0,10); }
function daysBetween(a: Date, b: Date) {
  const a0 = new Date(a); a0.setHours(0,0,0,0);
  const b0 = new Date(b); b0.setHours(0,0,0,0);
  return Math.round((b0.getTime()-a0.getTime())/86400000);
}
function dayBks(bookings: Booking[], date: Date) {
  const d0 = new Date(date); d0.setHours(0,0,0,0);
  const d1 = new Date(date); d1.setHours(23,59,59,999);
  return bookings.filter(b => {
    if (!b.date_from || !b.date_to) return false;
    const f = new Date(b.date_from); f.setHours(0,0,0,0);
    const t = new Date(b.date_to);   t.setHours(23,59,59,999);
    return d0 <= t && d1 >= f;
  });
}

export default function BookingCalendar({ bookings, names, onSelectBooking, onAddAt }: Props) {
  const mobile = useCalMobile();
  const [view,   setView]   = useState<"timeline"|"month">("timeline");
  const [cur,    setCur]    = useState(new Date());
  const [tlStart,setTlStart]= useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [selCh,  setSelCh]  = useState("الكل");
  const [selSt,  setSelSt]  = useState("الكل");
  const [selDay, setSelDay] = useState<Date | null>(null);

  const y = cur.getFullYear();
  const m = cur.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);

  const filtered = bookings.filter(b =>
    (selCh === "الكل" || b.chalet === selCh) &&
    (selSt === "الكل" || b.status === selSt)
  );

  function prevMonth() { setCur(new Date(y, m - 1, 1)); }
  function nextMonth() { setCur(new Date(y, m + 1, 1)); }

  const TL_DAYS = mobile ? 10 : 14;
  const CELL_W  = mobile ? 46 : 64;
  const NAME_W  = mobile ? 84 : 130;

  function tlPrev() { const d = new Date(tlStart); d.setDate(d.getDate() - 7); setTlStart(d); }
  function tlNext() { const d = new Date(tlStart); d.setDate(d.getDate() + 7); setTlStart(d); }
  function tlToday() { const d = new Date(); d.setHours(0,0,0,0); setTlStart(d); }

  /* ── Timeline (Gantt) view — صف لكل شاليه، أشرطة بعرض حقيقي حسب عدد الليالي ── */
  function TimelineView() {
    const rows = selCh === "الكل" ? names : names.filter(n => n === selCh);
    const tlDates = Array.from({ length: TL_DAYS }, (_, i) => { const d = new Date(tlStart); d.setDate(d.getDate() + i); return d; });
    const rangeEnd = tlDates[tlDates.length - 1];

    return (
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch" }}>
        <div style={{ minWidth: NAME_W + CELL_W * TL_DAYS }}>
          {/* رأس التواريخ */}
          <div style={{ display:"flex", position:"sticky", top:0, zIndex:3, background:"var(--surface)" }}>
            <div style={{ width:NAME_W, flexShrink:0, position:"sticky", right:0, zIndex:4, background:"var(--th-bg)", borderBottom:"2px solid var(--border2)", display:"flex", alignItems:"center", padding:"0 10px", fontSize:12, fontWeight:800, color:"var(--text2)" }}>
              الشاليه
            </div>
            {tlDates.map((d, i) => {
              const isToday = sameDay(d, today);
              const isWknd  = d.getDay() === 5 || d.getDay() === 6;
              return (
                <div key={i} style={{
                  width:CELL_W, flexShrink:0, textAlign:"center", padding:"6px 2px",
                  borderBottom:"2px solid var(--border2)",
                  background: isToday ? "var(--text)" : isWknd ? "rgba(197,172,136,.06)" : "transparent",
                  borderInlineStart: i>0 ? "1px solid var(--border)" : undefined,
                }}>
                  <div style={{ fontSize:9, fontWeight:600, color: isToday?"var(--bg)":"var(--text3)" }}>{DAYS[d.getDay()]}</div>
                  <div style={{ fontSize:13, fontWeight:800, color: isToday?"var(--bg)":"var(--text)" }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* الصفوف */}
          {rows.length === 0 && (
            <div style={{ padding:24, textAlign:"center", color:"var(--text3)", fontSize:13 }}>أضف شاليهات أولاً</div>
          )}
          {rows.map((chalet, ri) => {
            const chBks = filtered.filter(b => b.chalet === chalet && b.date_from && b.date_to);
            return (
              <div key={chalet} style={{ display:"flex", position:"relative", minHeight: mobile?46:52, borderBottom:"1px solid var(--border)" }}>
                <div style={{
                  width:NAME_W, flexShrink:0, position:"sticky", right:0, zIndex:2,
                  background: ri%2 ? "var(--surface)" : "var(--bg)",
                  display:"flex", alignItems:"center", padding:"0 10px",
                  fontSize:12, fontWeight:700, color:"var(--text)",
                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  borderInlineStart:"1px solid var(--border)",
                }}>
                  {chalet}
                </div>

                {/* خلفية الخانات (خطوط الشبكة + اليوم الحالي + فراغات قابلة للنقر للإضافة) */}
                <div style={{ position:"relative", display:"flex" }}>
                  {tlDates.map((d, i) => {
                    const isToday = sameDay(d, today);
                    const isWknd  = d.getDay() === 5 || d.getDay() === 6;
                    return (
                      <div key={i}
                        onClick={() => onAddAt?.(chalet, toISO(d))}
                        style={{
                          width:CELL_W, flexShrink:0, minHeight: mobile?46:52,
                          background: ri%2 ? "var(--surface)" : "var(--bg)",
                          borderInlineStart: i>0 ? "1px solid var(--border)" : undefined,
                          boxShadow: isToday ? "inset 0 0 0 1.5px rgba(197,172,136,.5)" : undefined,
                          opacity: isWknd ? .97 : 1,
                          cursor: onAddAt ? "cell" : "default",
                        }}
                      />
                    );
                  })}

                  {/* أشرطة الحجوزات — عرض حقيقي = عدد الليالي */}
                  {chBks.map((b, bi) => {
                    const f = new Date(b.date_from); f.setHours(0,0,0,0);
                    const t = new Date(b.date_to);   t.setHours(0,0,0,0);
                    if (t < tlStart || f > rangeEnd) return null;
                    const startIdx = Math.max(0, daysBetween(tlStart, f));
                    const endIdx   = Math.min(TL_DAYS, daysBetween(tlStart, t) + 1);
                    if (endIdx <= startIdx) return null;
                    const cfg = ST[b.status] || ST.confirmed;
                    const clippedStart = f < tlStart;
                    const clippedEnd   = t > rangeEnd;
                    return (
                      <div key={bi}
                        onClick={(e) => { e.stopPropagation(); onSelectBooking?.(b); }}
                        title={`${b.guest} · ${b.chalet}\n${b.date_from} → ${b.date_to}\n${Number(b.price).toLocaleString()} ر`}
                        style={{
                          position:"absolute", top:5, bottom:5,
                          right: startIdx * CELL_W, width: (endIdx-startIdx) * CELL_W - 3,
                          background: cfg.solid,
                          borderRadius: 7,
                          borderTopRightRadius: clippedStart?0:7, borderBottomRightRadius: clippedStart?0:7,
                          borderTopLeftRadius: clippedEnd?0:7, borderBottomLeftRadius: clippedEnd?0:7,
                          display:"flex", alignItems:"center", padding:"0 8px",
                          boxShadow:"0 1px 4px rgba(0,0,0,.15)", cursor:"pointer",
                          overflow:"hidden", zIndex:1,
                        }}>
                        <span style={{ fontSize: mobile?10:11.5, fontWeight:800, color:"#fff", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textShadow:"0 1px 2px rgba(0,0,0,.25)" }}>
                          {b.guest}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Month view (نظرة شهرية مختصرة) ─────────────────────────────────── */
  function MonthView() {
    const firstDay    = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:12, fontWeight:700, color:"var(--text2)", padding:"8px 0", borderBottom:"2px solid var(--border2)" }}>{d}</div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight:mobile?48:100, background:"var(--bg)", borderRadius:8, opacity:.4 }}/>;
            const date    = new Date(y, m, d);
            const bks     = dayBks(filtered, date);
            const isToday = sameDay(date, today);
            const isSel   = selDay && sameDay(date, selDay);
            const isWknd  = date.getDay() === 5 || date.getDay() === 6;

            return (
              <div
                key={i}
                onClick={() => setSelDay(isSel ? null : date)}
                style={{
                  minHeight:mobile?48:100, padding: mobile?"6px 2px":"6px 5px 5px", borderRadius:8,
                  display: mobile?"flex":undefined, flexDirection: mobile?"column":undefined, alignItems: mobile?"center":undefined,
                  background: isSel   ? "rgba(87,109,111,.12)"
                            : isToday ? "rgba(197,172,136,.15)"
                            : isWknd  ? "rgba(197,172,136,.04)"
                            : "var(--surface)",
                  border: isSel   ? "2px solid var(--text2)"
                        : isToday ? "2px solid var(--text)"
                        : "1px solid var(--border)",
                  cursor:"pointer", transition:"background .12s, border .12s",
                  boxShadow: bks.length ? "0 1px 6px rgba(0,0,0,.06)" : "none",
                  position:"relative", overflow:"hidden",
                }}
              >
                {mobile ? (
                  <>
                    <span style={{
                      fontSize:13, fontWeight:800, lineHeight:1,
                      color: isToday ? "var(--bg)" : "var(--text)",
                      background: isToday ? "var(--text)" : "transparent",
                      borderRadius: isToday ? "50%" : 0,
                      width:isToday?22:undefined, height:isToday?22:undefined,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      minWidth: isToday ? 22 : undefined,
                    }}>{d}</span>
                    {bks.length > 0 && (
                      <div style={{ display:"flex", gap:2, flexWrap:"wrap", justifyContent:"center", marginTop:5, maxWidth:"100%" }}>
                        {bks.slice(0, 4).map((b, j) => {
                          const cfg = ST[b.status] || ST.confirmed;
                          return <div key={j} style={{ width:6, height:6, borderRadius:"50%", background:cfg.dot, flexShrink:0 }}/>;
                        })}
                        {bks.length > 4 && <span style={{ fontSize:8, color:"var(--text2)", fontWeight:700 }}>{"+"+(bks.length-4)}</span>}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5 }}>
                      <span style={{
                        fontSize:13, fontWeight:800, lineHeight:1,
                        color: isToday ? "var(--bg)" : "var(--text)",
                        background: isToday ? "var(--text)" : "transparent",
                        borderRadius: isToday ? "50%" : 0,
                        width:isToday?22:undefined, height:isToday?22:undefined,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        minWidth: isToday ? 22 : undefined,
                      }}>{d}</span>
                      {bks.length > 0 && (
                        <span style={{ fontSize:9, fontWeight:700, borderRadius:99, padding:"1px 6px", background:"var(--text)", color:"var(--bg)" }}>{bks.length}</span>
                      )}
                    </div>
                    {bks.slice(0, 3).map((b, j) => {
                      const cfg = ST[b.status] || ST.confirmed;
                      const isStart = sameDay(new Date(b.date_from), date);
                      const isEnd   = sameDay(new Date(b.date_to),   date);
                      return (
                        <div key={j} title={`${b.guest} · ${b.chalet}\n${Number(b.price).toLocaleString()} ر`} style={{
                          display:"flex", alignItems:"center", gap:3,
                          background: cfg.bar,
                          borderRight: `3px solid ${cfg.dot}`,
                          borderRadius: isStart && isEnd ? 5 : isStart ? "5px 0 0 5px" : isEnd ? "0 5px 5px 0" : 0,
                          padding:"2px 5px 2px 4px", marginBottom:2, overflow:"hidden",
                        }}>
                          {isStart && <span style={{ fontSize:8, color:cfg.dot, flexShrink:0 }}>●</span>}
                          <span style={{ fontSize:10, fontWeight:700, color:cfg.text, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", flex:1 }}>{b.guest}</span>
                          {isEnd && <span style={{ fontSize:8, color:cfg.dot, flexShrink:0 }}>■</span>}
                        </div>
                      );
                    })}
                    {bks.length > 3 && (
                      <div style={{ fontSize:9, color:"var(--text2)", fontWeight:700, textAlign:"center", marginTop:2 }}>+{bks.length - 3} حجوزات</div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const selBks = selDay ? dayBks(filtered, selDay) : [];
  const activeCount = filtered.filter(b => b.status !== "cancelled").length;

  const tlEnd = (() => { const d = new Date(tlStart); d.setDate(d.getDate() + TL_DAYS - 1); return d; })();
  const tlLabel = tlStart.getMonth() === tlEnd.getMonth()
    ? `${tlStart.getDate()} — ${tlEnd.getDate()} ${MONTHS[tlEnd.getMonth()]} ${tlEnd.getFullYear()}`
    : `${tlStart.getDate()} ${MONTHS[tlStart.getMonth()]} — ${tlEnd.getDate()} ${MONTHS[tlEnd.getMonth()]} ${tlEnd.getFullYear()}`;

  return (
    <div className="card" style={{ overflow:"hidden", marginBottom:20 }}>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div style={{
        padding:"14px 18px", borderBottom:"1px solid var(--border)",
        background:"var(--th-bg)",
        display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button className="btn" onClick={view==="timeline"?tlPrev:prevMonth} style={{ background:"var(--surface)", color:"var(--text)", border:"1px solid var(--border2)", padding:"6px 14px", fontSize:16, fontWeight:400 }}>‹</button>
          <div style={{ fontWeight:800, color:"var(--text)", fontSize:mobile?13:15, minWidth:mobile?120:160, textAlign:"center" }}>
            {view==="timeline" ? tlLabel : `${MONTHS[m]} ${y}`}
          </div>
          <button className="btn" onClick={view==="timeline"?tlNext:nextMonth} style={{ background:"var(--surface)", color:"var(--text)", border:"1px solid var(--border2)", padding:"6px 14px", fontSize:16, fontWeight:400 }}>›</button>
          <button className="btn" onClick={()=>{ view==="timeline"?tlToday():setCur(new Date()); }} style={{ background:"var(--surface)", color:"var(--text2)", border:"1px solid var(--border2)", padding:"6px 12px", fontSize:12 }}>اليوم</button>
        </div>

        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <select className="inp" style={{ width:"auto", fontSize:12, padding:"6px 10px" }} value={selCh} onChange={e => setSelCh(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="inp" style={{ width:"auto", fontSize:12, padding:"6px 10px" }} value={selSt} onChange={e => setSelSt(e.target.value)}>
            <option value="الكل">كل الحالات</option>
            {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <div style={{ display:"flex", gap:2, background:"var(--surface)", borderRadius:10, border:"1px solid var(--border2)", overflow:"hidden" }}>
            {(["timeline","month"] as const).map(v => (
              <button key={v} className="btn" onClick={() => setView(v)} style={{
                background: view===v ? "var(--text)" : "transparent",
                color:      view===v ? "var(--bg)"   : "var(--text2)",
                border:"none", padding:"6px 14px", fontSize:12, borderRadius:0,
              }}>
                {v === "timeline" ? "📊 جدول زمني" : "شهري"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar body ─────────────────────────────────────── */}
      <div style={{ padding: view==="timeline" ? "0" : "14px 14px 8px" }}>
        {view === "timeline" ? <TimelineView/> : <MonthView/>}
      </div>

      {/* ── Day detail panel (العرض الشهري فقط) ──────────────────────────────────── */}
      {view==="month" && selDay && selBks.length > 0 && (
        <div style={{ margin:"0 14px 14px", borderRadius:12, padding:"14px 16px", background:"var(--th-bg)", border:"1px solid var(--border2)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontWeight:800, color:"var(--text)", fontSize:14 }}>
              {selDay.toLocaleDateString("ar-SA-u-ca-gregory", { weekday:"long", day:"numeric", month:"long" })}
            </span>
            <button onClick={() => setSelDay(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--text3)" }}>×</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
            {selBks.map((b, i) => {
              const cfg = ST[b.status] || ST.confirmed;
              return (
                <div key={i} onClick={()=>onSelectBooking?.(b)} style={{
                  borderRadius:10, padding:"10px 12px", cursor: onSelectBooking?"pointer":"default",
                  background:"var(--surface)", border:`1px solid var(--border)`,
                  borderRight:`4px solid ${cfg.dot}`,
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <span style={{ fontWeight:800, color:"var(--text)", fontSize:13 }}>{b.guest}</span>
                    <span style={{ fontSize:10, fontWeight:700, borderRadius:99, padding:"2px 8px", background:cfg.pill, color:cfg.pillTxt }}>{cfg.label}</span>
                  </div>
                  <div style={{ fontSize:12, color:"var(--text2)", marginBottom:4 }}>{b.chalet}</div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"var(--text3)" }}>
                    <span>{b.date_from} → {b.date_to}</span>
                    <span style={{ fontWeight:700, color:cfg.text }}>{Number(b.price).toLocaleString()} ر</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Footer legend ─────────────────────────────────────── */}
      <div style={{ padding:"10px 18px 14px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", borderTop:"1px solid var(--border)" }}>
        {Object.entries(ST).map(([, cfg]) => (
          <div key={cfg.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot }}/>
            <span style={{ color:"var(--text2)", fontWeight:600 }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ marginRight:"auto", fontSize:11, color:"var(--text3)", fontWeight:600 }}>{activeCount} حجز نشط</div>
        <div style={{ fontSize:10, color:"var(--text3)" }}>
          {view==="timeline" ? "اضغط على حجز للتفاصيل · اضغط على خانة فارغة للإضافة" : "اضغط على يوم لعرض التفاصيل"}
        </div>
      </div>
    </div>
  );
}
