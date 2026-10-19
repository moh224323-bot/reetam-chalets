import { useState, useEffect, useCallback, useMemo } from "react";
import { Icon, Pill, SAR, PageHead, Seg, Empty, type Tone } from "./ds";

type Status = "idea" | "ready" | "scheduled" | "published" | "skipped";
type Kind = "poster" | "story" | "video";

interface Post {
  id: number;
  kind: Kind;
  chalet: string | null;
  title: string | null;
  caption: string | null;
  hashtags: string | null;
  platforms: string[] | null;
  offer: { price?: number; old_price?: number; valid_from?: string; valid_to?: string } | null;
  canva_url: string | null;
  preview_url: string | null;
  source_url: string | null;
  scheduled_at: string | null;
  status: Status;
  approved: boolean;
  published_at: string | null;
  post_url: string | null;
}

type Filter = "all" | "waiting" | "scheduled" | "published" | "late";

const STATUS_UI: Record<Status, { label: string; tone: Tone }> = {
  idea:      { label: "فكرة تصوير",     tone: "muted" },
  ready:     { label: "بانتظار اعتمادك", tone: "warn" },
  scheduled: { label: "معتمد ومجدول",   tone: "info" },
  published: { label: "منشور",          tone: "ok" },
  skipped:   { label: "متخطّى",         tone: "muted" },
};

const KIND_LABEL: Record<Kind, string> = { poster: "بوستر", story: "ستوري", video: "فيديو" };
const PLATFORM_LABEL: Record<string, string> = { instagram: "إنستقرام", tiktok: "تيك توك" };

const TZ = "Asia/Riyadh";
const LOCALE = "ar-SA-u-ca-gregory-nu-latn";
const dayKey   = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(LOCALE, { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { timeZone: TZ, hour: "numeric", minute: "2-digit" });

const isDone    = (p: Post) => p.status === "published" || p.status === "skipped";
const isLate    = (p: Post) => !isDone(p) && !!p.scheduled_at && new Date(p.scheduled_at).getTime() < Date.now();
const isWaiting = (p: Post) => p.status === "ready" || p.status === "idea";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all",       label: "الكل" },
  { key: "waiting",   label: "بانتظار اعتمادك" },
  { key: "scheduled", label: "مجدولة" },
  { key: "published", label: "منشورة" },
  { key: "late",      label: "متأخرة" },
];

export default function MarketingTab({ supabase }: { supabase: any }) {
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<Filter>("all");
  const [open, setOpen]       = useState<number | null>(null);
  const [busy, setBusy]       = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase
      .from("social_posts")
      .select("*")
      .order("scheduled_at", { ascending: true, nullsFirst: false });
    if (error) setError(error.message); else setPosts((data ?? []) as Post[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const update = async (p: Post, patch: Partial<Post> & Record<string, unknown>) => {
    setBusy(p.id);
    const { error } = await supabase.from("social_posts").update(patch).eq("id", p.id);
    setBusy(null);
    if (error) { alert("ما انحفظ التعديل: " + error.message); return; }
    setPosts(prev => prev.map(x => (x.id === p.id ? { ...x, ...patch } as Post : x)));
  };

  const approve       = (p: Post) => update(p, { approved: true, approved_at: new Date().toISOString(), status: "scheduled" });
  const markPublished = (p: Post) => update(p, { status: "published", published_at: new Date().toISOString() });
  const skip          = (p: Post) => update(p, { status: "skipped" });
  const undo          = (p: Post) => update(p, { status: p.approved ? "scheduled" : (p.kind === "video" ? "idea" : "ready"), published_at: null });

  const counts = useMemo(() => ({
    all: posts.length,
    waiting: posts.filter(isWaiting).length,
    scheduled: posts.filter(p => p.status === "scheduled").length,
    published: posts.filter(p => p.status === "published").length,
    late: posts.filter(isLate).length,
  }), [posts]);

  const visible = useMemo(() => posts.filter(p => {
    if (filter === "waiting")   return isWaiting(p);
    if (filter === "scheduled") return p.status === "scheduled";
    if (filter === "published") return p.status === "published";
    if (filter === "late")      return isLate(p);
    return true;
  }), [posts, filter]);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; items: Post[] }>();
    for (const p of visible) {
      const k = p.scheduled_at ? dayKey(p.scheduled_at) : "zzz";
      if (!m.has(k)) m.set(k, { label: p.scheduled_at ? dayLabel(p.scheduled_at) : "بدون موعد", items: [] });
      m.get(k)!.items.push(p);
    }
    return Array.from(m.entries()).sort((a, b) => a[0] < b[0] ? -1 : 1).map(([, v]) => v);
  }, [visible]);

  if (loading && posts.length === 0) {
    return <div className="x-card"><Empty>⏳ جاري تحميل المنشورات...</Empty></div>;
  }

  return (
    <div className="x-page">
      <PageHead title="التسويق" sub={posts.length ? "منشورات التواصل الاجتماعي المجهّزة تلقائياً" : undefined}>
        <button className="btn bo bsm" onClick={load}>تحديث</button>
      </PageHead>

      {error && (
        <div className="x-card x-pad" style={{ color: "var(--bad)", fontSize: 13 }}>⚠️ تعذّر تحميل المنشورات: {error}</div>
      )}

      {posts.length === 0 ? (
        <div className="x-card"><Empty>لا توجد منشورات بعد</Empty></div>
      ) : (
        <>
          <Seg label="تصفية المنشورات" value={filter} onChange={v => setFilter(v)}
            options={FILTERS.map(f => ({ v: f.key, l: f.label, c: counts[f.key] }))}/>

          {visible.length === 0 ? (
            <div className="x-card"><Empty>لا يوجد شيء في هذا التصنيف</Empty></div>
          ) : (
            groups.map((g, gi) => (
              <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="x-sub" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon n="cal" s={15}/>{g.label}
                </div>
                <div className="cg">
                  {g.items.map(p => (
                    <PostCard
                      key={p.id} post={p} isOpen={open === p.id} busy={busy === p.id}
                      onToggle={() => setOpen(o => (o === p.id ? null : p.id))}
                      onApprove={() => approve(p)} onPublish={() => markPublished(p)}
                      onSkip={() => skip(p)} onUndo={() => undo(p)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function PostCard({ post, isOpen, busy, onToggle, onApprove, onPublish, onSkip, onUndo }: {
  post: Post; isOpen: boolean; busy: boolean;
  onToggle: () => void;
  onApprove: () => void; onPublish: () => void; onSkip: () => void; onUndo: () => void;
}) {
  const st = STATUS_UI[post.status];
  const late = isLate(post);

  return (
    <div className="x-card" style={{ display: "flex", flexDirection: "column", opacity: busy ? .6 : 1, pointerEvents: busy ? "none" : "auto" }}>
      <div onClick={onToggle} style={{ cursor: "pointer", position: "relative", height: 150, overflow: "hidden", background: "linear-gradient(135deg,#3B2A1C,#241A11)" }}>
        {post.preview_url
          ? <img src={post.preview_url} alt={post.title || ""} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} loading="lazy"/>
          : <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.35)" }}><Icon n="image" s={36}/></div>}
        <div style={{ position: "absolute", top: 10, right: 10 }}><Pill tone={st.tone}>{st.label}</Pill></div>
        {late && <div style={{ position: "absolute", top: 10, left: 10 }}><Pill tone="bad">متأخر</Pill></div>}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(23,19,15,.85))", padding: "20px 14px 10px" }}>
          <span style={{ color: "#F3EADC", fontWeight: 600, fontSize: 12 }}>{KIND_LABEL[post.kind]}{post.chalet ? " · " + post.chalet : ""}</span>
        </div>
      </div>

      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
        {post.title && <b style={{ fontSize: 14, color: "var(--text)" }}>{post.title}</b>}
        {post.scheduled_at && (
          <span className={late ? "x-neg" : "x-muted"} style={{ fontSize: 12, fontWeight: late ? 700 : 400, display: "flex", alignItems: "center", gap: 5 }}>
            <Icon n="clock" s={13}/>{timeLabel(post.scheduled_at)}
          </span>
        )}

        {isOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {post.caption && <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, whiteSpace: "pre-wrap", margin: 0 }}>{post.caption}</p>}
            {post.hashtags && <span style={{ fontSize: 12, color: "var(--link)" }}>{post.hashtags}</span>}
            {post.offer && (post.offer.price != null || post.offer.old_price != null) && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px" }}>
                {post.offer.old_price != null && <span style={{ fontSize: 13, color: "var(--text2)", textDecoration: "line-through" }}><SAR v={post.offer.old_price}/></span>}
                {post.offer.price != null && <b style={{ fontSize: 15, color: "var(--bad)" }}><SAR v={post.offer.price}/></b>}
              </div>
            )}
            {!!post.platforms?.length && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {post.platforms.map(pl => <Pill key={pl} tone="muted">{PLATFORM_LABEL[pl] || pl}</Pill>)}
              </div>
            )}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {post.canva_url && <a href={post.canva_url} target="_blank" rel="noopener noreferrer" className="x-back" style={{ fontSize: 12 }}>تصميم Canva</a>}
              {post.source_url && <a href={post.source_url} target="_blank" rel="noopener noreferrer" className="x-back" style={{ fontSize: 12 }}>المصدر</a>}
              {post.post_url && <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="x-back" style={{ fontSize: 12 }}>رابط المنشور</a>}
            </div>
          </div>
        )}

        <button onClick={onToggle} className="x-back" style={{ fontSize: 11.5 }}>
          {isOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
        </button>

        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: "auto" }}>
          {isWaiting(post) && (
            <>
              <button className="btn bp bsm" style={{ flex: 1 }} onClick={onApprove}><Icon n="check" s={15}/>اعتماد</button>
              <button className="btn bo bsm" onClick={onSkip}>تخطي</button>
            </>
          )}
          {post.status === "scheduled" && (
            <>
              <button className="btn bp bsm" style={{ flex: 1 }} onClick={onPublish}><Icon n="check" s={15}/>تم النشر</button>
              <button className="btn bo bsm" onClick={onUndo}>تراجع</button>
            </>
          )}
          {(post.status === "published" || post.status === "skipped") && (
            <button className="btn bo bsm" style={{ flex: 1 }} onClick={onUndo}>تراجع</button>
          )}
        </div>
      </div>
    </div>
  );
}
