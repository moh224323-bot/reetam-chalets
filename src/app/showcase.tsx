import { useEffect, useRef, useState } from "react";

const logoImg = require("../../assets/logo-reetam.png");

// رقم واتساب مجموعة ريتام — استبدله بالرقم الفعلي بصيغة 9665xxxxxxxx
const WHATSAPP_NUMBER = "9665XXXXXXXX";

const BROWN      = "#413523";
const BROWN_DARK = "#2A2218";
const SAND       = "#C5AC88";
const SAND_LIGHT = "#F5EFE6";
const SAGE       = "#8D9577";
const SAGE_DARK  = "#6B7258";
const TEAL       = "#576D6F";
const OFF_WHITE  = "#FAF8F5";
const WHITE      = "#FFFFFF";

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap');
  @font-face{font-family:'YaModern';src:url('/assets/YaModernPro-Bold.otf') format('opentype');font-weight:700;font-display:swap}
  *,*::before,*::after{box-sizing:border-box}
  html,body{overflow-y:auto!important;height:auto!important;min-height:100vh;background:${OFF_WHITE}}
  #root{height:auto;overflow:visible}

  @keyframes sway        { 0%,100%{ transform: rotate(-3deg) } 50%{ transform: rotate(3deg) } }
  @keyframes swayBig     { 0%,100%{ transform: rotate(-2deg) } 50%{ transform: rotate(2deg) } }
  @keyframes kenBurns    { from{ transform: scale(1) } to{ transform: scale(1.09) } }
  @keyframes sunPulse    { 0%,100%{ opacity:.55; transform: scale(1) } 50%{ opacity:.85; transform: scale(1.08) } }
  @keyframes floatUp     { 0%{ transform: translateY(0); opacity:0 } 12%{ opacity:.8 } 90%{ opacity:0 } 100%{ transform: translateY(-160px); opacity:0 } }
  @keyframes brickIn     { from{ opacity:0; transform: translateY(10px) scale(.85) } to{ opacity:1; transform: translateY(0) scale(1) } }
  @keyframes bounceDown  { 0%,100%{ transform: translateY(0); opacity:.6 } 50%{ transform: translateY(8px); opacity:1 } }
  @keyframes fadeUp      { from{ opacity:0; transform: translateY(22px) } to{ opacity:1; transform: translateY(0) } }
  @keyframes shimmerGold { 0%{ background-position: 200% center } 100%{ background-position: -200% center } }

  .rt-hero-scene   { animation: kenBurns 22s ease-in-out infinite alternate; }
  .rt-palm-sm .rt-fronds { transform-origin: 50% 100%; animation: sway 4.2s ease-in-out infinite; }
  .rt-palm-lg .rt-fronds { transform-origin: 50% 100%; animation: swayBig 5.4s ease-in-out infinite; }
  .rt-particle     { position:absolute; bottom:0; border-radius:50%; background:${SAND}; animation:floatUp linear infinite; }
  .rt-brick        { animation: brickIn .5s cubic-bezier(.2,.8,.3,1) backwards; }
  .rt-scrolldown   { animation: bounceDown 1.8s ease-in-out infinite; }
  .rt-nav-link:hover{ opacity:.7 }
  .rt-cta:hover    { filter: brightness(1.06); transform: translateY(-2px); }
  .rt-cta          { transition: transform .2s ease, filter .2s ease, box-shadow .2s ease; }
  .rt-feature:hover{ transform: translateY(-4px); box-shadow: 0 14px 34px rgba(65,53,35,.14); }
  .rt-feature      { transition: transform .25s ease, box-shadow .25s ease; }
  .rt-gold-text    {
    background: linear-gradient(90deg, ${SAND}, #E7D3A8, ${SAND});
    background-size: 200% auto;
    -webkit-background-clip: text; background-clip: text; color: transparent;
    animation: shimmerGold 5s linear infinite;
  }

  @media (max-width: 760px) {
    .rt-hide-mobile { display:none !important; }
    .rt-h1 { font-size: 34px !important; line-height:1.25 !important; }
    .rt-section-pad { padding: 56px 18px !important; }
  }
`;

// ─────────────────────────────────────────────────────────────────────────

function useIsMobile() {
  const [mobile, setMobile] = useState(typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !ref.current) { setVisible(true); return; }
    const el = ref.current;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.18 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(28px)",
      transition: `opacity .8s cubic-bezier(.16,1,.3,1) ${delay}s, transform .8s cubic-bezier(.16,1,.3,1) ${delay}s`,
    }}>
      {children}
    </div>
  );
}

// شجرة نخيل SVG بسيطة — تتمايل مع نسيم الأحساء
function PalmTree({ size = 120, dark = BROWN_DARK, big = false }: { size?: number; dark?: string; big?: boolean }) {
  const w = size, h = size * 1.3;
  return (
    <svg width={w} height={h} viewBox="0 0 100 130" style={{ display: "block", overflow: "visible" }}>
      <path d="M48 130 C 46 90, 44 60, 50 30" stroke={dark} strokeWidth="5" fill="none" strokeLinecap="round" />
      <g className="rt-fronds" style={{ transformBox: "fill-box" }}>
        {[
          "M50 30 C 30 20, 8 22, 2 12",
          "M50 30 C 34 14, 20 -2, 22 -14",
          "M50 30 C 48 10, 50 -8, 58 -18",
          "M50 30 C 64 16, 80 8, 90 -4",
          "M50 30 C 66 24, 90 26, 98 16",
          "M50 30 C 40 18, 34 2, 40 -10",
        ].map((d, i) => (
          <path key={i} d={d} stroke={dark} strokeWidth={big ? 6 : 4.5} fill="none" strokeLinecap="round" opacity={0.92} />
        ))}
      </g>
    </svg>
  );
}

function FloatingParticles({ count = 14 }: { count?: number }) {
  const particles = Array.from({ length: count }, (_, i) => ({
    left: (i * 97) % 100,
    size: 3 + ((i * 37) % 5),
    dur: 8 + ((i * 13) % 10),
    delay: (i * 1.7) % 12,
  }));
  return (
    <>
      {particles.map((p, i) => (
        <span key={i} className="rt-particle" style={{
          left: `${p.left}%`, width: p.size, height: p.size,
          animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`,
        }} />
      ))}
    </>
  );
}

// جدار طوب يُبنى — يحاكي فيديو مراحل البناء
function BrickWall({ rows = 5, cols = 12 }: { rows?: number; cols?: number }) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column-reverse", gap: 4, width: "100%", maxWidth: 460 }}>
      {visible && Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: "flex", gap: 4, marginRight: r % 2 === 1 ? 14 : 0 }}>
          {Array.from({ length: cols }, (_, c) => {
            const i = r * cols + c;
            return (
              <div key={c} className="rt-brick" style={{
                flex: 1, height: 16, borderRadius: 2,
                background: (r + c) % 3 === 0 ? SAND : "#B99B72",
                animationDelay: `${i * 0.025}s`,
              }} />
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

export default function ShowcasePage() {
  const isMobile = useIsMobile();
  const [scrolled, setScrolled] = useState(false);
  const navSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    }
  }, []);

  // الجذر في React Native Web يُنشئ حاوية تمرير داخلية بدل تمرير window،
  // فنكتشف تجاوز الهيدر عبر رؤية عنصر بدل الاستماع لحدث scroll على window
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !navSentinelRef.current) return;
    const el = navSentinelRef.current;
    const obs = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("مرحباً، أرغب بالاستفسار عن مشروع شاليهات ريتام في الأحساء")}`;

  const container: React.CSSProperties = { maxWidth: 1080, margin: "0 auto", padding: "0 24px" };

  const features = [
    { icon: "🧱", title: "بناء متين", text: "أساسات وجدران من الأسمنت المسلّح والطابوق العازل، مصمّمة لتتحمّل حرارة الأحساء صيفاً وبرودتها شتاءً." },
    { icon: "🌴", title: "يحاكي الطبيعة", text: "تشطيبات خشبية دافئة، حجر طبيعي، وفتحات تهوية تحاكي واحة النخيل المحيطة بدل مقاومتها." },
    { icon: "🏜️", title: "هوية ريفية أصيلة", text: "عمارة مستوحاة من البيوت الطينية التراثية في الأحساء، بلمسة عصرية في التوزيع الداخلي والخدمات." },
  ];

  const phases = [
    { n: "01", t: "الأساس", d: "حفر وتسليح القواعد الخرسانية لتثبيت البناء على تربة الواحة." },
    { n: "02", t: "الطوب والجدران", d: "رفع الجدران بالطابوق العازل حراريًا، طبقة فوق طبقة." },
    { n: "03", t: "السقف والعزل", d: "تسقيف مقاوم للحرارة مع عزل مائي وحراري كامل." },
    { n: "04", t: "التشطيب الريفي", d: "خشب، حجر، وألوان ترابية تدمج الشاليه بمحيطه الطبيعي." },
  ];

  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal',sans-serif", background: OFF_WHITE, minHeight: "100vh", color: BROWN, overflowX: "hidden" }}>
      <style>{CSS}</style>

      {/* ── Nav ── */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", transition: "background .3s ease, box-shadow .3s ease",
        background: scrolled ? "rgba(250,248,245,.92)" : "transparent",
        backdropFilter: scrolled ? "blur(8px)" : "none",
        boxShadow: scrolled ? "0 2px 16px rgba(65,53,35,.08)" : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: WHITE, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(0,0,0,.15)" }}>
            <img src={logoImg} width={30} height={30} style={{ objectFit: "contain" }} />
          </div>
          <span style={{ fontWeight: 900, fontSize: 15, color: scrolled ? BROWN : WHITE, transition: "color .3s" }}>مجموعة ريتام</span>
        </div>
        <div className="rt-hide-mobile" style={{ display: "flex", gap: 26, fontSize: 13.5, fontWeight: 700 }}>
          {[["المشروع", "#idea"], ["مراحل البناء", "#phases"], ["الموقع", "#location"], ["تواصل", "#contact"]].map(([label, href]) => (
            <a key={href} href={href} className="rt-nav-link" style={{ color: scrolled ? TEAL : "rgba(255,255,255,.9)", textDecoration: "none", transition: "color .3s" }}>{label}</a>
          ))}
        </div>
        <a href={waLink} target="_blank" rel="noreferrer" className="rt-cta" style={{
          background: BROWN, color: SAND, borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 800, textDecoration: "none",
        }}>تواصل معنا</a>
      </div>

      {/* ── Hero ── */}
      <div style={{ position: "relative", height: isMobile ? "88vh" : "100vh", minHeight: 560, overflow: "hidden" }}>
        <div ref={navSentinelRef} style={{ position: "absolute", top: 70, height: 1, width: 1 }} />
        <div className="rt-hero-scene" style={{
          position: "absolute", inset: -20,
          background: `linear-gradient(180deg, #EFE0BE 0%, ${SAND} 38%, #8A6B45 68%, ${BROWN_DARK} 100%)`,
        }}>
          {/* الشمس */}
          <div style={{
            position: "absolute", top: "18%", left: "50%", transform: "translateX(-50%)",
            width: 160, height: 160, borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,244,214,.95), rgba(255,244,214,0) 70%)",
            animation: "sunPulse 5s ease-in-out infinite",
          }} />
          {/* كثبان */}
          <svg viewBox="0 0 1000 220" preserveAspectRatio="none" style={{ position: "absolute", bottom: 0, width: "100%", height: "34%" }}>
            <path d="M0,140 C 180,80 320,180 520,120 C 700,70 860,150 1000,100 L1000,220 L0,220 Z" fill={BROWN_DARK} opacity="0.55" />
            <path d="M0,180 C 220,140 380,210 560,160 C 760,110 880,190 1000,150 L1000,220 L0,220 Z" fill={BROWN_DARK} />
          </svg>
          {/* نخيل */}
          <div style={{ position: "absolute", bottom: "6%", right: "6%" }} className="rt-palm-lg"><PalmTree size={150} dark={BROWN_DARK} big /></div>
          <div style={{ position: "absolute", bottom: "4%", right: "20%" }} className="rt-palm-sm"><PalmTree size={90} dark={BROWN_DARK} /></div>
          <div style={{ position: "absolute", bottom: "5%", left: "8%" }} className="rt-palm-lg"><PalmTree size={130} dark={BROWN_DARK} big /></div>
          <div style={{ position: "absolute", bottom: "3%", left: "24%" }} className="rt-palm-sm"><PalmTree size={75} dark={BROWN_DARK} /></div>
          <FloatingParticles />
        </div>

        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(42,34,24,.15), rgba(42,34,24,.55))" }} />

        <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 20px" }}>
          <div style={{
            display: "inline-block", background: "rgba(255,255,255,.14)", border: "1px solid rgba(255,255,255,.3)",
            color: WHITE, borderRadius: 99, padding: "6px 18px", fontSize: 12.5, fontWeight: 700, marginBottom: 20,
            animation: "fadeUp .8s ease both",
          }}>🌴 مشروع شاليهات ريفي — الأحساء</div>

          <h1 className="rt-h1" style={{
            fontFamily: "'YaModern','Tajawal',sans-serif", color: WHITE, fontSize: isMobile ? 34 : 54,
            fontWeight: 900, lineHeight: 1.2, maxWidth: 820, animation: "fadeUp .9s .1s ease both",
          }}>
            بناء من الأسمنت والطابوق<br />
            <span className="rt-gold-text">يحاكي نخيل الأحساء وطبيعتها</span>
          </h1>

          <p style={{ color: "rgba(255,255,255,.88)", fontSize: isMobile ? 14.5 : 17, maxWidth: 620, marginTop: 18, lineHeight: 1.9, animation: "fadeUp .9s .22s ease both" }}>
            شاليه ريفي متكامل يُبنى بجودة إنشائية عالية، وسط واحة النخيل، بتصميم يمزج بين متانة البناء الحديث وروح الطبيعة والتراث في الأحساء.
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap", justifyContent: "center", animation: "fadeUp .9s .34s ease both" }}>
            <a href="#idea" className="rt-cta" style={{ background: SAND, color: BROWN_DARK, borderRadius: 12, padding: "14px 30px", fontWeight: 800, fontSize: 14.5, textDecoration: "none" }}>اكتشف المشروع</a>
            <a href={waLink} target="_blank" rel="noreferrer" className="rt-cta" style={{ background: "rgba(255,255,255,.12)", border: "1.5px solid rgba(255,255,255,.5)", color: WHITE, borderRadius: 12, padding: "14px 30px", fontWeight: 800, fontSize: 14.5, textDecoration: "none" }}>📲 تواصل معنا</a>
          </div>
        </div>

        <div className="rt-scrolldown" style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", color: WHITE, fontSize: 22 }}>⌄</div>
      </div>

      {/* ── الفكرة ── */}
      <div id="idea" className="rt-section-pad" style={{ ...container, padding: "90px 24px 40px" }}>
        <Reveal>
          <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 46px" }}>
            <div style={{ color: SAGE_DARK, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>الفكرة</div>
            <h2 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: BROWN, marginTop: 8 }}>عمارة متينة، بروح الأحساء</h2>
            <p style={{ color: TEAL, fontSize: 14.5, lineHeight: 1.9, marginTop: 12 }}>
              لا نبني شاليهاً فحسب، بل نعيد تفسير بيوت الطين والنخيل التراثية بلغة إنشائية حديثة — أسمنت وطابوق يمنحان المتانة، وتفاصيل طبيعية تمنح الدفء والانتماء للمكان.
            </p>
          </div>
        </Reveal>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: 18 }}>
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.12}>
              <div className="rt-feature card" style={{ background: WHITE, borderRadius: 18, padding: 26, border: `1px solid rgba(197,172,136,.25)`, height: "100%" }}>
                <div style={{ fontSize: 30, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontWeight: 800, fontSize: 16, color: BROWN, marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: TEAL, fontSize: 13.5, lineHeight: 1.8 }}>{f.text}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* ── مراحل البناء ── */}
      <div id="phases" className="rt-section-pad" style={{ background: SAND_LIGHT, padding: "90px 24px" }}>
        <div style={container}>
          <Reveal>
            <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 50px" }}>
              <div style={{ color: SAGE_DARK, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>خطوة بخطوة</div>
              <h2 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: BROWN, marginTop: 8 }}>مراحل بناء الشاليه</h2>
            </div>
          </Reveal>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4,1fr)", gap: 16, marginBottom: 50 }}>
            {phases.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.1}>
                <div style={{ background: WHITE, borderRadius: 16, padding: 22, border: "1px solid rgba(197,172,136,.25)", height: "100%" }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: SAND, fontFamily: "'YaModern','Tajawal',sans-serif" }}>{p.n}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: BROWN, marginTop: 8, marginBottom: 6 }}>{p.t}</div>
                  <div style={{ color: TEAL, fontSize: 13, lineHeight: 1.8 }}>{p.d}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <div style={{ color: TEAL, fontSize: 13, fontWeight: 700 }}>محاكاة مرئية لرفع جدار الطابوق</div>
              <BrickWall />
            </div>
          </Reveal>
        </div>
      </div>

      {/* ── التصميم الطبيعي ── */}
      <div className="rt-section-pad" style={{ padding: "90px 24px" }}>
        <div style={{ ...container, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.1fr .9fr", gap: 40, alignItems: "center" }}>
          <Reveal>
            <div>
              <div style={{ color: SAGE_DARK, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>التصميم</div>
              <h2 style={{ fontSize: isMobile ? 22 : 30, fontWeight: 900, color: BROWN, marginTop: 8, marginBottom: 16 }}>البناء يحتضن الطبيعة، لا يحجبها</h2>
              <div style={{ color: TEAL, fontSize: 14.5, lineHeight: 2 }}>
                نوافذ وفتحات موجّهة نحو النخيل، ممرات مظللة تحاكي حركة الشمس، وخامات طبيعية (خشب، حجر، طين محروق) تُدمج مع الأسمنت والطابوق لتخفيف صلابة البناء وربطه بصريًا بمحيطه الأخضر.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
                {["تهوية طبيعية", "ظلال دائمة", "ألوان ترابية", "لمسات خشبية"].map(tag => (
                  <span key={tag} style={{ background: SAND_LIGHT, color: BROWN, borderRadius: 99, padding: "7px 16px", fontSize: 12.5, fontWeight: 700, border: "1px solid rgba(197,172,136,.3)" }}>✓ {tag}</span>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.15}>
            <div style={{ position: "relative", borderRadius: 22, overflow: "hidden", aspectRatio: "4/3", background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DARK})` }}>
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-around", padding: "0 10px" }}>
                <div style={{ transform: "translateY(6%)" }} className="rt-palm-sm"><PalmTree size={70} dark="rgba(42,34,24,.75)" /></div>
                <div style={{ transform: "translateY(0)" }} className="rt-palm-lg"><PalmTree size={95} dark="rgba(42,34,24,.85)" /></div>
                <div style={{ transform: "translateY(10%)" }} className="rt-palm-sm"><PalmTree size={60} dark="rgba(42,34,24,.7)" /></div>
              </div>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(42,34,24,.35), transparent 55%)" }} />
            </div>
          </Reveal>
        </div>
      </div>

      {/* ── الموقع ── */}
      <div id="location" className="rt-section-pad" style={{ background: `linear-gradient(135deg, ${BROWN}, ${BROWN_DARK})`, padding: "90px 24px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, opacity: 0.5, display: "flex", justifyContent: "space-between", padding: "0 4%" }}>
          {Array.from({ length: isMobile ? 4 : 8 }, (_, i) => (
            <div key={i} className={i % 2 ? "rt-palm-sm" : "rt-palm-lg"}><PalmTree size={i % 2 ? 60 : 85} dark="rgba(197,172,136,.5)" /></div>
          ))}
        </div>
        <div style={{ ...container, position: "relative", textAlign: "center", maxWidth: 700 }}>
          <Reveal>
            <div style={{ color: SAND, fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>الموقع</div>
            <h2 style={{ fontSize: isMobile ? 24 : 32, fontWeight: 900, color: WHITE, marginTop: 8, marginBottom: 16 }}>وسط واحة الأحساء</h2>
            <p style={{ color: "rgba(255,255,255,.8)", fontSize: 14.5, lineHeight: 2 }}>
              الأحساء، أكبر واحة نخيل في العالم وموقع تراث عالمي لليونسكو، تمنح المشروع خلفية طبيعية فريدة من بساتين النخيل والمياه الجوفية والأجواء الريفية الأصيلة — بيئة مثالية لشاليه يُبنى ليعيش داخل الطبيعة لا بجانبها.
            </p>
          </Reveal>
        </div>
      </div>

      {/* ── تواصل ── */}
      <div id="contact" className="rt-section-pad" style={{ padding: "90px 24px 60px", textAlign: "center" }}>
        <Reveal>
          <div style={{ width: 84, height: 84, borderRadius: "50%", background: SAND_LIGHT, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
            <img src={logoImg} width={64} height={64} style={{ objectFit: "contain" }} />
          </div>
          <h2 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, color: BROWN, marginBottom: 12 }}>يهمك تفاصيل المشروع؟</h2>
          <p style={{ color: TEAL, fontSize: 14, maxWidth: 480, margin: "0 auto 26px", lineHeight: 1.9 }}>
            تواصل مع فريق مجموعة ريتام لمعرفة مراحل الإنجاز، التصاميم، وموعد الافتتاح.
          </p>
          <a href={waLink} target="_blank" rel="noreferrer" className="rt-cta" style={{ display: "inline-block", background: "#25D366", color: WHITE, borderRadius: 14, padding: "15px 34px", fontWeight: 800, fontSize: 15, textDecoration: "none" }}>
            📲 تواصل عبر واتساب
          </a>
        </Reveal>

        <div style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid rgba(197,172,136,.25)", color: TEAL, fontSize: 12.5 }}>
          © {new Date().getFullYear()} مجموعة ريتام — الأحساء
        </div>
      </div>
    </div>
  );
}
