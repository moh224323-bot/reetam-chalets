// خانة "المستثمر": الشريك يدخل بحسابه ويشوف أداء استثماراته ربع سنوياً — صافي الربح ونصيبه فقط،
// أداء الشاليه (الإشغال، الحجوزات، التقييم)، وتحويلاته ورصيده.
// البيانات كلها من investor_portal() على الخادم — حساب المستثمر ما يقدر يقرا أي جدول مباشرة.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { periodLabel, round2 } from "../lib/investorStatement";
import { Icon, Pill, SAR, PageHead, Kpi, CardHead, Empty } from "./ds";

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

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10" أو تاريخ كامل → "2026-Q4" */
const quarterOf = (d: string) => d.slice(0, 4) + "-Q" + (Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1);
/** "2026-Q4" → الأشهر الثلاثة بصيغة YYYY-MM */
const monthsOf = (q: string) => { const y = q.slice(0, 4), n = Number(q.slice(6)); return [0, 1, 2].map(i => `${y}-${String((n - 1) * 3 + i + 1).padStart(2, "0")}`); };
const quarterLabel = (q: string) => { const n = Number(q.slice(6)); return `Q${n} ${q.slice(0, 4)} · ${MONTHS_EN[(n - 1) * 3]}–${MONTHS_EN[(n - 1) * 3 + 2]}`; };
const currentQuarter = () => quarterOf(new Date().toISOString().slice(0, 7));
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0));

export default function InvestorPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null | undefined>(undefined);
  const [quarter, setQuarter] = useState<string | null>(null);
  const [allTransfers, setAllTransfers] = useState(false);

  useEffect(() => {
    supabase.rpc("investor_portal").then(({ data }) => setData((data as PortalData | null) || null));
  }, []);

  const quarters = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>([currentQuarter(), ...data.performance.map(p => p.quarter), ...data.statements.map(s => quarterOf(s.period))]);
    return [...set].sort().reverse();
  }, [data]);
  // افتراضياً: آخر ربع فيه كشوف معتمدة، وإلا الربع الحالي
  const q = quarter || (data?.statements[0] ? quarterOf(data.statements[0].period) : currentQuarter());

  if (data === undefined) return <div className="x-page" style={{ padding: 24, textAlign: "center" }}>جاري التحميل...</div>;

  const header = (
    <PageHead title="المستثمر" sub={(data ? "أهلاً " + data.name + " — " : "") + "أداء استثماراتك وتحويلاتك ربع سنوياً"}>
      {data && quarters.length > 0 && (
        <select className="inp" style={{ width: "auto", minWidth: 190 }} value={q} onChange={e => setQuarter(e.target.value)} aria-label="الربع" dir="ltr">
          {quarters.map(x => <option key={x} value={x}>{quarterLabel(x)}</option>)}
        </select>
      )}
      <button className="btn bo" onClick={onLogout}><Icon n="power" s={16} />خروج</button>
    </PageHead>
  );

  if (!data) return (
    <div dir="rtl" className="x-page" style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      {header}
      <div className="x-card"><Empty>حسابك غير مرتبط بأي شراكة بعد، تواصل مع الإدارة</Empty></div>
    </div>
  );

  const qStatements = data.statements.filter(s => quarterOf(s.period) === q);
  const qPayments = data.payments.filter(p => quarterOf(p.paid_date) === q);
  const qProfit = sum(qStatements.map(s => s.my_share));
  const qPaid = sum(qPayments.map(p => p.amount));
  const balance = round2(sum(data.statements.map(s => s.my_share)) - sum(data.payments.map(p => p.amount)));
  const transfers = allTransfers ? data.payments : qPayments;

  return (
    <div dir="rtl" className="x-page" style={{ maxWidth: 1000, margin: "0 auto", padding: 16 }}>
      {header}

      <div className="x-kpis">
        <Kpi hero label={"صافي أرباحك · Q" + q.slice(6)} value={<SAR v={qProfit} />} sub={qStatements.length + " شهر معتمد من 3"} />
        <Kpi c="blue" label={"المحوّل لك · Q" + q.slice(6)} value={<SAR v={qPaid} />} sub={qPayments.length + " تحويل"} />
        <Kpi label="رصيدك المتبقي" value={<SAR v={balance} />} tone={balance < 0 ? "neg" : undefined} sub="كل الأرباح المعتمدة ناقص كل التحويلات" />
      </div>

      {data.holdings.map(h => {
        const st = qStatements.filter(s => s.chalet === h.chalet);
        const perf = data.performance.find(p => p.chalet === h.chalet && p.quarter === q);
        const trend = data.performance.filter(p => p.chalet === h.chalet);
        const chaletNet = sum(st.map(s => s.net));
        const myShare = sum(st.map(s => s.my_share));
        return (
          <div key={h.investor_id} className="x-card">
            <CardHead icon="home" title={h.chalet} sub={"نسبتك " + Number(h.pct) + "%"}>
              <Pill tone={st.length === 3 ? "ok" : "warn"}>{st.length === 3 ? "الربع معتمد" : st.length + " من 3 أشهر معتمدة"}</Pill>
            </CardHead>

            <div className="x-kpis" style={{ margin: "4px 0 12px" }}>
              <Kpi label="صافي ربح الشاليه" value={<SAR v={chaletNet} />} tone={chaletNet < 0 ? "neg" : "pos"} />
              <Kpi label="نصيبك" value={<SAR v={myShare} />} tone={myShare < 0 ? "neg" : "pos"} />
              <Kpi label="الإشغال" value={(perf?.occupancy ?? 0) + "%"} sub={(perf?.booked_days ?? 0) + " يوم محجوز"} />
              <Kpi label="الحجوزات" value={perf?.bookings ?? 0} sub={perf?.rating ? "التقييم " + perf.rating + " ★ (" + perf.reviews + ")" : "لا توجد تقييمات"} />
            </div>

            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>الشهر</th><th>صافي ربح الشاليه</th><th>نصيبك</th><th>الحالة</th></tr></thead>
              <tbody>{monthsOf(q).map(m => {
                const s = st.find(x => x.period === m);
                return (
                  <tr key={m}>
                    <td className="strong" dir="ltr" style={{ textAlign: "start" }}>{periodLabel(m)}</td>
                    <td className={s && s.net < 0 ? "x-neg" : ""}>{s ? <SAR v={s.net} /> : "—"}</td>
                    <td className={"strong " + (s && s.my_share < 0 ? "x-neg" : "x-pos")}>{s ? <SAR v={s.my_share} /> : "—"}</td>
                    <td>{s ? <Pill tone="ok">✓ معتمد</Pill> : <Pill tone="muted">بانتظار الاعتماد</Pill>}</td>
                  </tr>
                );
              })}</tbody>
              <tfoot><tr><td>إجمالي الربع</td><td><SAR v={chaletNet} /></td><td><SAR v={myShare} /></td><td /></tr></tfoot>
            </table></div>

            {trend.length > 1 && (
              <div className="tbl-wrap" style={{ marginTop: 12 }}><table className="x-tbl">
                <thead><tr><th>أداء الشاليه</th><th>الإشغال</th><th>الحجوزات</th><th>التقييم</th><th>نصيبك</th></tr></thead>
                <tbody>{trend.map(p => (
                  <tr key={p.quarter} style={p.quarter === q ? { fontWeight: 700 } : undefined}>
                    <td dir="ltr" style={{ textAlign: "start" }}>{quarterLabel(p.quarter)}</td>
                    <td>{p.occupancy + "%"}</td>
                    <td>{p.bookings}</td>
                    <td>{p.rating ? p.rating + " ★" : "—"}</td>
                    <td><SAR v={sum(data.statements.filter(s => s.chalet === h.chalet && quarterOf(s.period) === p.quarter).map(s => s.my_share))} /></td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </div>
        );
      })}

      <div className="x-card">
        <CardHead icon="money" title="تحويلاتك" sub={allTransfers ? "كل التحويلات" : quarterLabel(q)}>
          <button className="btn bo bsm" onClick={() => setAllTransfers(v => !v)}>{allTransfers ? "تحويلات هذا الربع" : "كل التحويلات"}</button>
        </CardHead>
        {transfers.length === 0 ? <Empty>لا توجد تحويلات {allTransfers ? "بعد" : "في هذا الربع"}</Empty> :
          <div className="tbl-wrap"><table className="x-tbl">
            <thead><tr><th>التاريخ</th><th>الشاليه</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th></tr></thead>
            <tbody>{transfers.map((p, i) => (
              <tr key={i}>
                <td className="x-mono">{p.paid_date}</td><td>{p.chalet}</td>
                <td className="strong"><SAR v={p.amount} /></td>
                <td>{p.method ? <Pill tone="muted">{p.method}</Pill> : "-"}{p.note ? <span className="x-muted"> · {p.note}</span> : null}</td>
                <td>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer">عرض</a> : "-"}</td>
              </tr>
            ))}</tbody>
          </table></div>}
      </div>
    </div>
  );
}
