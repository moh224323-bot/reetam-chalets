// صفحة المستثمرين: كشف ربح وخسارة شهري لكل شاليه، إقفال الشهر بنسخة ثابتة،
// وسجل التوزيعات مع رصيد كل شريك — عشان يكون كل رقم يوصل للشريك واضح المصدر وما يتغير من وراه.
import { useMemo, useState } from "react";
import { db } from "../lib/db";
import type { Booking, Chalet, Expense, Investor, InvestorPayment, InvestorStatement, MaintenanceRequest } from "../lib/types";
import { computeStatement, investorBalance, periodLabel, recentPeriods, round2, type StatementCalc } from "../lib/investorStatement";
import { Modal, SaveBtn } from "./ui";
import { Icon, Pill, SAR, PageHead, Kpi, CardHead, Track, Empty } from "./ds";

interface Props {
  names: string[];
  chalets: Chalet[];
  bookings: Booking[];
  expenses: Expense[];
  maint: MaintenanceRequest[];
  investors: Investor[];
  statements: InvestorStatement[];
  payments: InvestorPayment[];
  userName: string;
  onReload: () => Promise<void> | void;
  onAddInvestor: (chalet: string) => void;
  onEditInvestor: (iv: Investor) => void;
  createLogin: (payload: Record<string, unknown>) => Promise<{ success?: boolean; id?: string; error?: string }>;
}

const fmt = (n: number) => round2(n).toLocaleString("en-US");
const td = () => new Date().toISOString().slice(0, 10);

export default function InvestorsTab({ names, chalets, bookings, expenses, maint, investors, statements, payments, userName, onReload, onAddInvestor, onEditInvestor, createLogin }: Props) {
  const periods = useMemo(() => recentPeriods(12), []);
  const currentPeriod = periods[0];
  const [period, setPeriod] = useState(periods[1]); // الشهر الماضي افتراضياً: آخر شهر مكتمل
  const [payMdl, setPayMdl] = useState<{ iv: Investor; amount: string; paid_date: string; method: string; receipt_url: string; note: string } | null>(null);
  const [feeMdl, setFeeMdl] = useState<{ chalet: Chalet; pct: string } | null>(null);
  const [ledgerIv, setLedgerIv] = useState<Investor | null>(null);
  const [loginMdl, setLoginMdl] = useState<{ iv: Investor; email: string; password: string; ids: number[]; err: string } | null>(null);

  // نفس الشخص له صف لكل شاليه: نقترح ربط الصفوف اللي بنفس الجوال (أو نفس الاسم إذا ما فيه جوال)
  const normPhone = (p?: string) => (p || "").replace(/[^0-9]/g, "").replace(/^966/, "0");
  function samePerson(a: Investor, b: Investor) {
    const pa = normPhone(a.phone), pb = normPhone(b.phone);
    return pa && pb ? pa === pb : a.name.trim() === b.name.trim();
  }
  function openLogin(iv: Investor) {
    const ids = investors.filter(x => !x.profile_id && Number(x.percentage) > 0 && samePerson(x, iv)).map(x => x.id);
    setLoginMdl({ iv, email: "", password: "", ids: ids.includes(iv.id) ? ids : [iv.id, ...ids], err: "" });
  }

  const paidBy = useMemo(() => {
    const m: Record<number, number> = {};
    payments.forEach(p => { m[p.investor_id] = (m[p.investor_id] || 0) + (Number(p.amount) || 0); });
    return m;
  }, [payments]);
  const balanceOf = (iv: Investor) => investorBalance(iv.id, statements, paidBy[iv.id] || 0);

  const rows = names.map(n => {
    const ch = chalets.find(c => c.name === n);
    const live = computeStatement(n, period, Number(ch?.mgmt_fee_pct) || 0, bookings, expenses, maint, investors);
    const closed = statements.find(s => s.chalet === n && s.period === period) || null;
    return { n, ch, live, closed, shown: (closed || live) as StatementCalc };
  });

  const totalNet = rows.reduce((s, r) => s + r.shown.net, 0);
  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalBalance = investors.reduce((s, iv) => s + balanceOf(iv).balance, 0);
  const incomplete = names.filter(n => { const l = investors.filter(iv => iv.chalet === n); return l.length > 0 && l.reduce((s, iv) => s + Number(iv.percentage || 0), 0) !== 100; }).length;

  async function closeMonth(r: typeof rows[number]) {
    const pctSum = r.live.shares.reduce((s, x) => s + x.pct, 0);
    if (r.live.shares.length && pctSum !== 100 && !window.confirm(`مجموع نسب الشركاء ${pctSum}% وليس 100%. إقفال الشهر رغم ذلك؟`)) return;
    if (!window.confirm(`إقفال كشف ${r.n} لشهر ${periodLabel(period)}؟\nالصافي ${fmt(r.live.net)} ر.س يصير مستحقاً للشركاء، والكشف يُحفظ كنسخة ثابتة.`)) return;
    await db("investor_statements", "POST", { ...r.live, closed_by: userName });
    await onReload();
  }
  async function reopenMonth(st: InvestorStatement) {
    if (!window.confirm(`إلغاء إقفال كشف ${st.chalet} لشهر ${periodLabel(st.period)}؟\nالمستحق للشركاء من هذا الشهر بيرجع يُحسب من الأرقام الحالية.`)) return;
    await db("investor_statements", "DELETE", null, st.id);
    await onReload();
  }

  function sendStatement(iv: Investor, r: typeof rows[number]) {
    const st = r.shown;
    const share = st.shares.find(x => x.investor_id === iv.id)?.amount ?? round2(st.net * (Number(iv.percentage) || 0) / 100);
    const bal = balanceOf(iv);
    const lines = [
      `📊 *كشف حساب الشريك — ${r.n}*`,
      `🗓️ ${periodLabel(period)}${r.closed ? " (مُقفل)" : " (مبدئي، غير مُقفل)"}`,
      ``,
      // للشريك: صافي الربح فقط، بدون تفاصيل الإيرادات والمصاريف
      `📈 صافي ربح الشاليه: ${fmt(st.net)} ر`,
      ``,
      `🤝 نسبتك: ${Number(iv.percentage)}%`,
      `*نصيبك من الشهر: ${fmt(share)} ر*`,
      ``,
      `📒 إجمالي المستحق لك: ${fmt(bal.due)} ر`,
      `✅ المدفوع لك: ${fmt(bal.paid)} ر`,
      `*الرصيد المتبقي: ${fmt(bal.balance)} ر*`,
      ``,
      `_كشف آلي من نظام إدارة ريتام_`,
    ];
    const phone = iv.phone?.replace(/[^0-9]/g, "").replace(/^0/, "966");
    const text = encodeURIComponent(lines.join("\n"));
    window.open(phone ? `https://wa.me/${phone}?text=${text}` : `https://api.whatsapp.com/send?text=${text}`, "_blank");
  }

  const ledger = useMemo(() => {
    if (!ledgerIv) return [];
    const items: { date: string; label: string; amount: number; payment?: InvestorPayment }[] = [];
    statements.forEach(st => {
      const sh = st.shares.find(x => x.investor_id === ledgerIv.id);
      if (sh) items.push({ date: st.period + "-01", label: `نصيب ${periodLabel(st.period)} — ${st.chalet} (${sh.pct}%)`, amount: sh.amount });
    });
    payments.filter(p => p.investor_id === ledgerIv.id).forEach(p => items.push({ date: p.paid_date, label: "دفعة" + (p.method ? " · " + p.method : "") + (p.note ? " · " + p.note : ""), amount: -Number(p.amount), payment: p }));
    items.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    let run = 0;
    return items.map(it => ({ ...it, run: (run = round2(run + it.amount)) }));
  }, [ledgerIv, statements, payments]);

  return (
    <div className="x-page">
      <PageHead title="المستثمرون" sub="كشف شهري شفاف لكل شاليه: الإيرادات المحصّلة ناقص كل المصاريف ورسوم الإدارة، ثم حصة كل شريك">
        <select className="inp" style={{ width: "auto", minWidth: 170 }} value={period} onChange={e => setPeriod(e.target.value)} aria-label="الشهر">
          {periods.map(p => <option key={p} value={p}>{periodLabel(p)}{p === currentPeriod ? " (جاري)" : ""}</option>)}
        </select>
      </PageHead>

      <div className="x-kpis">
        <Kpi hero label={"الصافي القابل للتوزيع · " + periodLabel(period)} value={<SAR v={totalNet} />} sub={rows.filter(r => r.closed).length + " من " + names.length + " شاليه مُقفل"} />
        <Kpi c="blue" label="الرصيد المستحق للشركاء" value={<SAR v={totalBalance} />} sub="من الكشوف المُقفلة ناقص المدفوع" />
        <Kpi label="إجمالي الموزّع" value={<SAR v={totalPaid} />} sub={payments.length + " دفعة"} />
        <Kpi label="شاليهات نسبها غير مكتملة" value={incomplete} tone={incomplete ? "neg" : "pos"} sub={incomplete ? "مجموع النسب لا يساوي 100%" : "كل النسب مكتملة"} />
      </div>

      {names.length === 0 && <div className="x-card"><Empty>أضف شاليهات أولاً</Empty></div>}

      {rows.map(r => {
        const chInvestors = investors.filter(iv => iv.chalet === r.n);
        const totalPct = chInvestors.reduce((s, iv) => s + Number(iv.percentage || 0), 0);
        const st = r.shown;
        const drift = r.closed ? round2(r.live.net - r.closed.net) : 0;
        const canClose = period < currentPeriod;
        return (
          <div key={r.n} className="x-card">
            <CardHead icon="home" title={r.n} sub={<>صافي {periodLabel(period)}: <b className={st.net < 0 ? "x-neg" : "x-pos"}><SAR v={st.net} /></b></>}>
              {r.closed ? <Pill tone="ok">مُقفل</Pill> : <Pill tone="warn">{canClose ? "مفتوح" : "الشهر جاري"}</Pill>}
              {chInvestors.length > 0 && <Pill tone={totalPct === 100 ? "ok" : "warn"}>{"مجموع النسب " + totalPct + "%"}</Pill>}
              {r.ch && <button className="btn bo bsm" onClick={() => setFeeMdl({ chalet: r.ch!, pct: String(Number(r.ch!.mgmt_fee_pct) || 0) })}>{"رسوم الإدارة " + (Number(r.ch.mgmt_fee_pct) || 0) + "%"}</button>}
              <button className="btn bo bsm" onClick={() => onAddInvestor(r.n)}><Icon n="plus" s={15} />شريك</button>
            </CardHead>

            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>البند</th><th>المبلغ</th></tr></thead>
              <tbody>
                <tr><td>{"الإيرادات المحصّلة (" + st.bookings_count + " حجز مكتمل)"}</td><td className="strong x-pos"><SAR v={st.revenue} /></td></tr>
                {Object.entries(st.expenses).map(([k, v]) => (
                  <tr key={k}><td>{"− " + k}</td><td className="x-neg"><span dir="ltr" style={{ unicodeBidi: "isolate" }}>{"−" + fmt(v)}</span></td></tr>
                ))}
                {st.mgmt_fee > 0 && <tr><td>{"− رسوم الإدارة (" + st.mgmt_fee_pct + "% من الإيرادات)"}</td><td className="x-neg"><span dir="ltr" style={{ unicodeBidi: "isolate" }}>{"−" + fmt(st.mgmt_fee)}</span></td></tr>}
                {st.reserve_spent > 0 && <tr><td className="x-muted">{"ℹ️ صيانة صُرفت من احتياطي التأمين (ما تنخصم مرة ثانية)"}</td><td className="x-muted"><SAR v={st.reserve_spent} /></td></tr>}
              </tbody>
              <tfoot><tr><td>الصافي القابل للتوزيع</td><td className={st.net < 0 ? "x-neg" : "x-pos"}><SAR v={st.net} /></td></tr></tfoot>
            </table></div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "10px 0" }}>
              {r.closed ? (<>
                <span className="x-muted" style={{ fontSize: 13 }}>{"أُقفل " + new Date(r.closed.closed_at).toLocaleDateString("en-GB") + (r.closed.closed_by ? " بواسطة " + r.closed.closed_by : "")}</span>
                {drift !== 0 && <Pill tone="warn">{"تغيّرت الأرقام بعد الإقفال بفرق " + fmt(drift) + " ر.س"}</Pill>}
                <button className="btn bo bsm" onClick={() => reopenMonth(r.closed!)}>إلغاء الإقفال</button>
              </>) : canClose ? (
                <button className="btn bp bsm" onClick={() => closeMonth(r)}><Icon n="check" s={15} />إقفال الشهر واعتماد الكشف</button>
              ) : (
                <span className="x-muted" style={{ fontSize: 13 }}>الأرقام مبدئية — يُقفل الكشف بعد نهاية الشهر</span>
              )}
            </div>

            {chInvestors.length === 0
              ? <Empty>لا يوجد شركاء لهذا الشاليه</Empty>
              : <div className="tbl-wrap"><table className="x-tbl">
                <thead><tr><th>الشريك</th><th>النسبة</th><th>نصيب الشهر</th><th>المستحق</th><th>المدفوع</th><th>الرصيد</th><th className="end"></th></tr></thead>
                <tbody>
                  {chInvestors.map(iv => {
                    const share = st.shares.find(x => x.investor_id === iv.id)?.amount ?? round2(st.net * (Number(iv.percentage) || 0) / 100);
                    const bal = balanceOf(iv);
                    return (
                      <tr key={iv.id}>
                        <td className="strong">{iv.name}</td>
                        <td><div className="x-barrow"><Track pct={Number(iv.percentage) || 0} /><span>{Number(iv.percentage) + "%"}</span></div></td>
                        <td className={"strong " + (share < 0 ? "x-neg" : "")}><SAR v={share} /></td>
                        <td><SAR v={bal.due} /></td>
                        <td><SAR v={bal.paid} /></td>
                        <td className={"strong " + (bal.balance > 0 ? "x-pos" : bal.balance < 0 ? "x-neg" : "")}><SAR v={bal.balance} /></td>
                        <td className="end">
                          <div style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <button className="btn bp bsm" onClick={() => setPayMdl({ iv, amount: bal.balance > 0 ? String(bal.balance) : "", paid_date: td(), method: "تحويل بنكي", receipt_url: "", note: "" })}><Icon n="money" s={15} />دفعة</button>
                            <button className="btn bsm bshare" onClick={() => sendStatement(iv, r)}><Icon n="send" s={15} />الكشف</button>
                            <button className="btn bo bsm" onClick={() => setLedgerIv(iv)}><Icon n="receipt" s={15} />السجل</button>
                            {iv.profile_id
                              ? <Pill tone="ok">له حساب</Pill>
                              : <button className="btn bo bsm" onClick={() => openLogin(iv)}><Icon n="shield" s={15} />حساب دخول</button>}
                            <button className="btn bo bsm" aria-label="تعديل" onClick={() => onEditInvestor(iv)}><Icon n="edit" s={15} /></button>
                            <button className="btn bd bsm" aria-label="حذف" onClick={async () => { if (window.confirm("حذف " + iv.name + "؟")) { await db("investors", "DELETE", null, iv.id); await onReload(); } }}><Icon n="trash" s={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></div>
            }
          </div>
        );
      })}

      {payMdl && (
        <Modal onClose={() => setPayMdl(null)} title={"تسجيل دفعة — " + payMdl.iv.name}>
          <div style={{ marginBottom: 12 }}><label className="lbl">المبلغ (ر.س)</label><input className="inp" type="number" inputMode="decimal" value={payMdl.amount} onChange={e => setPayMdl(p => p && ({ ...p, amount: e.target.value }))} /></div>
          <div style={{ marginBottom: 12 }}><label className="lbl">تاريخ الدفع</label><input className="inp" type="date" value={payMdl.paid_date} onChange={e => setPayMdl(p => p && ({ ...p, paid_date: e.target.value }))} /></div>
          <div style={{ marginBottom: 12 }}><label className="lbl">طريقة الدفع</label>
            <select className="inp" value={payMdl.method} onChange={e => setPayMdl(p => p && ({ ...p, method: e.target.value }))}>
              <option>تحويل بنكي</option><option>نقد</option><option>أخرى</option>
            </select></div>
          <div style={{ marginBottom: 12 }}><label className="lbl">رابط إيصال التحويل (اختياري)</label><input className="inp" dir="ltr" value={payMdl.receipt_url} onChange={e => setPayMdl(p => p && ({ ...p, receipt_url: e.target.value }))} placeholder="https://..." /></div>
          <div style={{ marginBottom: 16 }}><label className="lbl">ملاحظة</label><input className="inp" value={payMdl.note} onChange={e => setPayMdl(p => p && ({ ...p, note: e.target.value }))} /></div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn bo" onClick={() => setPayMdl(null)}>إلغاء</button>
            <SaveBtn disabled={!(Number(payMdl.amount) > 0) || !payMdl.paid_date} onClick={async () => {
              await db("investor_payments", "POST", { investor_id: payMdl.iv.id, amount: Number(payMdl.amount), paid_date: payMdl.paid_date, method: payMdl.method, receipt_url: payMdl.receipt_url.trim() || null, note: payMdl.note.trim() || null });
              setPayMdl(null); await onReload();
            }} />
          </div>
        </Modal>
      )}

      {feeMdl && (
        <Modal onClose={() => setFeeMdl(null)} title={"رسوم الإدارة — " + feeMdl.chalet.name}>
          <div style={{ marginBottom: 8 }}><label className="lbl">النسبة من الإيرادات المحصّلة (%)</label><input className="inp" type="number" min={0} max={100} step="0.5" value={feeMdl.pct} onChange={e => setFeeMdl(p => p && ({ ...p, pct: e.target.value }))} /></div>
          <div className="x-muted" style={{ fontSize: 13, marginBottom: 16 }}>تُخصم قبل التوزيع وتظهر بنداً مستقلاً في كشف الشريك. الكشوف المُقفلة سابقاً ما تتأثر. إذا كنت تسجّل الإدارة أصلاً كمصروف بفئة "إدارة"، لا تجمع بينهما.</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn bo" onClick={() => setFeeMdl(null)}>إلغاء</button>
            <SaveBtn disabled={!(Number(feeMdl.pct) >= 0 && Number(feeMdl.pct) <= 100)} onClick={async () => {
              await db("chalets", "PATCH", { mgmt_fee_pct: Number(feeMdl.pct) || 0 }, feeMdl.chalet.id);
              setFeeMdl(null); await onReload();
            }} />
          </div>
        </Modal>
      )}

      {loginMdl && (
        <Modal onClose={() => setLoginMdl(null)} title={"حساب دخول للشريك — " + loginMdl.iv.name}>
          <div className="x-muted" style={{ fontSize: 13, marginBottom: 12 }}>الشريك يدخل لوحة التحكم بهذا الحساب ويشوف فقط: شراكاته، الكشوف المُقفلة بكل بنودها، نصيبه، ودفعاته. ما يشوف بيانات الضيوف ولا باقي الشركاء.</div>
          <div style={{ marginBottom: 12 }}><label className="lbl">الإيميل</label><input className="inp" dir="ltr" type="email" value={loginMdl.email} onChange={e => setLoginMdl(p => p && ({ ...p, email: e.target.value }))} /></div>
          <div style={{ marginBottom: 12 }}><label className="lbl">كلمة المرور (6 أحرف على الأقل)</label><input className="inp" dir="ltr" type="text" value={loginMdl.password} onChange={e => setLoginMdl(p => p && ({ ...p, password: e.target.value }))} /></div>
          <div style={{ marginBottom: 12 }}><label className="lbl">الشراكات اللي تظهر له</label>
            {investors.filter(x => !x.profile_id && (x.id === loginMdl.iv.id || samePerson(x, loginMdl.iv))).map(x => (
              <label key={x.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                <input type="checkbox" checked={loginMdl.ids.includes(x.id)} onChange={e => setLoginMdl(p => p && ({ ...p, ids: e.target.checked ? [...p.ids, x.id] : p.ids.filter(i => i !== x.id) }))} />
                <span>{x.chalet + " — " + Number(x.percentage) + "%"}</span>
              </label>
            ))}
          </div>
          {loginMdl.err && <div className="x-neg" style={{ fontSize: 13, marginBottom: 12 }}>{loginMdl.err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn bo" onClick={() => setLoginMdl(null)}>إلغاء</button>
            <SaveBtn label="إنشاء الحساب" disabled={!loginMdl.email.includes("@") || loginMdl.password.length < 6 || loginMdl.ids.length === 0} onClick={async () => {
              const r = await createLogin({ email: loginMdl.email.trim(), password: loginMdl.password, name: loginMdl.iv.name.trim(), role: "investor", investorIds: loginMdl.ids });
              if (r?.error) { setLoginMdl(p => p && ({ ...p, err: r.error || "" })); return; }
              setLoginMdl(null); await onReload();
            }} />
          </div>
        </Modal>
      )}

      {ledgerIv && (
        <Modal onClose={() => setLedgerIv(null)} title={"سجل حساب " + ledgerIv.name}>
          {ledger.length === 0 ? <Empty>لا توجد كشوف مُقفلة أو دفعات بعد</Empty> :
            <div className="tbl-wrap"><table className="x-tbl">
              <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th><th>الرصيد</th><th className="end"></th></tr></thead>
              <tbody>{ledger.map((it, i) => (
                <tr key={i}>
                  <td className="x-mono">{it.payment ? it.date : it.date.slice(0, 7)}</td>
                  <td>{it.label}{it.payment?.receipt_url && <> · <a href={it.payment.receipt_url} target="_blank" rel="noreferrer">الإيصال</a></>}</td>
                  <td className={it.amount < 0 ? "x-neg" : "x-pos"}><span dir="ltr" style={{ unicodeBidi: "isolate" }}>{(it.amount < 0 ? "−" : "+") + fmt(Math.abs(it.amount))}</span></td>
                  <td className="strong"><SAR v={it.run} unit={false} /></td>
                  <td className="end">{it.payment && <button className="btn bd bsm" aria-label="حذف الدفعة" onClick={async () => { if (window.confirm("حذف هذه الدفعة؟")) { await db("investor_payments", "DELETE", null, it.payment!.id); await onReload(); } }}><Icon n="trash" s={15} /></button>}</td>
                </tr>
              ))}</tbody>
            </table></div>}
        </Modal>
      )}
    </div>
  );
}
