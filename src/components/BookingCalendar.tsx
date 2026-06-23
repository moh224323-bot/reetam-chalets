import { useState } from "react";
import { Booking } from "../lib/types";

interface Props {
  bookings: Booking[];
  names:    string[];
}

const MONTHS   = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAYS     = ["أح","اث","ثل","أر","خم","جم","سب"];

const ST: Record<string, { label: string; pill: string; pillTxt: string; bar: string; text: string; dot: string }> = {
  confirmed: { label:"مؤكد",  pill:"#DCFCE7", pillTxt:"#166534", bar:"rgba(34,197,94,.14)",  text:"#15803D", dot:"#22C55E" },
  pending:   { label:"معلق",  pill:"#FEF9C3", pillTxt:"#854D0E", bar:"rgba(234,179,8,.13)",   text:"#A16207", dot:"#EAB308" },
  completed: { label:"مكتمل", pill:"#F1F5F9", pillTxt:"#475569", bar:"rgba(100,116,139,.12)", text:"#64748B", dot:"#94A3B8" },
  cancelled: { label:"ملغي",  pill:"#FEE2E2", pillTxt:"#991B1B", bar:"rgba(239,68,68,.1)",   text:"#DC2626", dot:"#EF4444" },
};

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

export default function BookingCalendar({ bookings, names }: Props) {
  const [view,    setView]    = useState<"month"|"week">("month");
  const [cur,     setCur]     = useState(new Date());
  const [selCh,   setSelCh]   = useState("الكل");
  const [selSt,   setSelSt]   = useState("الكل");
  const [selDay,  setSelDay]  = useState<Date | null>(null);

  const y = cur.getFullYear();
  const m = cur.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);

  const filtered = bookings.filter(b =>
    (selCh === "الكل" || b.chalet === selCh) &&
    (selSt === "الكل" || b.status === selSt)
  );

  function prev() {
    if (view === "month") setCur(new Date(y, m - 1, 1));
    else { const d = new Date(cur); d.setDate(d.getDate() - 7); setCur(d); }
  }
  function next() {
    if (view === "month") setCur(new Date(y, m + 1, 1));
    else { const d = new Date(cur); d.setDate(d.getDate() + 7); setCur(d); }
  }

  /* ── Month view ─────────────────────────────────────────────────────── */
  function MonthView() {
    const firstDay    = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div>
        {/* Day-name header */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:4 }}>
          {DAYS.map(d => (
            <div key={d} style={{
              textAlign:"center", fontSize:12, fontWeight:700,
              color:"var(--text2)", padding:"8px 0",
              borderBottom:"2px solid var(--border2)",
            }}>{d}</div>
          ))}
        </div>

        {/* Cells */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight:100, background:"var(--bg)", borderRadius:8, opacity:.4 }}/>;
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
                  minHeight:100, padding:"6px 5px 5px", borderRadius:8,
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
                {/* Number */}
                <div style={{
                  display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:5,
                }}>
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
                    <span style={{
                      fontSize:9, fontWeight:700, borderRadius:99,
                      padding:"1px 6px",
                      background:"var(--text)", color:"var(--bg)",
                    }}>{bks.length}</span>
                  )}
                </div>

                {/* Booking bars */}
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
                      padding:"2px 5px 2px 4px",
                      marginBottom:2,
                      overflow:"hidden",
                    }}>
                      {isStart && <span style={{ fontSize:8, color:cfg.dot, flexShrink:0 }}>●</span>}
                      <span style={{
                        fontSize:10, fontWeight:700, color:cfg.text,
                        overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", flex:1,
                      }}>{b.guest}</span>
                      {isEnd && <span style={{ fontSize:8, color:cfg.dot, flexShrink:0 }}>■</span>}
                    </div>
                  );
                })}
                {bks.length > 3 && (
                  <div style={{ fontSize:9, color:"var(--text2)", fontWeight:700, textAlign:"center", marginTop:2 }}>
                    +{bks.length - 3} حجوزات
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ── Week view ───────────────────────────────────────────────────────── */
  function WeekView() {
    const start = new Date(cur);
    start.setDate(cur.getDate() - cur.getDay());
    start.setHours(0,0,0,0);
    const days = Array.from({ length:7 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d;
    });

    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
        {days.map((date, i) => {
          const bks     = dayBks(filtered, date);
          const isToday = sameDay(date, today);
          const isWknd  = date.getDay() === 5 || date.getDay() === 6;

          return (
            <div key={i} style={{
              borderRadius:12, overflow:"hidden",
              border: isToday ? "2px solid var(--text)" : "1px solid var(--border)",
              background: isWknd ? "rgba(197,172,136,.04)" : "var(--surface)",
              boxShadow: isToday ? "0 4px 16px rgba(0,0,0,.10)" : "0 1px 4px rgba(0,0,0,.04)",
            }}>
              {/* Header */}
              <div style={{
                background: isToday ? "var(--text)" : "var(--th-bg)",
                padding:"10px 6px 8px", textAlign:"center",
              }}>
                <div style={{ fontSize:11, fontWeight:600, color: isToday ? "var(--bg)" : "var(--text2)", marginBottom:3 }}>
                  {DAYS[date.getDay()]}
                </div>
                <div style={{ fontSize:22, fontWeight:900, color: isToday ? "var(--bg)" : "var(--text)", lineHeight:1 }}>
                  {date.getDate()}
                </div>
                <div style={{ fontSize:10, color: isToday ? "rgba(255,255,255,.7)" : "var(--text3)", marginTop:2 }}>
                  {MONTHS[date.getMonth()]}
                </div>
                {bks.length > 0 && (
                  <div style={{
                    display:"inline-block", marginTop:6, fontSize:10, fontWeight:700,
                    background: isToday ? "rgba(255,255,255,.2)" : "var(--text)",
                    color: isToday ? "var(--bg)" : "var(--bg)",
                    borderRadius:99, padding:"2px 10px",
                  }}>{bks.length} حجز</div>
                )}
              </div>

              {/* Bookings list */}
              <div style={{ padding:6, minHeight:120 }}>
                {bks.length === 0
                  ? <div style={{ fontSize:11, color:"var(--text3)", textAlign:"center", marginTop:20 }}>—</div>
                  : bks.map((b, j) => {
                      const cfg = ST[b.status] || ST.confirmed;
                      return (
                        <div key={j} title={`${b.guest}\n${b.chalet}\n${Number(b.price).toLocaleString()} ر`} style={{
                          borderRadius:8, padding:"7px 9px", marginBottom:5,
                          background: cfg.bar,
                          borderRight:`3px solid ${cfg.dot}`,
                        }}>
                          <div style={{ fontSize:12, fontWeight:700, color:cfg.text, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                            {b.guest}
                          </div>
                          <div style={{ fontSize:10, color:cfg.text, opacity:.75, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis", marginTop:2 }}>
                            {b.chalet}
                          </div>
                          <div style={{ marginTop:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{
                              fontSize:9, fontWeight:700,
                              background: cfg.pill, color: cfg.pillTxt,
                              borderRadius:99, padding:"1px 7px",
                            }}>{cfg.label}</span>
                            <span style={{ fontSize:10, color:cfg.text, fontWeight:700 }}>
                              {Number(b.price).toLocaleString()} ر
                            </span>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  /* ── Day detail panel ────────────────────────────────────────────────── */
  const selBks = selDay ? dayBks(filtered, selDay) : [];

  const headerLabel = view === "month"
    ? `${MONTHS[m]} ${y}`
    : (() => {
        const s = new Date(cur); s.setDate(cur.getDate() - cur.getDay());
        const e = new Date(s); e.setDate(s.getDate() + 6);
        return `${s.getDate()} — ${e.getDate()} ${MONTHS[e.getMonth()]} ${y}`;
      })();

  const activeCount = filtered.filter(b => b.status !== "cancelled").length;

  return (
    <div className="card" style={{ overflow:"hidden", marginBottom:20 }}>

      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div style={{
        padding:"14px 18px", borderBottom:"1px solid var(--border)",
        background:"var(--th-bg)",
        display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:10,
      }}>
        {/* Navigation */}
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button className="btn" onClick={prev} style={{
            background:"var(--surface)", color:"var(--text)",
            border:"1px solid var(--border2)", padding:"6px 14px", fontSize:16, fontWeight:400,
          }}>‹</button>
          <div style={{ fontWeight:800, color:"var(--text)", fontSize:15, minWidth:160, textAlign:"center" }}>
            {headerLabel}
          </div>
          <button className="btn" onClick={next} style={{
            background:"var(--surface)", color:"var(--text)",
            border:"1px solid var(--border2)", padding:"6px 14px", fontSize:16, fontWeight:400,
          }}>›</button>
          <button className="btn" onClick={() => setCur(new Date())} style={{
            background:"var(--surface)", color:"var(--text2)",
            border:"1px solid var(--border2)", padding:"6px 12px", fontSize:12,
          }}>اليوم</button>
        </div>

        {/* Filters + view toggle */}
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <select className="inp" style={{ width:"auto", fontSize:12, padding:"6px 10px" }}
            value={selCh} onChange={e => setSelCh(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select className="inp" style={{ width:"auto", fontSize:12, padding:"6px 10px" }}
            value={selSt} onChange={e => setSelSt(e.target.value)}>
            <option value="الكل">كل الحالات</option>
            {Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>

          <div style={{ display:"flex", gap:2, background:"var(--surface)", borderRadius:10, border:"1px solid var(--border2)", overflow:"hidden" }}>
            {(["month","week"] as const).map(v => (
              <button key={v} className="btn" onClick={() => setView(v)} style={{
                background: view===v ? "var(--text)" : "transparent",
                color:      view===v ? "var(--bg)"   : "var(--text2)",
                border:"none", padding:"6px 14px", fontSize:12, borderRadius:0,
              }}>
                {v === "month" ? "شهري" : "أسبوعي"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar body ─────────────────────────────────────── */}
      <div style={{ padding:"14px 14px 8px" }}>
        {view === "month" ? <MonthView/> : <WeekView/>}
      </div>

      {/* ── Day detail panel ──────────────────────────────────── */}
      {selDay && selBks.length > 0 && (
        <div style={{
          margin:"0 14px 14px", borderRadius:12, padding:"14px 16px",
          background:"var(--th-bg)", border:"1px solid var(--border2)",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontWeight:800, color:"var(--text)", fontSize:14 }}>
              {selDay.toLocaleDateString("ar-SA", { weekday:"long", day:"numeric", month:"long" })}
            </span>
            <button onClick={() => setSelDay(null)} style={{
              background:"none", border:"none", cursor:"pointer", fontSize:18, color:"var(--text3)",
            }}>×</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:10 }}>
            {selBks.map((b, i) => {
              const cfg = ST[b.status] || ST.confirmed;
              return (
                <div key={i} style={{
                  borderRadius:10, padding:"10px 12px",
                  background:"var(--surface)", border:`1px solid var(--border)`,
                  borderRight:`4px solid ${cfg.dot}`,
                }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 }}>
                    <span style={{ fontWeight:800, color:"var(--text)", fontSize:13 }}>{b.guest}</span>
                    <span style={{
                      fontSize:10, fontWeight:700, borderRadius:99, padding:"2px 8px",
                      background:cfg.pill, color:cfg.pillTxt,
                    }}>{cfg.label}</span>
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
      <div style={{
        padding:"10px 18px 14px",
        display:"flex", alignItems:"center", gap:14, flexWrap:"wrap",
        borderTop:"1px solid var(--border)",
      }}>
        {Object.entries(ST).map(([, cfg]) => (
          <div key={cfg.label} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11 }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:cfg.dot }}/>
            <span style={{ color:"var(--text2)", fontWeight:600 }}>{cfg.label}</span>
          </div>
        ))}
        <div style={{ marginRight:"auto", fontSize:11, color:"var(--text3)", fontWeight:600 }}>
          {activeCount} حجز نشط
        </div>
        {view === "month" && (
          <div style={{ fontSize:10, color:"var(--text3)" }}>
            اضغط على يوم لعرض التفاصيل
          </div>
        )}
      </div>
    </div>
  );
}
