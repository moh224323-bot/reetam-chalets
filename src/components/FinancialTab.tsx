import { useState } from "react";
import { db, formatDate, nightsBetween } from "../lib/db";
import { Booking, MaintenanceRequest, WalletTransaction, Expense, FixedExpense } from "../lib/types";
import { B, S, T, TD, W, SA, SD, SI, SL, BD } from "../lib/colors";
import { BOOKING_STATUS } from "../lib/constants";
import { Bdg, SectionTitle, DataTable } from "./ui";

const FREQ_LABEL: Record<string,string> = { monthly:"شهري", quarterly:"ربع سنوي", yearly:"سنوي" };

interface Props {
  bookings:    Booking[];
  maintenance: MaintenanceRequest[];
  wallet:      WalletTransaction[];
  names:       string[];
  expenses?:   Expense[];
  fixedExpenses?: FixedExpense[];
  onAddExpense?: () => void;
  onAddFixedExpense?: () => void;
  onPayFixedExpense?: (fx: FixedExpense) => void;
  onEdit?:     (t: WalletTransaction) => void;
  onReload?:   () => void;
}

type Period = "this_month" | "last_month" | "this_year" | "all" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  this_month: "هذا الشهر",
  last_month: "الشهر الماضي",
  this_year:  "هذا العام",
  all:        "كل الوقت",
  custom:     "مخصص",
};

export default function FinancialTab({ bookings, maintenance, wallet, names, expenses = [], fixedExpenses = [], onAddExpense, onAddFixedExpense, onPayFixedExpense, onEdit, onReload }: Props) {
  const now = new Date();
  const [period, setPeriod] = useState<Period>("this_month");
  const [fch, setFch]       = useState("الكل");
  const [cf, setCf]         = useState("");
  const [ct, setCt]         = useState("");

  function getRange() {
    const y = now.getFullYear(), m = now.getMonth();
    if (period === "this_month") return { from: new Date(y, m, 1),    to: new Date(y, m + 1, 0) };
    if (period === "last_month") return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    if (period === "this_year")  return { from: new Date(y, 0, 1),     to: new Date(y, 11, 31) };
    if (period === "custom")     return { from: cf ? new Date(cf) : null, to: ct ? new Date(ct) : null };
    return { from: null, to: null };
  }

  const { from: rf, to: rt } = getRange();
  const inRange = (d?: string) => {
    if (!d) return false;
    const x = new Date(d);
    if (rf && x < rf) return false;
    if (rt && x > rt) return false;
    return true;
  };

  const byCh  = (item: { chalet: string }) => fch === "الكل" || item.chalet === fch;
  const byPer = (d?: string) => period === "all" || inRange(d);

  const fb  = bookings.filter(b  => b.status === "completed" && byCh(b) && byPer(b.date_from));
  const fm  = maintenance.filter(m => Number(m.cost) > 0 && byCh(m) && byPer(m.maint_date));
  const ft  = wallet.filter(t     => byCh(t) && byPer(t.trans_date));
  const fex = expenses.filter(e   => byCh(e) && byPer(e.expense_date));

  const rev      = fb.reduce((s, b) => s + Number(b.price), 0);
  const mex      = fm.reduce((s, m) => s + Number(m.cost), 0);
  const exTotal  = fex.reduce((s, e) => s + Number(e.amount), 0);
  const insIn    = ft.filter(t => t.type === "إيداع").reduce((s, t) => s + t.amount, 0);
  const net      = rev - mex;
  const trueNet  = rev - mex - exTotal;
  const nts      = fb.reduce((s, b) => s + nightsBetween(b.date_from, b.date_to), 0);

  const csum = names.map(n => {
    const r = bookings.filter(b => b.chalet === n && b.status === "completed" && byPer(b.date_from)).reduce((s, b) => s + Number(b.price), 0);
    const e = maintenance.filter(m => m.chalet === n && Number(m.cost) > 0 && byPer(m.maint_date)).reduce((s, m) => s + Number(m.cost), 0);
    return { n, r, e, net: r - e };
  }).filter(c => c.r > 0 || c.e > 0);

  const plab = PERIOD_LABELS[period];

  function exportCSV() {
    const rows: string[][] = [];
    const h = (s: string) => `"${s}"`;

    rows.push(["نوع", "التاريخ", "الشاليه", "الضيف/الوصف", "المبلغ (ريال)", "الملاحظات"]);

    fb.forEach(b => rows.push([
      "إيراد حجز",
      b.date_from || "",
      b.chalet,
      b.guest,
      String(Number(b.price)),
      b.note || "",
    ]));

    fm.forEach(m => rows.push([
      "مصروف صيانة",
      m.maint_date || "",
      m.chalet,
      m.issue,
      String(Number(m.cost)),
      m.note || "",
    ]));

    fex.forEach(e => rows.push([
      "مصروف متنوع",
      (e as Record<string,unknown>).expense_date as string || "",
      e.chalet || "",
      e.description || "",
      String(Number(e.amount)),
      e.note || "",
    ]));

    const csv = rows.map(r => r.map(h).join(",")).join("\n");
    const bom = "﻿";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `ريتام-مالية-${plab}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <SectionTitle title="المالية"/>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          <button className="btn" onClick={exportCSV} style={{ background:"#059669", color:"#fff", padding:"8px 16px", fontSize:13 }}>
            ⬇ تصدير Excel
          </button>
          {onAddExpense && <button className="btn bp" onClick={onAddExpense}>+ مصروف</button>}
          {onAddFixedExpense && <button className="btn" onClick={onAddFixedExpense} style={{ background:"#7C3AED", color:"#fff", padding:"8px 14px", fontSize:13 }}>📌 مصروف ثابت</button>}
        </div>
      </div>

      {/* فلاتر الفترة */}
      <div className="row" style={{ marginBottom:12 }}>
        <div className="row">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([v, l]) => (
            <button key={v} className="btn" onClick={() => setPeriod(v)}
              style={{ background:period===v?B:W, color:period===v?S:B, border:"1.5px solid "+(period===v?B:"rgba(197,172,136,.4)"), padding:"8px 12px", fontSize:12 }}>
              {l}
            </button>
          ))}
        </div>
        <select className="inp" style={{ width:"auto", minWidth:150 }} value={fch} onChange={e => setFch(e.target.value)}>
          <option value="الكل">كل الشاليهات</option>
          {names.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {period === "custom" && (
        <div className="row" style={{ marginBottom:12 }}>
          <div><label className="lbl">من</label><input className="inp" type="date" style={{ width:"auto" }} value={cf} onChange={e => setCf(e.target.value)}/></div>
          <div><label className="lbl">إلى</label><input className="inp" type="date" style={{ width:"auto" }} value={ct} onChange={e => setCt(e.target.value)}/></div>
        </div>
      )}

      <div style={{ marginBottom:18, padding:"7px 12px", background:SL, borderRadius:8, display:"inline-block", fontSize:13, color:T, fontWeight:600 }}>
        {"تقرير: " + plab + (fch !== "الكل" ? " · " + fch : "")}
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="sg" style={{ marginBottom:20 }}>
        {[
          { l:"الإيرادات",           v:rev.toLocaleString()+" ر",     i:"💵", bg:`linear-gradient(135deg,${T},${TD})`,                                                                        c:"#fff" },
          { l:"تكاليف الصيانة",     v:mex.toLocaleString()+" ر",     i:"🔧", bg:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",                                                                   c:"#fff" },
          { l:"صافي الربح",         v:net.toLocaleString()+" ر",     i:"📈", bg:net>=0?`linear-gradient(135deg,${SA},${SD})`:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",                       c:"#fff" },
          { l:"إيداعات التأمين",    v:insIn.toLocaleString()+" ر",   i:"🛡️", bg:`linear-gradient(135deg,${B},${BD})`,                                                                        c:S     },
          { l:"إجمالي المصاريف",    v:exTotal.toLocaleString()+" ر", i:"💸", bg:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",                                                                   c:"#fff" },
          { l:"صافي الربح الحقيقي", v:trueNet.toLocaleString()+" ر", i:"🏆", bg:trueNet>=0?`linear-gradient(135deg,${T},${TD})`:"linear-gradient(135deg,#8B3A3A,#6B2A2A)",                   c:"#fff" },
          { l:"عدد الحجوزات",       v:String(fb.length),              i:"📅", bg:W,                                                                                                           c:B     },
          { l:"ليالي محجوزة",       v:String(nts),                    i:"🌙", bg:W,                                                                                                           c:B     },
        ].map((s, i) => (
          <div key={i} style={{ background:s.bg, borderRadius:12, padding:16, boxShadow:"0 4px 14px rgba(65,53,35,.1)", border:s.bg===W?"1px solid rgba(197,172,136,.3)":"none" }}>
            <div style={{ fontSize:18, marginBottom:4 }}>{s.i}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.c }}>{s.v}</div>
            <div style={{ fontSize:11, color:s.bg===W?T:"rgba(255,255,255,.8)", marginTop:2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* مقارنة الشاليهات */}
      {fch === "الكل" && csum.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🏠 مقارنة الشاليهات — " + plab}</div>
          <DataTable heads={["الشاليه","الإيرادات","تكاليف الصيانة","صافي الربح","نسبة الربح"]}
            rows={csum.map((c, i) => {
              const pct = c.r > 0 ? Math.min(100, Math.max(0, (c.net / c.r) * 100)) : 0;
              return (
                <tr key={i}>
                  <td data-label="الشاليه" style={{ fontWeight:700 }}>{"🏠 " + c.n}</td>
                  <td data-label="الإيرادات" style={{ fontWeight:700, color:T }}>{c.r.toLocaleString() + " ر"}</td>
                  <td data-label="تكاليف الصيانة" style={{ fontWeight:700, color:"#8B3A3A" }}>{c.e.toLocaleString() + " ر"}</td>
                  <td data-label="صافي الربح" style={{ fontWeight:800, color:c.net>=0?SD:"#8B3A3A" }}>{c.net.toLocaleString() + " ر"}</td>
                  <td data-label="نسبة الربح">
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ flex:1, background:"#f1f5f9", borderRadius:99, height:7, overflow:"hidden", minWidth:60 }}>
                        <div style={{ width:pct+"%", height:"100%", background:c.net>=0?SA:"#8B3A3A", borderRadius:99 }}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:c.net>=0?SD:"#8B3A3A", minWidth:32 }}>{Math.round(pct) + "%"}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          />
        </div>
      )}

      {/* إيرادات الحجوزات */}
      <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
        <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"💵 إيرادات الحجوزات (" + fb.length + ")"}</div>
        {fb.length === 0
          ? <div style={{ padding:24, textAlign:"center", color:SI }}>لا توجد حجوزات في هذه الفترة</div>
          : <DataTable heads={["الضيف","الشاليه","الفترة","الليالي","المبلغ","الحالة"]}
              rows={fb.map(b => (
                <tr key={b.id}>
                  <td data-label="الضيف" style={{ fontWeight:600 }}>{b.guest}</td>
                  <td data-label="الشاليه">{b.chalet}</td>
                  <td data-label="الفترة" style={{ fontSize:12 }}>{formatDate(b.date_from) + " - " + formatDate(b.date_to)}</td>
                  <td data-label="الليالي" style={{ textAlign:"center" }}>{nightsBetween(b.date_from, b.date_to)}</td>
                  <td data-label="المبلغ" style={{ fontWeight:700, color:T }}>{Number(b.price).toLocaleString() + " ر"}</td>
                  <td data-label="الحالة"><Bdg bg={BOOKING_STATUS[b.status]?.bg||"#eee"} color={BOOKING_STATUS[b.status]?.color||"#333"}>{BOOKING_STATUS[b.status]?.label||b.status}</Bdg></td>
                </tr>
              ))}
              footer={[
                <td key={0} colSpan={4} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
                <td key={1} style={{ fontWeight:800, color:T, fontSize:15 }}>{rev.toLocaleString() + " ر"}</td>,
                <td key={2}/>,
              ]}
            />
        }
      </div>

      {/* المصروفات الثابتة */}
      {fixedExpenses.filter(fx => fch === "الكل" || fx.chalet === fch).length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:"#5B21B6", fontSize:14, background:"#F5F3FF", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{"📌 المصروفات الثابتة"}</span>
            <span style={{ fontWeight:800, color:"#7C3AED", fontSize:13 }}>
              {"شهري: " + fixedExpenses.filter(fx=>(fch==="الكل"||fx.chalet===fch)&&fx.frequency==="monthly"&&fx.active).reduce((s,fx)=>s+Number(fx.amount),0).toLocaleString() + " ر"}
            </span>
          </div>
          <DataTable heads={["الشاليه","المصروف","الفئة","التكرار","المبلغ","الحالة","إجراءات"]}
            rows={(() => {
              const thisYM = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}`; })();
              const paidThisMonth = new Set(fex.filter(e => e.expense_date?.startsWith(thisYM)).map(e => e.note));
              return fixedExpenses.filter(fx => fch === "الكل" || fx.chalet === fch).map(fx => {
                const paid = paidThisMonth.has(fx.name);
                return (
                  <tr key={fx.id} style={{ opacity: fx.active ? 1 : 0.5 }}>
                    <td data-label="الشاليه" style={{ fontWeight:600 }}>{fx.chalet}</td>
                    <td data-label="المصروف" style={{ fontWeight:700 }}>{fx.name}</td>
                    <td data-label="الفئة"><Bdg bg="#EDE9FE" color="#5B21B6">{fx.category}</Bdg></td>
                    <td data-label="التكرار"><Bdg bg="#F3F4F6" color="#374151">{FREQ_LABEL[fx.frequency]||fx.frequency}</Bdg></td>
                    <td data-label="المبلغ" style={{ fontWeight:800, color:"#7C3AED" }}>{Number(fx.amount).toLocaleString() + " ر"}</td>
                    <td data-label="الحالة">
                      {!fx.active
                        ? <Bdg bg="#F3F4F6" color="#6B7280">موقف</Bdg>
                        : paid
                          ? <Bdg bg="#DCFCE7" color="#166534">✓ مدفوع</Bdg>
                          : <Bdg bg="#FEF3C7" color="#92400E">⚠ لم يُسدَّد</Bdg>
                      }
                    </td>
                    <td data-label="">
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                        {!paid && fx.active && (
                          <button className="btn bsm" onClick={() => onPayFixedExpense?.(fx)}
                            style={{ background:"#059669", color:"#fff", padding:"5px 10px", fontSize:12 }}>✓ تسديد</button>
                        )}
                        <button className="btn bsm" onClick={async () => { await db("fixed_expenses","PATCH",{active:!fx.active},fx.id); onReload?.(); }}
                          style={{ background: fx.active ? "#F5E6E6" : "#EEF0E9", color: fx.active ? "#8B3A3A" : "#3D7A5A", padding:"5px 10px", fontSize:12 }}>
                          {fx.active ? "إيقاف" : "تفعيل"}
                        </button>
                        <button className="btn bd bsm" onClick={async () => { if(window.confirm("حذف هذا المصروف الثابت؟")){await db("fixed_expenses","DELETE",null,fx.id); onReload?.();} }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          />
        </div>
      )}

      {/* تكاليف الصيانة */}
      {fm.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🔧 تكاليف الصيانة (" + fm.length + ")"}</div>
          <DataTable heads={["الشاليه","المشكلة","التاريخ","التكلفة"]}
            rows={fm.map(m => (
              <tr key={m.id}>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{m.chalet}</td>
                <td data-label="المشكلة">{m.issue}</td>
                <td data-label="التاريخ">{formatDate(m.maint_date)}</td>
                <td data-label="التكلفة" style={{ fontWeight:700, color:"#8B3A3A" }}>{Number(m.cost).toLocaleString() + " ر"}</td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#8B3A3A", fontSize:15 }}>{mex.toLocaleString() + " ر"}</td>,
            ]}
          />
        </div>
      )}

      {/* المصاريف */}
      {fex.length > 0 && (
        <div className="card" style={{ overflow:"hidden", marginBottom:16 }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{"💸 المصاريف (" + fex.length + ")"}</span>
            <span style={{ fontWeight:800, color:"#8B3A3A" }}>{exTotal.toLocaleString() + " ر"}</span>
          </div>
          <DataTable heads={["التاريخ","الشاليه","الفئة","المبلغ","ملاحظة","حذف"]}
            rows={[...fex].reverse().map((e, i) => (
              <tr key={i}>
                <td data-label="التاريخ" style={{ fontSize:12 }}>{formatDate(e.expense_date)}</td>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{e.chalet}</td>
                <td data-label="الفئة"><Bdg bg="#FEF3C7" color="#92400E">{e.category}</Bdg></td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:"#8B3A3A" }}>{Number(e.amount).toLocaleString() + " ر"}</td>
                <td data-label="ملاحظة" style={{ color:T, fontSize:12 }}>{e.note || "-"}</td>
                <td data-label=""><button className="btn bd bsm" onClick={async () => { await db("expenses","DELETE",null,e.id); onReload?.(); }}>🗑️</button></td>
              </tr>
            ))}
            footer={[
              <td key={0} colSpan={3} style={{ fontWeight:800, color:B }}>الإجمالي</td>,
              <td key={1} style={{ fontWeight:800, color:"#8B3A3A", fontSize:15 }}>{exTotal.toLocaleString() + " ر"}</td>,
              <td key={2}/>, <td key={3}/>,
            ]}
          />
        </div>
      )}

      {/* معاملات التأمين */}
      {ft.length > 0 && (
        <div className="card" style={{ overflow:"hidden" }}>
          <div style={{ padding:"12px 16px", borderBottom:"2px solid rgba(197,172,136,.2)", fontWeight:700, color:B, fontSize:14, background:SL }}>{"🛡️ معاملات التأمين (" + ft.length + ")"}</div>
          <DataTable heads={["التاريخ","الشاليه","النوع","المبلغ","ملاحظة","إجراءات"]}
            rows={[...ft].reverse().map((t, i) => (
              <tr key={i}>
                <td data-label="التاريخ">{formatDate(t.trans_date)}</td>
                <td data-label="الشاليه" style={{ fontWeight:600 }}>{t.chalet}</td>
                <td data-label="النوع"><Bdg bg={t.type==="إيداع"?"#EEF0E9":"#F5E6E6"} color={t.type==="إيداع"?SD:"#8B3A3A"}>{t.type}</Bdg></td>
                <td data-label="المبلغ" style={{ fontWeight:700, color:t.type==="إيداع"?T:"#8B3A3A" }}>{(t.type==="إيداع"?"+":"-") + t.amount.toLocaleString() + " ر"}</td>
                <td data-label="ملاحظة" style={{ color:T, fontSize:12 }}>{t.note || "-"}</td>
                <td data-label="">
                  <div style={{ display:"flex", gap:4 }}>
                    <button className="btn be bsm" onClick={() => onEdit?.(t)}>تعديل</button>
                    <button className="btn bd bsm" onClick={async () => { if (window.confirm("حذف هذا الصف؟")) { await db("wallet","DELETE",null,t.id); onReload?.(); } }}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          />
        </div>
      )}
    </div>
  );
}
