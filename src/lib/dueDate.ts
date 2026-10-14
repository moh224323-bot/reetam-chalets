import { FixedExpense } from "./types";

export interface DueInfo {
  nextDue: string;      // ISO date (yyyy-mm-dd) لتاريخ الاستحقاق القادم
  daysUntil: number;    // سالب = متأخر، صفر = اليوم، موجب = متبقي
}

/** عدد الأيام قبل الاستحقاق اللي يبدأ عندها التنبيه (شهر تقريباً). */
export const RENT_REMINDER_DAYS = 30;

/**
 * يُنسّق تاريخ الاستحقاق بالتقويم الميلادي صراحة — بعض المتصفحات (خصوصاً Safari على iOS) تعرض
 * التقويم الهجري افتراضياً مع locale "ar-SA" بدون هذا التحديد. كذلك نفرض أرقاماً غربية (nu-latn)
 * ليطابق باقي أرقام التطبيق (المبالغ وعدّاد الأيام)، بدل الأرقام الهندية الافتراضية لـ"ar-SA".
 */
export function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { day:"numeric", month:"long" });
}

/**
 * تاريخ الاستحقاق القادم لتذكير الإيجار، بناءً فقط على يوم الاستحقاق وآخر مرة اعتُرف فيها بالتذكير
 * (last_acknowledged) — هذا تذكير بصري بحت ولا علاقة له بجدول المصاريف، فالتأكيد عليه لا يسجّل أي مصروف.
 */
export function nextDueInfo(fx: FixedExpense): DueInfo | null {
  if (!fx.due_day) return null;
  const step = fx.frequency === "monthly" ? 1 : fx.frequency === "quarterly" ? 3 : 12;
  const day = Math.min(Math.max(Math.round(fx.due_day), 1), 28);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  let due: Date;
  if (fx.last_acknowledged) {
    const la = new Date(fx.last_acknowledged);
    due = new Date(la.getFullYear(), la.getMonth() + step, day);
  } else {
    due = new Date(today.getFullYear(), today.getMonth(), day);
  }

  const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
  return { nextDue: due.toISOString().slice(0, 10), daysUntil };
}
