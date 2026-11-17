// بوابة المستثمر: الشريك يدخل بحسابه ويشوف شاليهاته، كشوفه الشهرية المُقفلة بكل بنودها، ونصيبه وتوزيعاته ورصيده.
// البيانات كلها من investor_portal() على الخادم — حساب المستثمر ما يقدر يقرا أي جدول مباشرة.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { periodLabel, round2 } from "../lib/investorStatement";
import { Icon, Pill, SAR, PageHead, Kpi, CardHead, Empty } from "./ds";

interface PortalStatement {
  chalet: string; period: string; revenue: number; bookings_count: number;
  expenses: Record<string, number>; expenses_total: number; mgmt_fee_pct: number; mgmt_fee: number;
  net: number; reserve_spent: number; closed_at: string; my_pct: number; my_share: number;
}
interface PortalPayment { chalet: string; amount: number; paid_date: string; method?: string | null; receipt_url?: string | null; note?: string | null }
interface PortalData { name: string; holdings: { investor_id: number; chalet: string; pct: number }[]; statements: PortalStatement[]; payments: PortalPayment[] }

const fmt = (n: number) => round2(Number(n) || 0).toLocaleString("en-US");

export default function InvestorPortal({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<PortalData | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc("investor_portal").then(({ data }) => setData((data as PortalData | null) || null));
  }, []);

  const totals = useMemo(() => {
    if (!data) return { due: 0, paid: 0, balance: 0 };
    const due = data.statements.reduce((s, st) => s + Number(st.my_share || 0), 0);
    const paid = data.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    return { due: round2(due), paid: round2(paid), balance: round2(due - paid) };
  }, [data]);

  if (data === undefined) return <div className="x-page" style={{ padding: 24, textAlign: "center" }}>جاري التحميل...</div>;

  return (
    <div dir="rtl" className="x-page" style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <PageHead title={data ? "أهلاً " + data.name : "بوابة المستثمر"} sub="كشوفك الشهرية المعتمدة وتوزيعاتك — كل بند واضح المصدر">
        <button className="btn bo" onClick={onLogout}><Icon n="power" s={16} />خروج</button>
      </PageHead>

      {!data ? <div className="x-card"><Empty>حسابك غير مرتبط بأي شراكة بعد، تواصل مع الإدارة</Empty></div> : (<>
        <div className="x-kpis">
          <Kpi hero label="الرصيد المتبقي لك" value={<SAR v={totals.balance} />} sub="المستحق من الكشوف المعتمدة ناقص المدفوع" />
          <Kpi c="blue" label="إجمالي المستحق" value={<SAR v={totals.due} />} sub={data.statements.length + " كشف معتمد"} />
          <Kpi label="إجمالي المدفوع لك" value={<SAR v={totals.paid} />} sub={data.payments.length + " دفعة"} />
        </div>

        <div className="x-card">
          <CardHead icon="home" title="شراكاتك" />
          {data.holdings.length === 0 ? <Empty>لا توجد شراكات</Empty> :
            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>الشاليه</th><th>نسبتك</th></tr></thead>
              <tbody>{data.holdings.map(h => <tr key={h.investor_id}><td className="strong">{h.chalet}</td><td>{Number(h.pct) + "%"}</td></tr>)}</tbody>
            </table></div>}
        </div>

        <div className="x-card">
          <CardHead icon="receipt" title="الكشوف الشهرية المعتمدة" sub="اضغط على أي شهر لعرض كل البنود" />
          {data.statements.length === 0 ? <Empty>ما فيه كشوف معتمدة بعد — تظهر هنا بعد إقفال الشهر</Empty> :
            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>الشهر</th><th>الشاليه</th><th>الإيرادات</th><th>المصاريف والرسوم</th><th>صافي الشاليه</th><th>نصيبك</th></tr></thead>
              <tbody>{data.statements.map(st => {
                const key = st.period + "|" + st.chalet;
                const isOpen = open === key;
                return [
                  <tr key={key} style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? null : key)}>
                    <td className="strong" dir="ltr" style={{ textAlign: "start" }}>{periodLabel(st.period)}</td>
                    <td>{st.chalet}</td>
                    <td className="x-pos"><SAR v={st.revenue} unit={false} /></td>
                    <td className="x-neg"><span dir="ltr" style={{ unicodeBidi: "isolate" }}>{"−" + fmt(Number(st.expenses_total) + Number(st.mgmt_fee))}</span></td>
                    <td className={st.net < 0 ? "x-neg" : "x-pos"}><SAR v={st.net} unit={false} /></td>
                    <td className={"strong " + (st.my_share < 0 ? "x-neg" : "x-pos")}><SAR v={st.my_share} /> <span className="x-muted">{"(" + Number(st.my_pct) + "%)"}</span></td>
                  </tr>,
                  isOpen && (
                    <tr key={key + "-d"}><td colSpan={6} style={{ background: "var(--x-soft, rgba(0,0,0,.03))" }}>
                      <div style={{ display: "grid", gap: 6, padding: "6px 4px", fontSize: 14 }}>
                        <div>{"الإيرادات المحصّلة (" + st.bookings_count + " حجز مكتمل): "}<b>{fmt(st.revenue)}</b></div>
                        {Object.entries(st.expenses || {}).map(([k, v]) => <div key={k}>{"− " + k + ": "}<b>{fmt(v)}</b></div>)}
                        {Number(st.mgmt_fee) > 0 && <div>{"− رسوم الإدارة (" + Number(st.mgmt_fee_pct) + "% من الإيرادات): "}<b>{fmt(st.mgmt_fee)}</b></div>}
                        <div>{"= صافي الشاليه: "}<b>{fmt(st.net)}</b>{" × نسبتك " + Number(st.my_pct) + "% = "}<b>{fmt(st.my_share)}</b></div>
                        {Number(st.reserve_spent) > 0 && <div className="x-muted">{"ℹ️ صيانة صُرفت من احتياطي التأمين: " + fmt(st.reserve_spent) + " (ما تنخصم مرة ثانية)"}</div>}
                        <div className="x-muted">{"اعتُمد الكشف بتاريخ " + new Date(st.closed_at).toLocaleDateString("en-GB")}</div>
                      </div>
                    </td></tr>
                  ),
                ];
              })}</tbody>
            </table></div>}
        </div>

        <div className="x-card">
          <CardHead icon="money" title="التوزيعات المدفوعة لك" />
          {data.payments.length === 0 ? <Empty>لا توجد دفعات بعد</Empty> :
            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>التاريخ</th><th>الشاليه</th><th>المبلغ</th><th>الطريقة</th><th>الإيصال</th></tr></thead>
              <tbody>{data.payments.map((p, i) => (
                <tr key={i}>
                  <td className="x-mono">{p.paid_date}</td><td>{p.chalet}</td>
                  <td className="strong"><SAR v={p.amount} /></td>
                  <td>{p.method ? <Pill tone="muted">{p.method}</Pill> : "-"}{p.note ? <span className="x-muted"> · {p.note}</span> : null}</td>
                  <td>{p.receipt_url ? <a href={p.receipt_url} target="_blank" rel="noreferrer">عرض</a> : "-"}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </div>
      </>)}
    </div>
  );
}
