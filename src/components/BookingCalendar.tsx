import { useState } from "react";
import { Booking } from "../lib/types";
import { B, S, T, W, SI, SL } from "../lib/colors";

interface Props {
  bookings: Booking[];
  names: string[];
}

const STATUS_COLORS = {
  confirmed: { bg:"#1a3a4a", border:"#4A9BAF", text:"#e0f4f8", grad:"linear-gradient(135deg,#1a3a4a,#1f4d5e)" },
  pending:   { bg:"#3d2e00", border:"#D4A017", text:"#FFE082", grad:"linear-gradient(135deg,#3d2e00,#4a3800)" },
  completed: { bg:"#1a2e1a", border:"#4CAF50", text:"#A5D6A7", grad:"linear-gradient(135deg,#1a2e1a,#1e3a1e)" },
};

const MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
const DAY_NAMES   = ["أح","اث","ثل","أر","خم","جم","سب"];

export default function BookingCalendar({ bookings, names }: Props) {
  const [view, setView]       = useState<"month"|"week">("month");
  const [curDate, setCurDate] = useState(new Date());
  const [selCh, setSelCh]     = useState("الكل");

  const y = curDate.getFullYear();
  const m = curDate.getMonth();
  const filtered = bookings.filter(b =>
    b.status === "completed" && (selCh === "الكل" || b.chalet === selCh)
  );

  function getBookingsForDay(date: Date) {
    return filtered.filter(b => {
      if (!b.date_from || !b.date_to) return false;
      const from = new Date(b.date_from); from.setHours(0, 0, 0, 0);
      const to   = new Date(b.date_to);   to.setHours(23, 59, 59, 999);
      return date >= from && date <= to;
    });
  }

  function prev() {
    if (view === "month") setCurDate(new Date(y, m - 1, 1));
    else { const d = new Date(curDate); d.setDate(d.getDate() - 7); setCurDate(d); }
  }
  function next() {
    if (view === "month") setCurDate(new Date(y, m + 1, 1));
    else { const d = new Date(curDate); d.setDate(d.getDate() + 7); setCurDate(d); }
  }

  function MonthView() {
    const firstDay    = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return (
      <div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:6 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:800, color:B, padding:"6px 0", background:"rgba(197,172,136,.08)", borderRadius:6 }}>{d}</div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
          {days.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight:80 }}/>;
            const date = new Date(y, m, d); date.setHours(0, 0, 0, 0);
            const dayBookings = getBookingsForDay(date);
            const isToday = date.getTime() === today.getTime();
            const hasBk   = dayBookings.length > 0;
            return (
              <div key={i} style={{ minHeight:80, padding:"5px 4px", borderRadius:10, background:isToday?"rgba(197,172,136,.12)":hasBk?"rgba(87,109,111,.04)":"#fafafa", border:isToday?"2px solid "+B:"1px solid rgba(197,172,136,.18)", boxShadow:hasBk?"0 1px 4px rgba(0,0,0,.06)":"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                  <span style={{ fontSize:12, fontWeight:isToday?900:600, color:isToday?"#fff":B, background:isToday?B:"transparent", borderRadius:isToday?"50%":"0", width:isToday?20:undefined, height:isToday?20:undefined, display:"flex", alignItems:"center", justifyContent:"center" }}>{d}</span>
                  {hasBk && <span style={{ fontSize:9, background:B, color:S, borderRadius:99, padding:"1px 5px", fontWeight:700 }}>{dayBookings.length}</span>}
                </div>
                {dayBookings.slice(0, 2).map((b, j) => {
                  const sc = STATUS_COLORS[b.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.confirmed;
                  const isStart = new Date(b.date_from).toDateString() === date.toDateString();
                  return (
                    <div key={j} style={{ background:sc.grad||sc.bg, borderRight:"3px solid "+sc.border, borderRadius:5, padding:"2px 5px", fontSize:9, color:sc.text, fontWeight:700, marginBottom:2, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>
                      {isStart ? "▶ " : ""}{b.guest}
                      <div style={{ fontSize:8, opacity:.75, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{b.chalet}</div>
                    </div>
                  );
                })}
                {dayBookings.length > 2 && <div style={{ fontSize:9, color:B, fontWeight:700, textAlign:"center", marginTop:1 }}>+{dayBookings.length - 2} أكثر</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function WeekView() {
    const startOfWeek = new Date(curDate);
    startOfWeek.setDate(curDate.getDate() - curDate.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const days = Array.from({ length:7 }, (_, i) => { const d = new Date(startOfWeek); d.setDate(startOfWeek.getDate() + i); return d; });
    const today = new Date(); today.setHours(0, 0, 0, 0);

    return (
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
        {days.map((date, i) => {
          const dayBookings = getBookingsForDay(date);
          const isToday     = date.getTime() === today.getTime();
          return (
            <div key={i} style={{ borderRadius:12, overflow:"hidden", border:isToday?"2px solid "+B:"1px solid rgba(197,172,136,.2)", boxShadow:isToday?"0 2px 12px rgba(0,0,0,.1)":"none" }}>
              <div style={{ background:isToday?B:SL, padding:"8px 4px", textAlign:"center" }}>
                <div style={{ fontSize:10, fontWeight:700, color:isToday?S:T, marginBottom:2 }}>{DAY_NAMES[i]}</div>
                <div style={{ fontSize:18, fontWeight:900, color:isToday?S:B }}>{date.getDate()}</div>
                {dayBookings.length > 0 && <div style={{ fontSize:9, background:isToday?"rgba(255,255,255,.2)":"rgba(87,109,111,.15)", color:isToday?S:T, borderRadius:99, padding:"1px 6px", marginTop:2, display:"inline-block", fontWeight:700 }}>{dayBookings.length} حجز</div>}
              </div>
              <div style={{ padding:5, minHeight:90, background:W }}>
                {dayBookings.length === 0
                  ? <div style={{ fontSize:10, color:SI, textAlign:"center", marginTop:12, opacity:.5 }}>فارغ</div>
                  : dayBookings.map((b, j) => {
                    const sc = STATUS_COLORS[b.status as keyof typeof STATUS_COLORS] || STATUS_COLORS.confirmed;
                    return (
                      <div key={j} style={{ background:sc.grad||sc.bg, borderRight:"3px solid "+sc.border, borderRadius:6, padding:"4px 6px", marginBottom:3, fontSize:10, color:sc.text, fontWeight:700 }}>
                        <div style={{ overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{b.guest}</div>
                        <div style={{ fontSize:9, opacity:.8, overflow:"hidden", whiteSpace:"nowrap", textOverflow:"ellipsis" }}>{b.chalet}</div>
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

  return (
    <div className="card" style={{ overflow:"hidden", marginBottom:20 }}>
      <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", background:SL, display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button className="btn" onClick={prev} style={{ background:W, color:B, border:"1px solid rgba(197,172,136,.4)", padding:"5px 10px", fontSize:14 }}>‹</button>
          <div style={{ fontWeight:800, color:B, fontSize:14, minWidth:120, textAlign:"center" }}>
            {view === "month" ? MONTH_NAMES[m] + " " + y : "الأسبوع · " + curDate.toLocaleDateString("ar-SA")}
          </div>
          <button className="btn" onClick={next} style={{ background:W, color:B, border:"1px solid rgba(197,172,136,.4)", padding:"5px 10px", fontSize:14 }}>›</button>
        </div>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          <select className="inp" style={{ width:"auto", fontSize:12, padding:"5px 8px" }} value={selCh} onChange={e => setSelCh(e.target.value)}>
            <option value="الكل">كل الشاليهات</option>
            {names.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display:"flex", gap:4 }}>
            {(["month","week"] as const).map(v => (
              <button key={v} className="btn" onClick={() => setView(v)} style={{ background:view===v?B:W, color:view===v?S:B, border:"1px solid rgba(197,172,136,.4)", padding:"5px 12px", fontSize:12 }}>
                {v === "month" ? "شهري" : "أسبوعي"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding:12 }}>
        {view === "month" ? <MonthView/> : <WeekView/>}
        <div style={{ display:"flex", gap:10, marginTop:14, flexWrap:"wrap" }}>
          {[{l:"مؤكد",c:"#4A9BAF",bg:"#1a3a4a"},{l:"معلق",c:"#D4A017",bg:"#3d2e00"},{l:"مكتمل",c:"#4CAF50",bg:"#1a2e1a"}].map((s,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, background:"rgba(197,172,136,.08)", borderRadius:20, padding:"4px 10px" }}>
              <div style={{ width:10, height:10, borderRadius:3, background:s.bg, border:"2px solid "+s.c }}/>
              <span style={{ color:B, fontWeight:600 }}>{s.l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
