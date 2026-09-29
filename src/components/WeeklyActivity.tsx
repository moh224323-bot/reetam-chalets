import { Booking } from "../lib/types";
import { B, T, S, SD, SI, SL } from "../lib/colors";

interface Props {
  bookings: Booking[];
}

const DAYS = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function WeeklyActivity({ bookings }: Props) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

  const activeStatuses = ["confirmed", "completed"];
  const counts = days.map(d => {
    const dStr = d.toISOString().slice(0, 10);
    const checkins = bookings.filter(b => activeStatuses.includes(b.status) && b.date_from === dStr).length;
    const checkouts = bookings.filter(b => (b.status === "confirmed" || b.status === "completed" || b.status === "pending") && b.date_to === dStr).length;
    return { d, checkins, checkouts };
  });

  const maxCount = Math.max(...counts.map(c => Math.max(c.checkins, c.checkouts)), 1);
  const totalIn = counts.reduce((s, c) => s + c.checkins, 0);
  const totalOut = counts.reduce((s, c) => s + c.checkouts, 0);
  const BAR_MAX = 70;

  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "14px 16px", borderBottom: "2px solid rgba(197,172,136,.2)", display: "flex", justifyContent: "space-between", alignItems: "center", background: SL }}>
        <span style={{ fontWeight: 800, color: B, fontSize: 14 }}>📅 نشاط الأسبوع</span>
        <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: T }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: SD, display: "inline-block" }} />دخول</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, color: T }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: S, display: "inline-block" }} />خروج</span>
        </div>
      </div>

      <div style={{ display: "flex", padding: "18px 10px 14px", gap: 4 }}>
        {counts.map(({ d, checkins, checkouts }, i) => {
          const isToday = sameDay(d, today);
          const inH = checkins > 0 ? Math.max((checkins / maxCount) * BAR_MAX, 6) : 0;
          const outH = checkouts > 0 ? Math.max((checkouts / maxCount) * BAR_MAX, 6) : 0;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: BAR_MAX }}>
                <div style={{ width: 9, height: inH, background: SD, borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
                <div style={{ width: 9, height: outH, background: S, borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: checkins || checkouts ? B : SI, minHeight: 14 }}>
                {(checkins || checkouts) ? (checkins + checkouts) : ""}
              </div>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday ? B : "transparent", color: isToday ? S : B,
                fontSize: 13, fontWeight: 800,
              }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, color: T, fontWeight: 600 }}>{DAYS[d.getDay()]}</div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: "10px 16px 14px", borderTop: "1px solid rgba(197,172,136,.15)", display: "flex", justifyContent: "center", gap: 18, fontSize: 12, color: T, fontWeight: 600 }}>
        <span>🟢 {totalIn} دخول هذا الأسبوع</span>
        <span>🟡 {totalOut} خروج هذا الأسبوع</span>
      </div>
    </div>
  );
}
