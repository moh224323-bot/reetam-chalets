// نظام التصميم الموحّد لريتام — أيقونات، ترويسة الصفحة، بطاقات الأرقام، الشارات، أزرار التبديل.
// التنسيقات نفسها في CSS داخل app/index.tsx (أصناف تبدأ بـ x-).
import React from "react";

const PATHS: Record<string, React.ReactNode> = {
  dashboard:   <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  home:        <><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></>,
  cal:         <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  money:       <><rect x="2" y="6" width="20" height="13" rx="2"/><circle cx="12" cy="12.5" r="2.5"/><path d="M6 9.5v6M18 9.5v6"/></>,
  users:       <><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/></>,
  wrench:      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>,
  wallet:      <><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13.5" r="1.2"/></>,
  broom:       <><path d="M19 3l-7 7"/><path d="M12 10c-3 0-6 2-7 5l-2 6 6-2c3-1 5-4 5-7z"/></>,
  temp:        <path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>,
  trophy:      <><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8"/></>,
  gear:        <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></>,
  sun:         <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></>,
  moon:        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>,
  menu:        <path d="M4 7h16M4 12h16M4 17h16"/>,
  plus:        <path d="M12 5v14M5 12h14"/>,
  back:        <path d="M9 18l6-6-6-6"/>,
  chev:        <path d="M15 18l-6-6 6-6"/>,
  pin:         <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></>,
  edit:        <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16z"/>,
  share:       <><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></>,
  link:        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>,
  qr:          <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 20h4v-3"/></>,
  target:      <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>,
  trash:       <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>,
  camera:      <><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></>,
  star:        <path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"/>,
  check:       <path d="M5 12l5 5 9-10"/>,
  x:           <path d="M6 6l12 12M18 6L6 18"/>,
  clock:       <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  door:        <><path d="M14 3H6v18h8"/><path d="M14 3l5 2v14l-5 2z"/></>,
  msg:         <path d="M4 5h16v11H8l-4 4z"/>,
  pool:        <><path d="M2 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M8 15V5a2 2 0 0 1 4 0M16 15V5a2 2 0 0 0-4 0M8 9h8"/></>,
  bell:        <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></>,
  receipt:     <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></>,
  download:    <path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>,
  send:        <><path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/></>,
  search:      <><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></>,
  power:       <><path d="M12 3v9"/><path d="M6.3 6.3a8 8 0 1 0 11.4 0"/></>,
  trend:       <><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></>,
  info:        <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></>,
  shield:      <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>,
  ban:         <><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></>,
  dots:        <path d="M12 5h.01M12 12h.01M12 19h.01"/>,
  bank:        <path d="M3 10l9-6 9 6M5 10v8M19 10v8M9.5 10v8M14.5 10v8M3 20h18"/>,
  globe:       <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></>,
  image:       <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></>,
  gift:        <><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1"/></>,
  ticket:      <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/>,
};

export function Icon({ n, s = 18, style }: { n: string; s?: number; style?: React.CSSProperties }) {
  const p = PATHS[n];
  if (!p) return null;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex:"none", ...style }}>{p}</svg>
  );
}

export type Tone = "ok" | "bad" | "warn" | "info" | "muted" | "";

export function Pill({ tone = "muted", dot, children }: { tone?: Tone; dot?: boolean; children: React.ReactNode }) {
  return <span className={"x-pill " + tone}>{dot && <span className="x-dot"/>}{children}</span>;
}

/** مبلغ بالريال مع إشارة سالب صحيحة داخل صفحة RTL */
export function SAR({ v, unit = true, className }: { v: number; unit?: boolean; className?: string }) {
  const n = Math.round(Number(v) || 0);
  return (
    <span className={className} style={{ whiteSpace:"nowrap" }}>
      <span className="x-num" dir="ltr" style={{ unicodeBidi:"isolate" }}>{n < 0 ? "−" : ""}{Math.abs(n).toLocaleString("en-US")}</span>
      {unit && <small className="x-unit"> ر.س</small>}
    </span>
  );
}

export function PageHead({ title, sub, children, back }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; back?: { label: string; onClick: () => void } }) {
  return (
    <>
      {back && <button type="button" className="x-back" onClick={back.onClick}><Icon n="back" s={16}/>{back.label}</button>}
      <div className="x-ph">
        <div style={{ minWidth:0 }}>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {children && <div className="x-ph-actions">{children}</div>}
      </div>
    </>
  );
}

export function Kpi({ label, value, sub, badge, hero, tone, children }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; badge?: React.ReactNode; hero?: boolean; tone?: "neg" | "pos"; children?: React.ReactNode }) {
  return (
    <div className={"x-kpi" + (hero ? " hero" : "")}>
      <span className="k">{label}{badge}</span>
      <span className={"v" + (tone ? " x-" + tone : "")}>{value}</span>
      {children}
      {sub && <span className="s">{sub}</span>}
    </div>
  );
}

export function Seg<T extends string | number>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { v: T; l: React.ReactNode; c?: number | string }[]; label: string }) {
  return (
    <div className="x-seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={String(o.v)} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>
          {o.l}{o.c !== undefined && <span className="c">{o.c}</span>}
        </button>
      ))}
    </div>
  );
}

export function CardHead({ icon, title, sub, children }: { icon?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="x-card-h">
      <h2>{icon && <Icon n={icon}/>}{title}{sub && <span className="x-sub">{sub}</span>}</h2>
      {children && <div className="x-toolbar">{children}</div>}
    </div>
  );
}

export function Track({ pct, tone, h }: { pct: number; tone?: "ok" | "warn" | "bad" | ""; h?: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="x-track" style={h ? { height:h } : undefined}>
      <div className={"x-fill " + (tone || "")} style={{ width: w + "%", minWidth: w > 0 ? 4 : 0 }}/>
    </div>
  );
}

export const toneFor = (pct: number, good = 60, mid = 40): "ok" | "warn" | "bad" => pct >= good ? "ok" : pct >= mid ? "warn" : "bad";

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="x-empty">{children}</div>;
}
