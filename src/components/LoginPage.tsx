import { useState } from "react";
import { db, hashPassword } from "../lib/db";
import { B, T } from "../lib/colors";
import Logo from "./Logo";

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800&display=swap');*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}.inp{width:100%;padding:10px 14px;border:1.5px solid rgba(197,172,136,.4);border-radius:10px;font-size:14px;outline:none;transition:border .2s;color:#413523;background:#fff}.inp:focus{border-color:#576D6F}.lbl{font-size:13px;color:#576D6F;margin-bottom:5px;display:block;font-weight:600}`;

interface Props {
  onLogin: (user: any) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [login,   setLogin]   = useState("");
  const [pass,    setPass]    = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin() {
    if (!login || !pass) { setErr("أدخل بيانات الدخول"); return; }
    setLoading(true); setErr("");

    let user: any = null;
    const r1 = await db("users", "GET", null, "email=eq." + encodeURIComponent(login) + "&select=*");
    if (r1 && r1[0]) user = r1[0];
    if (!user) {
      const r2 = await db("users", "GET", null, "username=eq." + encodeURIComponent(login) + "&select=*");
      if (r2 && r2[0]) user = r2[0];
    }
    if (!user) { setErr("بيانات الدخول غير صحيحة"); setLoading(false); return; }

    const hashed      = await hashPassword(pass);
    const isHashed    = user.password === hashed;
    const isPlaintext = !isHashed && user.password === pass;

    if (!isHashed && !isPlaintext) { setErr("بيانات الدخول غير صحيحة"); setLoading(false); return; }

    if (isPlaintext) {
      await db("users", "PATCH", { password: hashed }, user.id);
      user = { ...user, password: hashed };
    }

    const { password: _omit, ...safeUser } = user;
    localStorage.setItem("reetam_user", JSON.stringify(safeUser));
    onLogin(safeUser);
    setLoading(false);
  }

  return (
    <div dir="rtl" style={{ fontFamily:"'Tajawal',sans-serif", minHeight:"100vh", background:"#FAF8F5", display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <style>{CSS}</style>
      <div style={{ background:"#fff", borderRadius:20, padding:32, maxWidth:400, width:"100%", boxShadow:"0 8px 40px rgba(65,53,35,.12)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <Logo size={50}/>
          <div style={{ fontWeight:800, color:B, fontSize:20, marginTop:12 }}>مجموعة ريتام</div>
          <div style={{ color:T, fontSize:13, marginTop:4 }}>نظام إدارة الشاليهات</div>
        </div>
        {err && <div style={{ background:"#FFF5F5", border:"1px solid rgba(139,58,58,.2)", borderRadius:10, padding:"10px 14px", marginBottom:16, fontSize:13, color:"#8B3A3A", fontWeight:600 }}>{err}</div>}
        <div style={{ marginBottom:14 }}>
          <label className="lbl">البريد أو اسم المستخدم</label>
          <input className="inp" value={login} onChange={e=>setLogin(e.target.value)} placeholder="admin" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{ marginBottom:20 }}>
          <label className="lbl">كلمة المرور</label>
          <input className="inp" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <button onClick={doLogin} disabled={loading}
          style={{ width:"100%", border:"none", cursor:loading?"not-allowed":"pointer", borderRadius:12, fontFamily:"'Tajawal',sans-serif", fontWeight:700, fontSize:16, padding:14, background:"linear-gradient(135deg,#413523,#2A2218)", color:"#C5AC88" }}>
          {loading ? "جاري التحقق..." : "تسجيل الدخول"}
        </button>
      </div>
    </div>
  );
}
