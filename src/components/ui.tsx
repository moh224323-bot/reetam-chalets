import { useState } from "react";
import { B, S, SL } from "../lib/colors";

// شارة ملونة
export function Bdg({ bg, color, children }: { bg: string; color: string; children: React.ReactNode }) {
  return <span className="bdg" style={{ background: bg, color }}>{children}</span>;
}

// عنوان قسم مع خط تزييني
export function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={{ color: B, fontWeight: 800, fontSize: 22 }}>{title}</h2>
      <div style={{ width: 50, height: 3, background: S, borderRadius: 99, marginTop: 5 }}/>
    </div>
  );
}

// نافذة modal
export function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="mbg" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mbox">
        <h3 style={{ fontWeight: 800, color: B, marginBottom: 18, fontSize: 17 }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// زر حفظ مع مؤشر تحميل
export function SaveBtn({ onClick, label = "حفظ", disabled }: { onClick: () => Promise<void>; label?: string; disabled?: boolean }) {
  const [saving, setSaving] = useState(false);

  async function handle() {
    if (saving || disabled) return;
    setSaving(true);
    try { await onClick(); } finally { setSaving(false); }
  }

  return (
    <button className="btn bp" onClick={handle} disabled={saving || disabled}
      style={{ minWidth: 100, opacity: (saving || disabled) ? 0.75 : 1 }}>
      {saving ? <Dots/> : label}
    </button>
  );
}

function Dots() {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
      <span>جاري الحفظ</span>
      <span style={{ display:"inline-flex", gap:3, marginRight:4 }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width:5, height:5, borderRadius:"50%", background:"currentColor",
            animation:"dotPulse 1.2s ease-in-out infinite",
            animationDelay: `${i*0.2}s`,
            display:"inline-block",
          }}/>
        ))}
      </span>
    </span>
  );
}

// جدول بيانات مع header و footer اختياري
export function DataTable({
  heads,
  rows,
  footer,
}: {
  heads: string[];
  rows: React.ReactNode;
  footer?: React.ReactNode[];
}) {
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{heads.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows}
          {footer && <tr style={{ background: SL }}>{footer}</tr>}
        </tbody>
      </table>
    </div>
  );
}
