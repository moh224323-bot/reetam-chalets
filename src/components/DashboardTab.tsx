import { Booking, MaintenanceRequest, WalletTransaction, CleaningTransaction, Chalet } from "../lib/types";
import { B, BD, T, TD, SA, SD, SI, SL, S, W } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { formatDate, nightsBetween } from "../lib/db";
import { Bdg, DataTable } from "./ui";

interface ChaletStat {
  id:   number;
  name: string;
  loc:  string;
  rev:  number;
  ins:  number;
  mop:  number;
  mip:  number;
  mdn:  number;
  mtot: number;
}

interface Props {
  bookings:    Booking[];
  maintenance: MaintenanceRequest[];
  wallet:      WalletTransaction[];
  cleaning:    CleaningTransaction[];
  chalets:     Chalet[];
  cStats:      ChaletStat[];
  totRev:      number;
  walletBal:   number;
  cleaningBal: number;
  mCost:       number;
  actB:        number;
  opM:         number;
  onCheckout:  (b: Booking) => void;
}

export default function DashboardTab({ bookings, maintenance, wallet, cleaning, chalets, cStats, totRev, walletBal, cleaningBal, mCost, actB, opM, onCheckout }: Props) {
  const fd = formatDate;
  const fn = nightsBetween;

  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const checkouts = bookings.filter(b => {
    if (b.status !== "confirmed" && b.status !== "pending") return false;
    if (!b.date_to) return false;
    const to = new Date(b.date_to);
    const toLocal = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    return toLocal <= today && toLocal >= yesterday;
  });

  const upcoming = bookings
    .filter(b => b.status !== "cancelled" && b.status !== "completed")
    .map(b => {
      const from = new Date(b.date_from);
      const fromLocal = new Date(from.getFullYear(), from.getMonth(), from.getDate());
      return { ...b, daysLeft: Math.round((fromLocal.getTime() - today.getTime()) / 86400000) };
    })
    .filter(b => b.daysLeft >= -1)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 8);

  const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const currentYear = now.getFullYear();
  const monthlyData = months.map((_, mi) =>
    bookings.filter(b => b.status !== "cancelled" && b.date_from && new Date(b.date_from).getFullYear() === currentYear && new Date(b.date_from).getMonth() === mi)
      .reduce((s, b) => s + Number(b.price), 0)
  );
  const maxVal   = Math.max(...monthlyData, 1);
  const curMonth = now.getMonth();

  return (
    <div>
      {/* بطاقات الإحصاء */}
      <div className="sg" style={{ marginBottom: 20 }}>
        {[
          { l:"إجمالي الإيرادات",  v:totRev.toLocaleString()+" ر",      i:"💵", bg:`linear-gradient(135deg,${T},${TD})`,                                               c:"#fff" },
          { l:"محفظة التأمين",     v:walletBal.toLocaleString()+" ر",    i:"🛡️", bg:`linear-gradient(135deg,${B},${BD})`,                                               c:S     },
          { l:"محفظة النظافة",     v:cleaningBal.toLocaleString()+" ر",  i:"🧹", bg:"linear-gradient(135deg,#3D7A5A,#2A5E42)",                                          c:"#fff" },
          { l:"تكاليف الصيانة",   v:mCost.toLocaleString()+" ر",         i:"🔧", bg:`linear-gradient(135deg,${SA},${SD})`,                                              c:"#fff" },
          { l:"حجوزات نشطة",      v:String(actB),                         i:"📅", bg:W,                                                                                  c:B     },
          { l:"صيانة مفتوحة",     v:String(opM),                          i:"⚠️", bg:opM>0?"#FFF5F5":W,                                                                  c:opM>0?"#8B3A3A":B },
          { l:"عدد الشاليهات",    v:String(chalets.length),               i:"🏠", bg:W,                                                                                  c:B     },
        ].map((s, i) => (
          <div key={i} style={{ background:s.bg, borderRadius:12, padding:16, boxShadow:"0 4px 14px rgba(65,53,35,.1)", border:s.bg===W||s.bg==="#FFF5F5"?"1px solid rgba(197,172,136,.25)":"none" }}>
            <div style={{ fontSize:20, marginBottom:5 }}>{s.i}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:11, color:s.bg===W||s.bg==="#FFF5F5"?T:"rgba(255,255,255,.8)", marginTop:3 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* تسجيل الخروج اليوم */}
      {checkouts.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16, border:"2px solid #8B3A3A" }}>
          <div style={{ padding:"12px 16px", borderBottom:"1px solid rgba(139,58,58,.2)", fontWeight:700, color:"#8B3A3A", fontSize:14, background:"#FFF5F5", display:"flex", alignItems:"center", gap:8 }}>
            <span>🚪 تسجيل الخروج اليوم</span>
            <span style={{ background:"#8B3A3A", color:"#fff", borderRadius:20, fontSize:11, padding:"2px 8px" }}>{checkouts.length}</span>
          </div>
          <div style={{ padding:"8px 0" }}>
            {checkouts.map((b, i) => (
              <div key={b.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:i<checkouts.length-1?"1px solid rgba(197,172,136,.1)":"none" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, color:B, fontSize:14 }}>{b.guest}</div>
                  <div style={{ fontSize:12, color:T, marginTop:2 }}>{b.chalet} · {fd(b.date_to)}</div>
                </div>
                <div style={{ fontWeight:800, color:T, fontSize:15 }}>{Number(b.price).toLocaleString()+" ر"}</div>
                <button className="btn" onClick={() => onCheckout(b)} style={{ background:"linear-gradient(135deg,#8B3A3A,#6B2A2A)", color:"#fff", padding:"10px 18px", fontSize:13, flexShrink:0 }}>
                  🚪 تسجيل خروج
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الحجوزات القادمة */}
      {upcoming.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL, display:"flex", alignItems:"center", gap:8 }}>
            <span>🔔 الحجوزات القادمة</span>
            <span style={{ background:T, color:"#fff", borderRadius:20, fontSize:11, padding:"2px 7px" }}>{upcoming.length}</span>
          </div>
          <div style={{ padding:"8px 0" }}>
            {upcoming.map((b, i) => {
              const isCheckin  = b.daysLeft < 0;
              const isToday    = b.daysLeft === 0;
              const isTomorrow = b.daysLeft === 1;
              const urgColor   = isCheckin?"#8B6914":isToday?"#8B3A3A":isTomorrow?"#8B6914":b.daysLeft<=3?SD:T;
              const urgBg      = isCheckin?"#F5EFD6":isToday?"#F5E6E6":isTomorrow?"#FEF3C7":b.daysLeft<=3?"#EEF0E9":SL;
              const urgLabel   = isCheckin?"داخل الآن":isToday?"اليوم":isTomorrow?"غداً":b.daysLeft+" يوم";
              return (
                <div key={b.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderBottom:i<upcoming.length-1?"1px solid rgba(197,172,136,.1)":"none", background:isToday?"rgba(139,58,58,.03)":"transparent" }}>
                  <span style={{ background:urgBg, color:urgColor, borderRadius:8, padding:"4px 10px", fontSize:12, fontWeight:800, whiteSpace:"nowrap", minWidth:60, textAlign:"center", flexShrink:0 }}>{urgLabel}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:B, fontSize:14 }}>{b.guest}</div>
                    <div style={{ fontSize:12, color:T, marginTop:2 }}>{b.chalet}</div>
                  </div>
                  <div style={{ flexShrink:0, textAlign:"left" }}>
                    <div style={{ fontWeight:700, color:T, fontSize:14 }}>{Number(b.price).toLocaleString()+" ر"}</div>
                    <div style={{ fontSize:11, color:SI, marginTop:1 }}>{fn(b.date_from, b.date_to)+" ليلة"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* رسم بياني شهري */}
      <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
        <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>📈 الإيرادات الشهرية {currentYear}</div>
        <div style={{ padding:16 }}>
          <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:120 }}>
            {monthlyData.map((v, i) => {
              const h    = maxVal > 0 ? (v / maxVal) * 100 : 0;
              const isCur = i === curMonth;
              return (
                <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                  {v > 0 && <div style={{ fontSize:9, color:T, fontWeight:600 }}>{(v/1000).toFixed(0)}k</div>}
                  <div style={{ width:"100%", height:h+"%", minHeight:4, background:isCur?`linear-gradient(180deg,${T},${TD})`:"linear-gradient(180deg,rgba(87,109,111,.4),rgba(87,109,111,.2))", borderRadius:"4px 4px 0 0", border:isCur?"2px solid "+T:"none" }}/>
                  <div style={{ fontSize:9, color:isCur?T:SI, fontWeight:isCur?700:400, whiteSpace:"nowrap" }}>{months[i].slice(0,3)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop:8, fontSize:11, color:T, textAlign:"center" }}>
            {monthlyData.reduce((s,v) => s+v, 0) > 0
              ? "إجمالي "+currentYear+": "+monthlyData.reduce((s,v) => s+v, 0).toLocaleString()+" ريال"
              : "لا توجد إيرادات مسجلة"}
          </div>
        </div>
      </div>

      {/* أداء الشاليهات + آخر الحجوزات */}
      <div className="g2">
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>🏠 أداء الشاليهات</div>
          <DataTable heads={["الشاليه","الإيرادات","التأمين","صيانة"]}
            rows={cStats.map((c, i) => (
              <tr key={i}>
                <td style={{ fontWeight:600 }}>{c.name}</td>
                <td style={{ color:T, fontWeight:700 }}>{c.rev.toLocaleString()}</td>
                <td style={{ color:B, fontWeight:700 }}>{c.ins.toLocaleString()}</td>
                <td><Bdg bg={c.mop>0?"#F5E6E6":"#EEF0E9"} color={c.mop>0?"#8B3A3A":SD}>{String(c.mtot)}</Bdg></td>
              </tr>
            ))}
          />
        </div>
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>📅 آخر الحجوزات</div>
          <DataTable heads={["الضيف","الشاليه","الوصول","الحالة"]}
            rows={bookings.slice(-4).reverse().map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight:600 }}>{b.guest}</td>
                <td style={{ fontSize:12 }}>{b.chalet}</td>
                <td style={{ fontSize:12 }}>{fd(b.date_from)}</td>
                <td><Bdg bg={BOOKING_STATUS[b.status]?.bg||"#eee"} color={BOOKING_STATUS[b.status]?.color||"#333"}>{BOOKING_STATUS[b.status]?.label||b.status}</Bdg></td>
              </tr>
            ))}
          />
        </div>
      </div>
    </div>
  );
}
