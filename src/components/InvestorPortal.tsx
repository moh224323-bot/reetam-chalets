// خانة "المستثمر": كشف حساب ربع سنوي للشريك بأسلوب كشوف صناديق الاستثمار —
// صافي الربح ونصيبه فقط (بدون الإيرادات والمصاريف)، مطابقة الرصيد، أداء المحفظة، التوزيعات، والإيضاحات.
// البيانات كلها من investor_portal() على الخادم — حساب المستثمر ما يقدر يقرا أي جدول مباشرة.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { round2 } from "../lib/investorStatement";
import { Icon } from "./ds";

interface PortalStatement { chalet: string; period: string; net: number; closed_at: string; my_pct: number; my_share: number }
interface PortalPayment { chalet: string; amount: number; paid_date: string; method?: string | null; receipt_url?: string | null; note?: string | null }
interface PortalPerf { chalet: string; quarter: string; bookings: number; booked_days: number; occupancy: number; rating: number | null; reviews: number }
interface PortalData {
  name: string;
  holdings: { investor_id: number; chalet: string; pct: number }[];
  statements: PortalStatement[];
  payments: PortalPayment[];
  performance: PortalPerf[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const Q_AR = ["", "الأول", "الثاني", "الثالث", "الرابع"];
/** "2026-10" أو تاريخ كامل → "2026-Q4" */
const quarterOf = (d: string) => d.slice(0, 4) + "-Q" + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1);
const qNum = (q: string) => Number(q.slice(6));
const qYear = (q: string) => q.slice(0, 4);
/** الأشهر الثلاثة بصيغة YYYY-MM */
const monthsOf = (q: string) => [0, 1, 2].map(i => `${qYear(q)}-${String((qNum(q) - 1) * 3 + i + 1).padStart(2, "0")}`);
const qStart = (q: string) => monthsOf(q)[0] + "-01";
const prevQuarter = (q: string) => qNum(q) === 1 ? `${Number(qYear(q)) - 1}-Q4` : `${qYear(q)}-Q${qNum(q) - 1}`;
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const qEndDay = (q: string) => { const [y, m] = monthsOf(q)[2].split("-").map(Number); return new Date(y, m, 0).getDate(); };
const qRange = (q: string) => { const ms = monthsOf(q); return `1 ${MONTHS[Number(ms[0].slice(5)) - 1]} – ${qEndDay(q)} ${MONTHS[Number(ms[2].slice(5)) - 1]} ${qYear(q)}`; };
const fmtDate = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const currentQuarter = () => quarterOf(new Date().toISOString().slice(0, 7));
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0));
/** أسلوب القوائم المالية: السالب بين قوسين */
const money = (n: number, dec = 0) => {
  const v = Math.abs(round2(n)).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return n < 0 ? `(${v})` : v;
};
const tone = (n: number) => (n < 0 ? "neg" : n > 0 ? "pos" : "");

const CSS = `
.ivs{--iv-gold:var(--gold,#B88A4A);max-width:1180px;margin:0 auto;padding:26px 30px 56px}
.ivs .n{font-variant-numeric:tabular-nums lining-nums;direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.ivs .cur{font-size:.68em;color:var(--text3);font-weight:500;margin-inline-start:4px}
.ivs .pos{color:var(--ok)}.ivs .neg{color:var(--bad)}.ivs .mut{color:var(--text3)}
.ivs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap;padding-bottom:20px;border-bottom:1px solid var(--border2,var(--border));margin-bottom:20px}
.ivs-eyebrow{font-size:12.5px;color:var(--iv-gold);font-weight:700}
.ivs-head h1{font-family:var(--f-display);font-size:28px;font-weight:800;margin:2px 0 6px;color:var(--text)}
.ivs-meta{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;color:var(--text2);align-items:center}
.ivs-meta b{color:var(--text);font-weight:600}
.ivs-status{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;padding:4px 10px;border-radius:99px}
.ivs-status.ok{background:var(--ok-bg);color:var(--ok)}.ivs-status.wait{background:var(--warn-bg);color:var(--warn)}
.ivs-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ivs-sel{display:flex;border:1px solid var(--border);border-radius:11px;overflow:hidden;background:var(--surface)}
.ivs-sel button{border:0;background:none;font:inherit;font-size:13px;color:var(--text2);padding:8px 13px;cursor:pointer}
.ivs-sel button+button{border-inline-start:1px solid var(--line)}
.ivs-sel button.on{background:var(--brand);color:var(--brand-fg,#fff);font-weight:600}
.ivs-btn{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:11px;padding:8px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.ivs-kpis{display:grid;grid-template-columns:1.25fr 1fr 1fr 1fr;border:1px solid var(--border);border-radius:16px;background:var(--surface);overflow:hidden;margin-bottom:18px}
.ivs-kpi{padding:18px 20px}
.ivs-kpi+.ivs-kpi{border-inline-start:1px solid var(--line)}
.ivs-kpi .l{font-size:12.5px;color:var(--text2);font-weight:600}
.ivs-kpi .v{font-family:var(--f-display);font-size:26px;font-weight:700;margin-top:6px;line-height:1.25;color:var(--text)}
.ivs-kpi .s{font-size:12px;color:var(--text3);margin-top:6px}
.ivs-kpi.lead{background:#2E2117;color:#fff}
.ivs-kpi.lead .l{color:#E3D2B8}.ivs-kpi.lead .v{color:#E7C68F;font-size:32px}.ivs-kpi.lead .s,.ivs-kpi.lead .cur{color:#C9B79E}
.ivs-kpi.lead .v.neg{color:#F2A493}
.ivs-chip{display:inline-block;font-size:11.5px;font-weight:700;padding:1px 7px;border-radius:6px}
.ivs-chip.up{background:var(--ok-bg);color:var(--ok)}.ivs-chip.dn{background:var(--bad-bg);color:var(--bad)}
.ivs-row{display:grid;grid-template-columns:1fr 1.15fr;gap:18px;margin-bottom:18px}
.ivs-panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:18px 20px;margin-bottom:18px}
.ivs-row .ivs-panel{margin-bottom:0}
.ivs-ph{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:12px;flex-wrap:wrap}
.ivs-ph h2{font-size:15.5px;font-weight:700;color:var(--text)}
.ivs-ph span{font-size:12px;color:var(--text3)}
.ivs-ref{font-size:11px;color:var(--iv-gold);font-weight:700;vertical-align:super;margin-inline-start:2px}
.ivs-recon{width:100%;border-collapse:collapse}
.ivs-recon td{padding:10px 4px;border-bottom:1px solid var(--line);font-size:14px;color:var(--text)}
.ivs-recon td:last-child{text-align:left;font-weight:600}
.ivs-recon small{display:block;color:var(--text3);font-size:11.5px}
.ivs-recon tr.total td{border-bottom:0;border-top:2px solid var(--text);font-weight:800;font-size:15px;padding-top:12px}
.ivs-recon tr.total td:last-child{font-family:var(--f-display);font-size:19px}
.ivs-chart{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.ivs-cb{display:grid;grid-template-rows:auto 112px 38px auto;justify-items:center}
.ivs-cb .a{font-weight:700;font-size:14px;margin-bottom:6px}
.ivs-cb .u,.ivs-cb .d{width:100%;display:flex;justify-content:center}
.ivs-cb .u{align-items:flex-end;border-bottom:1px solid var(--border)}
.ivs-cb .d{align-items:flex-start}
.ivs-cb i{display:block;width:44%;max-width:84px;max-height:100%;background:var(--brand);border-radius:7px 7px 2px 2px}
.ivs-cb .d i{background:var(--bad);border-radius:2px 2px 7px 7px}
.ivs-cb .m{font-size:12.5px;color:var(--text2)}
.ivs-cb .st{font-size:11px;color:var(--text3)}
.ivs-scroll{overflow-x:auto;margin:0 -20px;padding:0 20px}
table.ivs-t{width:100%;border-collapse:collapse}
.ivs-t th{font-size:12px;color:var(--text2);font-weight:600;text-align:start;padding:9px 12px;border-bottom:1px solid var(--border);white-space:nowrap;background:var(--th-bg,var(--surface-2))}
.ivs-t td{padding:11px 12px;border-bottom:1px solid var(--line);font-size:14px;white-space:nowrap;color:var(--text)}
.ivs-t .num{text-align:left}
.ivs-t tfoot td{border-bottom:0;border-top:2px solid var(--text);font-weight:800;background:var(--th-bg,var(--surface-2))}
.ivs-t .nm{font-weight:700}
.ivs-t .nm small{display:block;font-weight:500;color:var(--text3);font-size:11.5px}
.ivs-bar{display:flex;align-items:center;gap:8px;justify-content:flex-end}
.ivs-bar .tr{width:70px;height:6px;background:var(--line);border-radius:99px;overflow:hidden}
.ivs-bar .tr b{display:block;height:100%;background:var(--iv-gold)}
.ivs-ins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}
.ivs-in{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:15px 17px;border-top:3px solid var(--iv-gold)}
.ivs-in.good{border-top-color:var(--ok)}.ivs-in.warn{border-top-color:var(--bad)}
.ivs-in b{display:block;font-size:13.5px;margin-bottom:4px;color:var(--text)}
.ivs-in p{font-size:13px;color:var(--text2);line-height:1.7}
.ivs-notes{font-size:12.5px;color:var(--text2);line-height:1.9}
.ivs-notes ol{padding-inline-start:18px}
.ivs-notes li::marker{color:var(--iv-gold);font-weight:700}
.ivs-sign{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px dashed var(--border);font-size:12px;color:var(--text3)}
.ivs-empty{padding:18px;text-align:center;color:var(--text3);font-size:13.5px}
@media (max-width:1100px){.ivs-kpis{grid-template-columns:1fr 1fr}.ivs-kpi:nth-child(3){border-inline-start:0}.ivs-kpi:nth-child(n+3){border-top:1px solid var(--line)}.ivs-row{grid-template-columns:1fr}.ivs-ins{grid-template-columns:1fr}}
@media (max-width:760px){
  .ivs{padding:16px 16px 40px}.ivs-head h1{font-size:23px}.ivs-tools{width:100%}.ivs-sel{flex:1}.ivs-sel button{flex:1;padding:8px 6px}
  .ivs-kpi{padding:14px}.ivs-kpi .v{font-size:21px}.ivs-kpi.lead{grid-column:1/-1}.ivs-kpi.lead .v{font-size:28px}
  .ivs-kpi:nth-child(2){border-inline-start:0}.ivs-kpi:nth-child(n+2){border-top:1px solid var(--line)}.ivs-kpi:nth-child(4){border-inline-start:1px solid var(--line)}
  .ivs-panel{padding:15px}.ivs-scroll{margin:0 -15px;padding:0 15px}.ivs-cb{grid-template-rows:auto 92px 32px auto}
}
@media print{.ivs-tools,.ivs-logout{display:none!important}.ivs{padding:0}.ivs-panel,.ivs-kpis,.ivs-in{break-inside:avoid}}
`;

export default function InvestorPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null | undefined>(undefined);
  const [quarter, setQuarter] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("investor_portal").then(({ data }) => setData((data as PortalData | null) || null));
  }, []);

  const quarters = useMemo(() => {
    const cur = currentQuarter();
    const set = new Set<string>([cur]);
    let q = cur;
    for (let i = 0; i < 3; i++) { q = prevQuarter(q); set.add(q); }
    data?.statements.forEach(s => set.add(quarterOf(s.period)));
    return [...set].sort();
  }, [data]);
  // افتراضياً: آخر ربع فيه كشوف معتمدة، وإلا الربع الحالي
  const q = quarter || (data?.statements[0] ? quarterOf(data.statements[0].period) : currentQuarter());

  const logoutBtn = <button className="ivs-btn ivs-logout" onClick={onLogout}><Icon n="power" s={15} />خروج</button>;

  if (data === undefined) return <div className="ivs"><style>{CSS}</style><div className="ivs-empty">جاري التحميل...</div></div>;
  if (!data) return (
    <div className="ivs" dir="rtl"><style>{CSS}</style>
      <div className="ivs-head"><div><div className="ivs-eyebrow">المستثمر</div><h1>كشف الحساب</h1></div>{logoutBtn}</div>
      <div className="ivs-panel"><div className="ivs-empty">حسابك غير مرتبط بأي شراكة بعد، تواصل مع الإدارة</div></div>
    </div>
  );

  const start = qStart(q);
  const isCurrent = q === currentQuarter();
  const qSt = data.statements.filter(s => quarterOf(s.period) === q);
  const qPay = data.payments.filter(p => quarterOf(p.paid_date) === q);
  const profit = sum(qSt.map(s => s.my_share));
  const paid = sum(qPay.map(p => p.amount));
  const opening = round2(sum(data.statements.filter(s => s.period + "-01" < start).map(s => s.my_share)) - sum(data.payments.filter(p => p.paid_date < start).map(p => p.amount)));
  const closing = round2(opening + profit - paid);
  const expected = data.holdings.length * 3;
  const fullyClosed = !isCurrent && qSt.length >= expected && expected > 0;
  const lastClose = qSt.reduce((m, s) => (s.closed_at > m ? s.closed_at : m), "");
  const stmtNo = `INV-${qYear(q)}-Q${qNum(q)}-${String(data.holdings[0]?.investor_id ?? 0).padStart(3, "0")}`;

  const pq = prevQuarter(q);
  const perfOf = (chalet: string, quarter: string) => data.performance.find(p => p.chalet === chalet && p.quarter === quarter);
  const avgOcc = (quarter: string) => {
    const xs = data.holdings.map(h => perfOf(h.chalet, quarter)).filter(Boolean) as PortalPerf[];
    return xs.length ? Math.round(xs.reduce((s, p) => s + p.occupancy, 0) / xs.length) : null;
  };
  const occ = avgOcc(q), occPrev = avgOcc(pq);

  const rows = data.holdings.map(h => {
    const st = qSt.filter(s => s.chalet === h.chalet);
    const perf = perfOf(h.chalet, q), prev = perfOf(h.chalet, pq);
    return {
      ...h, net: sum(st.map(s => s.net)), share: sum(st.map(s => s.my_share)),
      monthly: monthsOf(q).map(m => st.find(s => s.period === m) || null),
      perf, delta: perf && prev && prev.booked_days > 0 ? perf.occupancy - prev.occupancy : null, isNew: perf && prev && prev.booked_days === 0 && perf.booked_days > 0,
    };
  }).sort((a, b) => b.share - a.share);

  const monthTotals = monthsOf(q).map(m => ({ m, v: sum(qSt.filter(s => s.period === m).map(s => s.my_share)), closed: qSt.some(s => s.period === m) }));
  const maxAbs = Math.max(1, ...monthTotals.map(x => Math.abs(x.v)));

  // قراءة الأداء: ملاحظات تُبنى من الأرقام نفسها
  const insights: { cls: string; title: string; text: string }[] = [];
  const positive = rows.filter(r => r.share > 0);
  if (profit > 0 && positive.length) {
    const top = positive.slice(0, 2);
    const pct = Math.round(top.reduce((s, r) => s + r.share, 0) / profit * 100);
    const best = [...rows].filter(r => r.perf).sort((a, b) => (b.perf!.occupancy - a.perf!.occupancy))[0];
    insights.push({ cls: "good", title: "المحرّك الرئيسي للربح", text: `${top.map(r => r.chalet).join(" و")} ${top.length > 1 ? "حققا معاً" : "حقق"} ${pct}% من صافي ربحك هذا الربع${best?.perf ? `، و${best.chalet} الأعلى إشغالاً بـ ${best.perf.occupancy}%` : ""}.` });
  }
  const losers = rows.filter(r => r.net < 0);
  if (losers.length) {
    const r = losers[0];
    const worst = r.monthly.filter(Boolean).sort((a, b) => a!.net - b!.net)[0];
    insights.push({ cls: "warn", title: "نقطة تحتاج متابعة", text: `${r.chalet} أنهى الربع بصافي سالب ${money(r.net)}${worst && worst.net < 0 ? ` بسبب ${monthLabel(worst.period)} (${money(worst.net)})` : ""}، ويُعوَّض من أرباحه القادمة.` });
  }
  if (occ !== null && occPrev !== null) {
    const d = occ - occPrev;
    insights.push({ cls: "", title: "الاتجاه", text: `متوسط إشغال محفظتك ${d >= 0 ? "ارتفع" : "انخفض"} من ${occPrev}% إلى ${occ}% مقارنة بالربع ${Q_AR[qNum(pq)]}.` });
  }

  return (
    <div className="ivs" dir="rtl">
      <style>{CSS}</style>

      <header className="ivs-head">
        <div>
          <div className="ivs-eyebrow">المستثمر · كشف الحساب الربع سنوي · {data.name}</div>
          <h1>الربع {Q_AR[qNum(q)]} {qYear(q)}</h1>
          <div className="ivs-meta">
            <span>الفترة: <b className="n">{qRange(q)}</b></span>
            <span>رقم الكشف: <b className="n">{stmtNo}</b></span>
            {lastClose && <span>آخر اعتماد: <b className="n">{fmtDate(lastClose)}</b></span>}
            {fullyClosed
              ? <span className="ivs-status ok">✓ معتمد ومُقفل</span>
              : <span className="ivs-status wait">{isCurrent ? "الربع جاري · " : ""}{qSt.length} من {expected} كشف شهري معتمد</span>}
          </div>
        </div>
        <div className="ivs-tools">
          <div className="ivs-sel" role="tablist" aria-label="الربع">
            {quarters.slice(-4).map(x => (
              <button key={x} className={x === q ? "on" : ""} onClick={() => setQuarter(x)} title={qRange(x)}>
                Q{qNum(x)}{x === currentQuarter() ? <span style={{ opacity: .7 }}> (جاري)</span> : null}
              </button>
            ))}
          </div>
          <button className="ivs-btn" onClick={() => window.print()}><Icon n="download" s={15} />تنزيل PDF</button>
          {logoutBtn}
        </div>
      </header>

      <section className="ivs-kpis" aria-label="الملخص">
        <div className="ivs-kpi lead"><div className="l">صافي ربحك المعتمد للربع</div><div className={"v n " + (profit < 0 ? "neg" : "")}>{money(profit)}<span className="cur">ر.س</span></div><div className="s">حصتك من صافي ربح {data.holdings.length} {data.holdings.length > 2 ? "شاليهات" : "شاليه"}</div></div>
        <div className="ivs-kpi"><div className="l">التوزيعات النقدية<span className="ivs-ref">³</span></div><div className="v n">{money(paid)}<span className="cur">ر.س</span></div><div className="s">{profit > 0 ? `نسبة التوزيع ${Math.round(paid / profit * 100)}% من الربح` : qPay.length + " تحويل"}</div></div>
        <div className="ivs-kpi"><div className="l">الرصيد المستحق لك</div><div className={"v n " + tone(Math.min(0, closing))}>{money(closing)}<span className="cur">ر.س</span></div><div className="s">كما في {qEndDay(q)} {MONTHS[Number(monthsOf(q)[2].slice(5)) - 1]} {qYear(q)}</div></div>
        <div className="ivs-kpi"><div className="l">متوسط إشغال المحفظة<span className="ivs-ref">⁵</span></div><div className="v n">{occ ?? 0}%</div><div className="s">{occ !== null && occPrev !== null ? <><span className={"ivs-chip " + (occ >= occPrev ? "up" : "dn")}>{occ >= occPrev ? "▲" : "▼"} {Math.abs(occ - occPrev)} نقطة</span> مقارنة بالربع {Q_AR[qNum(pq)]}</> : "—"}</div></div>
      </section>

      <div className="ivs-row">
        <section className="ivs-panel">
          <div className="ivs-ph"><h2>مطابقة الرصيد</h2><span>حركة حسابك خلال الربع</span></div>
          <table className="ivs-recon"><tbody>
            <tr><td>الرصيد الافتتاحي<small>{fmtDate(start)}</small></td><td className={"n " + tone(Math.min(0, opening))}>{money(opening, 2)}</td></tr>
            <tr><td>يُضاف: صافي الربح المعتمد<span className="ivs-ref">¹</span><small>{monthsOf(q).map(m => MONTHS[Number(m.slice(5)) - 1]).join(" + ")}</small></td><td className={"n " + tone(profit)}>{money(profit, 2)}</td></tr>
            <tr><td>يُخصم: التوزيعات النقدية<span className="ivs-ref">³</span><small>{qPay.length} تحويل</small></td><td className={"n " + (paid ? "neg" : "")}>{paid ? `(${money(paid, 2)})` : "0.00"}</td></tr>
            <tr className="total"><td>الرصيد الختامي المستحق</td><td className="n">{money(closing, 2)}<span className="cur">ر.س</span></td></tr>
          </tbody></table>
        </section>

        <section className="ivs-panel">
          <div className="ivs-ph"><h2>صافي ربحك الشهري</h2><span>بعد كل المصاريف ورسوم الإدارة</span></div>
          <div className="ivs-chart">
            {monthTotals.map(({ m, v, closed }) => {
              const h = Math.max(closed ? 4 : 0, Math.round(Math.abs(v) / maxAbs * 108));
              return (
                <div key={m} className="ivs-cb">
                  <div className={"a n " + tone(v)}>{closed ? money(v) : "—"}</div>
                  <div className="u">{v >= 0 && closed && <i style={{ height: h }} />}</div>
                  <div className="d">{v < 0 && <i style={{ height: Math.min(h, 34) }} />}</div>
                  <div style={{ textAlign: "center" }}><div className="m n">{monthLabel(m)}</div><div className="st">{closed ? "✓ معتمد" : "بانتظار الاعتماد"}</div></div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="ivs-panel">
        <div className="ivs-ph"><h2>المحفظة — أداء الشراكات</h2><span>الأرقام بالريال السعودي · السالب بين قوسين</span></div>
        <div className="ivs-scroll">
          <table className="ivs-t">
            <thead><tr>
              <th>الشاليه</th><th className="num">حصتك</th><th className="num">صافي ربح الشاليه</th><th className="num">نصيبك</th><th className="num">المساهمة في ربحك</th>
              <th className="num">الإشغال</th><th className="num">التغيّر ربعياً</th><th className="num">الحجوزات</th><th className="num">التقييم</th>
            </tr></thead>
            <tbody>{rows.map(r => {
              const contrib = profit !== 0 ? r.share / profit * 100 : 0;
              return (
                <tr key={r.investor_id}>
                  <td className="nm">{r.chalet}{r.isNew && <small>بدأ التشغيل هذا الربع</small>}</td>
                  <td className="num n">{Number(r.pct)}%</td>
                  <td className={"num n " + (r.net < 0 ? "neg" : "")}>{money(r.net)}</td>
                  <td className={"num n " + tone(r.share)}>{money(r.share)}</td>
                  <td className="num"><div className="ivs-bar"><span className={"n " + (contrib < 0 ? "neg" : "")}>{contrib < 0 ? `(${Math.abs(contrib).toFixed(1)}%)` : contrib.toFixed(1) + "%"}</span><div className="tr"><b style={{ width: Math.max(0, Math.min(100, contrib)) + "%" }} /></div></div></td>
                  <td className="num n">{r.perf ? r.perf.occupancy + "%" : "—"}</td>
                  <td className="num">{r.delta === null ? <span className="mut">{r.isNew ? "جديد" : "—"}</span> : <span className={"ivs-chip n " + (r.delta >= 0 ? "up" : "dn")}>{r.delta >= 0 ? "▲" : "▼"} {Math.abs(r.delta)}</span>}</td>
                  <td className="num n">{r.perf?.bookings ?? 0}</td>
                  <td className="num">{r.perf?.rating ? <span className="n">{r.perf.rating} ★</span> : <span className="mut">—</span>}</td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr>
              <td>الإجمالي</td><td /><td className="num n">{money(sum(rows.map(r => r.net)))}</td><td className="num n">{money(profit)}</td><td className="num n">{profit !== 0 ? "100%" : "—"}</td>
              <td className="num n">{occ ?? 0}%</td>
              <td className="num">{occ !== null && occPrev !== null ? <span className={"ivs-chip n " + (occ >= occPrev ? "up" : "dn")}>{occ >= occPrev ? "▲" : "▼"} {Math.abs(occ - occPrev)}</span> : null}</td>
              <td className="num n">{rows.reduce((s, r) => s + (r.perf?.bookings ?? 0), 0)}</td><td />
            </tr></tfoot>
          </table>
        </div>
      </section>

      {insights.length > 0 && (
        <section className="ivs-ins" aria-label="قراءة الأداء">
          {insights.map((x, i) => <div key={i} className={"ivs-in " + x.cls}><b>{x.title}</b><p>{x.text}</p></div>)}
        </section>
      )}

      <section className="ivs-panel">
        <div className="ivs-ph"><h2>التفصيل الشهري لنصيبك</h2><span>صافي الربح × حصتك لكل شهر معتمد</span></div>
        <div className="ivs-scroll">
          <table className="ivs-t">
            <thead><tr><th>الشاليه</th>{monthsOf(q).map(m => <th key={m} className="num n">{monthLabel(m)}</th>)}<th className="num">إجمالي الربع</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.investor_id}>
                <td className="nm">{r.chalet}</td>
                {r.monthly.map((s, i) => <td key={i} className={"num n " + (s && s.my_share < 0 ? "neg" : "")}>{s ? money(s.my_share) : <span className="mut">—</span>}</td>)}
                <td className={"num n " + (r.share < 0 ? "neg" : "")} style={{ fontWeight: 700 }}>{money(r.share)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td>الإجمالي</td>{monthTotals.map(x => <td key={x.m} className={"num n " + (x.v < 0 ? "neg" : "")}>{x.closed ? money(x.v) : "—"}</td>)}<td className="num n">{money(profit)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="ivs-panel">
        <div className="ivs-ph"><h2>التوزيعات النقدية</h2><span>التحويلات المنفّذة لحسابك خلال الربع</span></div>
        {qPay.length === 0 ? <div className="ivs-empty">لا توجد تحويلات في هذا الربع</div> :
          <div className="ivs-scroll">
            <table className="ivs-t">
              <thead><tr><th>التاريخ</th><th>الشاليه</th><th>البيان</th><th>الطريقة</th><th className="num">المبلغ</th><th>الإيصال</th></tr></thead>
              <tbody>{qPay.map((p, i) => (
                <tr key={i}>
                  <td className="n">{fmtDate(p.paid_date)}</td><td>{p.chalet}</td><td>{p.note || "توزيع أرباح"}</td><td>{p.method || "—"}</td>
                  <td className="num n">{money(p.amount, 2)}</td>
                  <td>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer" style={{ color: "var(--iv-gold)", fontWeight: 700 }}>عرض</a> : <span className="mut">—</span>}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan={4}>إجمالي التوزيعات</td><td className="num n">{money(paid, 2)}</td><td /></tr></tfoot>
            </table>
          </div>}
      </section>

      <section className="ivs-panel ivs-notes">
        <div className="ivs-ph"><h2>إيضاحات</h2></div>
        <ol>
          <li><b>صافي الربح</b> = إيرادات الحجوزات المكتملة والمحصّلة فعلاً، ناقص جميع مصاريف الشاليه التشغيلية (إيجار، نظافة، كهرباء، تأمين، اشتراكات) ورسوم الإدارة. نصيبك = صافي الربح × حصتك.</li>
          <li><b>الاعتماد:</b> يُعتمد كل شهر بعد نهايته ويُحفظ كنسخة ثابتة لا تتغير؛ أي تصحيح لاحق يظهر كتسوية مستقلة في كشف الفترة التالية.</li>
          <li><b>التوزيعات:</b> مبالغ نقدية محوّلة فعلياً، مرفق بكل تحويل إيصاله متى توفّر.</li>
          <li><b>الخسائر:</b> الصافي السالب لأي شهر يُخصم من رصيدك ويُعوَّض من أرباح الفترات اللاحقة.</li>
          <li><b>الإشغال</b> = عدد الأيام المحجوزة (مبيت أو بالساعة) ÷ أيام الربع؛ التغيّر بالنقاط المئوية مقارنة بالربع السابق.</li>
        </ol>
        <div className="ivs-sign"><span>صادر آلياً من نظام إدارة ريتام · الأرقام مقرّبة لأقرب ريال في الجداول</span><span className="n">{stmtNo}</span></div>
      </section>
    </div>
  );
}
