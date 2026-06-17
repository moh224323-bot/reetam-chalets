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
