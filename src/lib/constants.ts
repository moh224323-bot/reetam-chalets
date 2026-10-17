export const BOOKING_STATUS = {
  confirmed: { label:"مؤكد",        color:"#6B5F52", bg:"#E8F0F0" },
  pending:   { label:"معلق",        color:"#7A5A0E", bg:"#FBF3DF" },
  cancelled: { label:"ملغي",        color:"#A63A2A", bg:"#FBEDEA" },
  completed: { label:"مكتمل",       color:"#2E7D52", bg:"#E6F1EA" },
} as const;

export const MAINTENANCE_STATUS = {
  open:        { label:"مفتوح",       color:"#A63A2A", bg:"#FBEDEA" },
  in_progress: { label:"قيد التنفيذ", color:"#7A5A0E", bg:"#FBF3DF" },
  done:        { label:"منتهي",       color:"#1E6B45", bg:"#E6F1EA" },
} as const;

export const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Noto+Kufi+Arabic:wght@600;700&display=swap');

  :root {
    --bg:      #F5F0E8;
    --surface: #FFFFFF;
    --border:  rgba(201,163,106,.2);
    --border2: rgba(201,163,106,.35);
    --text:    #3B2A1C;
    --text2:   #6B5F52;
    --text3:   #C8C9CA;
    --inp-bg:  #FFFFFF;
    --row-hov: #FAF6F0;
    --th-bg:   #FAF6F0;
    --mdl-bg:  rgba(59,42,28,.55);
  }
  [data-theme="dark"] {
    --bg:      #0E0C0A;
    --surface: #1A1612;
    --border:  rgba(201,163,106,.12);
    --border2: rgba(201,163,106,.25);
    --text:    #E8DDD0;
    --text2:   #8FA8AA;
    --text3:   #4A4A4A;
    --inp-bg:  #221E19;
    --row-hov: #201C17;
    --th-bg:   #1A1612;
    --mdl-bg:  rgba(0,0,0,.7);
  }

  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body{overflow-y:auto!important;height:auto!important;min-height:100vh;background:var(--bg);color:var(--text)}
  #root{height:auto;overflow:visible}
  input,select,textarea{font-family:'IBM Plex Sans Arabic',sans-serif}
  ::-webkit-scrollbar{width:6px}
  ::-webkit-scrollbar-thumb{background:#3A3530;border-radius:3px}
  [data-theme="dark"] ::-webkit-scrollbar-thumb{background:#2A2520}

  .card{background:var(--surface);border-radius:16px;box-shadow:0 2px 16px rgba(0,0,0,.06);border:1px solid var(--border)}
  .btn{border:none;cursor:pointer;border-radius:10px;font-family:'IBM Plex Sans Arabic',sans-serif;font-weight:700;transition:all .18s;font-size:14px}
  .btn:hover{filter:brightness(.93);transform:translateY(-1px)}
  .bp{background:#3B2A1C;color:#C9A36A;padding:10px 22px}
  [data-theme="dark"] .bp{background:#C9A36A;color:#1A1612}
  .bo{background:transparent;color:var(--text);padding:10px 20px;border:2px solid #C9A36A}
  .bd{background:#A63A2A;color:#fff;padding:7px 14px;font-size:13px}
  .be{background:var(--row-hov);color:var(--text);padding:7px 14px;font-size:13px;border:1px solid var(--border2)}
  .bsm{padding:5px 12px;font-size:13px}

  .tbl{width:100%;border-collapse:collapse;min-width:520px}
  .tbl-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;width:100%}
  th{background:var(--th-bg);color:var(--text2);font-size:13px;font-weight:700;padding:12px 14px;text-align:right;border-bottom:2px solid var(--border2);white-space:nowrap}
  td{padding:12px 14px;border-bottom:1px solid var(--border);font-size:13px;color:var(--text)}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:var(--row-hov)}

  .bdg{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap}
  .inp{width:100%;padding:10px 14px;border:1.5px solid var(--border2);border-radius:10px;font-size:14px;outline:none;transition:border .2s;color:var(--text);background:var(--inp-bg)}
  .inp:focus{border-color:#6B5F52}
  .lbl{font-size:13px;color:var(--text2);margin-bottom:5px;display:block;font-weight:600}
  .mbg{position:fixed;inset:0;background:var(--mdl-bg);display:flex;align-items:center;justify-content:center;z-index:200;padding:16px}
  .mbox{background:var(--surface);border-radius:20px;padding:24px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;border:1px solid var(--border)}
  .cc{background:var(--surface);border-radius:16px;overflow:hidden;transition:transform .2s,box-shadow .2s;border:1px solid var(--border)}
  .cc:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,.15)}

  .sg{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
  .g2{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .cg{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:16px}
  .ig{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
  .mg{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}

  @media(max-width:600px){
    .mbox{padding:16px;border-radius:14px}
    th,td{padding:8px;font-size:12px}
    h2{font-size:18px!important}
    .sg{grid-template-columns:repeat(2,1fr)}
    .g2{grid-template-columns:1fr}
  }
`;
