import { FixedExpense, WalletTransaction } from "./types";

export interface RentCycleInfo {
  nextDue: string;      // ISO date (yyyy-mm-dd) لبداية شهر الاستحقاق القادم
  daysUntil: number;    // سالب = متأخر، صفر = اليوم، موجب = متبقي
  totalDue: number;     // الإيجار السنوي الكامل (fx.amount)
  paid: number;         // المسحوب من محفظة الإيجار لهذه الدورة حتى الآن
  remaining: number;    // المتبقي = الكامل - المدفوع (لا يقل عن 0)
  fullyPaid: boolean;
}

/** عدد الأيام قبل الاستحقاق اللي يبدأ عندها التنبيه (شهر تقريباً). */
export const RENT_REMINDER_DAYS = 30;

export const MONTH_NAMES = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

/**
 * يُنسّق تاريخ الاستحقاق بالتقويم الميلادي صراحة — بعض المتصفحات (خصوصاً Safari على iOS) تعرض
 * التقويم الهجري افتراضياً مع locale "ar-SA" بدون هذا التحديد. كذلك نفرض أرقاماً غربية (nu-latn)
 * ليطابق باقي أرقام التطبيق (المبالغ وعدّاد الأيام)، بدل الأرقام الهندية الافتراضية لـ"ar-SA".
 */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day:"numeric", month:"long" });
}

/** مجموع السحوبات من محفظة الإيجار لهذا الشاليه منذ آخر دورة اكتملت (last_acknowledged). */
export function rentPaidThisCycle(fx: FixedExpense, wallet: WalletTransaction[]): number {
  return wallet
    .filter(t => t.chalet === fx.chalet && t.type === "سحب إيجار" && (!fx.last_acknowledged || t.trans_date > fx.last_acknowledged))
    .reduce((s, t) => s + Number(t.amount), 0);
}

/**
 * دورة استحقاق الإيجار السنوي — بناءً على شهر الاستحقاق (due_month) فقط بدون يوم محدد، ومربوطة
 * بمحفظة الإيجار: الدورة لا تُعتبر منتهية (ولا يتقدّم تاريخ الاستحقاق لسنة قادمة) إلا لما يوصل
 * مجموع السحب الفعلي للمبلغ الكامل — دفعة جزئية تبقي التذكير شغّال لنفس الشهر بالمتبقي.
 */
export function rentCycleInfo(fx: FixedExpense, wallet: WalletTransaction[]): RentCycleInfo | null {
  if (!fx.due_month) return null;
  const month = Math.min(Math.max(Math.round(fx.due_month), 1), 12) - 1;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let due: Date;
  if (fx.last_acknowledged) {
    const la = new Date(fx.last_acknowledged);
    due = new Date(la.getFullYear() + 1, month, 1);
  } else {
    due = new Date(today.getFullYear(), month, 1);
  }

  const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
  const totalDue = Number(fx.amount) || 0;
  const paid = rentPaidThisCycle(fx, wallet);
  const remaining = Math.max(0, totalDue - paid);
  return { nextDue: due.toISOString().slice(0, 10), daysUntil, totalDue, paid, remaining, fullyPaid: remaining <= 0 };
}
