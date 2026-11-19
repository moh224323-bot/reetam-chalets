import type { Booking, Expense, Investor, InvestorShare, InvestorStatement, MaintenanceRequest } from "./types";

// كشف الربح والخسارة الشهري لشاليه واحد، وحصة كل شريك منه.
//
// القواعد المحاسبية:
// - الإيرادات = الحجوزات المكتملة (المحصّلة فعلاً) اللي يبدأ تاريخها في الشهر.
// - المصاريف = كل مصاريف الشاليه المسجلة في الشهر (إيجار، تنظيف، كهرباء، تأمين، اشتراكات...).
// - رسوم الإدارة = نسبة الشاليه من الإيرادات.
// - الصيانة تُصرف من محفظة التأمين (اللي يغذيها مصروف التأمين)، فما تنخصم مرة ثانية؛
//   تظهر في الكشف كمعلومة "صُرف من احتياطي التأمين" للشفافية فقط.

export type StatementCalc = Omit<InvestorStatement, "id" | "closed_at" | "closed_by" | "note">;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeStatement(
  chalet: string,
  period: string,
  feePct: number,
  bookings: Booking[],
  expenses: Expense[],
  maint: MaintenanceRequest[],
  investors: Investor[],
): StatementCalc {
  const inPeriod = (d?: string | null) => !!d && d.slice(0, 7) === period;
  const done = bookings.filter(b => b.chalet === chalet && b.status === "completed" && inPeriod(b.date_from));
  const revenue = done.reduce((s, b) => s + (Number(b.price) || 0), 0);

  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    if (e.chalet !== chalet || !inPeriod(e.expense_date)) continue;
    const amt = Number(e.amount) || 0;
    if (!amt) continue;
    byCat[e.category || "غيره"] = (byCat[e.category || "غيره"] || 0) + amt;
  }
  const expensesTotal = Object.values(byCat).reduce((s, v) => s + v, 0);
  const pct = Number(feePct) || 0;
  const mgmtFee = round2(revenue * pct / 100);
  const net = round2(revenue - expensesTotal - mgmtFee);

  const reserveSpent = maint
    .filter(m => m.chalet === chalet && m.status === "done" && inPeriod(m.maint_date))
    .reduce((s, m) => s + (Number(m.cost) || 0), 0);

  const shares: InvestorShare[] = investors
    .filter(iv => iv.chalet === chalet)
    .map(iv => ({ investor_id: iv.id, name: iv.name, pct: Number(iv.percentage) || 0, amount: round2(net * (Number(iv.percentage) || 0) / 100) }));

  return {
    chalet, period, revenue, bookings_count: done.length,
    expenses: byCat, expenses_total: expensesTotal,
    mgmt_fee_pct: pct, mgmt_fee: mgmtFee, net, shares, reserve_spent: reserveSpent,
  };
}

/** آخر N شهر بصيغة YYYY-MM، الأحدث أولاً */
export function recentPeriods(n = 12, from = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth() - i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** رصيد الشريك: مستحق من الكشوف المُقفلة فقط − المدفوع له */
export function investorBalance(investorId: number, statements: InvestorStatement[], paid: number): { due: number; paid: number; balance: number } {
  const due = round2(statements.reduce((s, st) => s + (st.shares.find(x => x.investor_id === investorId)?.amount || 0), 0));
  return { due, paid: round2(paid), balance: round2(due - paid) };
}
