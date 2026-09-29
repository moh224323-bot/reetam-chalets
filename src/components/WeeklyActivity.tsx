import { useState } from "react";
import { Booking } from "../lib/types";
import { B, T, S, SD, SI, SL } from "../lib/colors";

interface Props {
  bookings: Booking[];
  /** فتح تفاصيل حجز (للعرض والتعديل) عند الضغط على عنصر في لوحة تفاصيل اليوم */
  onSelectBooking?: (b: Booking) => void;
}

const DAYS = ["أح", "اث", "ثل", "أر", "خم", "جم", "سب"];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function WeeklyActivity({ bookings, onSelectBooking }: Props) {
  const [selDay, setSelDay] = useState<string | null>(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d; });

  const activeStatuses = ["confirmed", "completed"];
  const dayData = days.map(d => {
    const dStr = d.toISOString().slice(0, 10);
    const checkins = bookings.filter(b => activeStatuses.includes(b.status) && b.date_from === dStr);
    const checkouts = bookings.filter(b => (b.status === "confirmed" || b.status === "completed" || b.status === "pending") && b.date_to === dStr);
    return { d, dStr, checkins, checkouts };
  });

  const maxCount = Math.max(...dayData.map(c => Math.max(c.checkins.length, c.checkouts.length)), 1);
  const totalIn = dayData.reduce((s, c) => s + c.checkins.length, 0);
  const totalOut = dayData.reduce((s, c) => s + c.checkouts.length, 0);
  const BAR_MAX = 70;

  const selected = selDay ? dayData.find(c => c.dStr === selDay) : null;

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
        {dayData.map(({ d, dStr, checkins, checkouts }, i) => {
          const isToday = sameDay(d, today);
          const isSel = selDay === dStr;
          const total = checkins.length + checkouts.length;
          const inH = checkins.length > 0 ? Math.max((checkins.length / maxCount) * BAR_MAX, 6) : 0;
          const outH = checkouts.length > 0 ? Math.max((checkouts.length / maxCount) * BAR_MAX, 6) : 0;
          return (
            <button
              key={i}
              onClick={() => setSelDay(isSel ? null : dStr)}
              style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0,
                background: isSel ? "rgba(197,172,136,.15)" : "transparent", border: "none", borderRadius: 10,
                padding: "4px 2px", cursor: total > 0 ? "pointer" : "default", fontFamily: "'Tajawal',sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: BAR_MAX }}>
                <div style={{ width: 9, height: inH, background: SD, borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
                <div style={{ width: 9, height: outH, background: S, borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
              </div>
              <div style={{ fontSize: 10, fontWeight: 600, color: total ? B : SI, minHeight: 14 }}>{total || ""}</div>
              <div style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: isToday ? B : isSel ? "rgba(65,53,35,.12)" : "transparent",
                color: isToday ? S : B,
                border: isSel && !isToday ? `1.5px solid ${B}` : "none",
                fontSize: 13, fontWeight: 800,
              }}>{d.getDate()}</div>
              <div style={{ fontSize: 10, color: T, fontWeight: 600 }}>{DAYS[d.getDay()]}</div>
            </button>
          );
        })}
      </div>

      {selected && (selected.checkins.length > 0 || selected.checkouts.length > 0) && (
        <div style={{ margin: "0 14px 14px", borderRadius: 12, padding: "12px 14px", background: SL, border: "1px solid rgba(197,172,136,.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontWeight: 800, color: B, fontSize: 13 }}>
              {selected.d.toLocaleDateString("ar-SA-u-ca-gregory", { weekday: "long", day: "numeric", month: "long" })}
            </span>
            <button onClick={() => setSelDay(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: SI }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selected.checkins.map(b => (
              <div key={"in" + b.id} onClick={() => onSelectBooking?.(b)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                background: "#fff", borderRight: `3px solid ${SD}`, cursor: onSelectBooking ? "pointer" : "default",
              }}>
                <span style={{ fontSize: 13 }}>🟢</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: B, fontSize: 12.5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{b.guest}</div>
                  <div style={{ fontSize: 11, color: T }}>{b.chalet} · دخول</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T, flexShrink: 0 }}>{Number(b.price).toLocaleString() + " ر"}</div>
              </div>
            ))}
            {selected.checkouts.map(b => (
              <div key={"out" + b.id} onClick={() => onSelectBooking?.(b)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8,
                background: "#fff", borderRight: `3px solid ${S}`, cursor: onSelectBooking ? "pointer" : "default",
              }}>
                <span style={{ fontSize: 13 }}>🟡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: B, fontSize: 12.5, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{b.guest}</div>
                  <div style={{ fontSize: 11, color: T }}>{b.chalet} · خروج</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T, flexShrink: 0 }}>{Number(b.price).toLocaleString() + " ر"}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ padding: "10px 16px 14px", borderTop: "1px solid rgba(197,172,136,.15)", display: "flex", justifyContent: "center", gap: 18, fontSize: 12, color: T, fontWeight: 600 }}>
        <span>🟢 {totalIn} دخول هذا الأسبوع</span>
        <span>🟡 {totalOut} خروج هذا الأسبوع</span>
      </div>
      {!selDay && (totalIn > 0 || totalOut > 0) && (
        <div style={{ padding: "0 16px 12px", textAlign: "center", fontSize: 10, color: SI }}>اضغط على يوم لعرض التفاصيل والتعديل</div>
      )}
    </div>
  );
}
