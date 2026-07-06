/* ثَروة — front-end: screen navigation + live AI chat (calls /api/chat) */
(function () {
  "use strict";
  var q = function (s, r) { return (r || document).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------- STATE ----------------
  var state = {
    balance: 24580.00,
    account: "الجاري · •••• 9000",
    income: 12000,
    budgets: {},
    expenses: { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 },
    beneficiaries: [
      { name: "أحمد العتيبي", bank: "مصرف الإنماء", iban: "SA44 0500 0068 2016 1234 9101" },
      { name: "سارة القحطاني", bank: "مصرف الراجحي", iban: "SA03 8000 0000 6080 1016 7519" },
      { name: "محمد الزهراني", bank: "البنك الأهلي SNB", iban: "SA71 1000 0011 2233 4455 6677" }
    ],
    invest: { monthly: 500, risk: "متوسط", goal: { name: "ادخار عام", amount: 20000, months: 24 } },
    txns: [
      { name: "مطعم النخيل", cat: "مطاعم", amount: 85, dir: "out", when: "اليوم 1:24 م" },
      { name: "سوبرماركت العثيم", cat: "تسوّق", amount: 243.5, dir: "out", when: "أمس 6:10 م" },
      { name: "راتب — شركة", cat: "دخل", amount: 12000, dir: "in", when: "27 يونيو" }
    ]
  };
  var history = []; // {role:'user'|'assistant', text}

  var ICON_TRANSFER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.5 21 6.5l-4 4"/><path d="M3 11V9.5a2 2 0 0 1 2-2h16"/><path d="M7 21.5 3 17.5l4-4"/><path d="M21 13v1.5a2 2 0 0 1-2 2H3"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="#37C98C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>';
  var ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="#F0796B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  var ICON_USERPLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/></svg>';
  var ICON_SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-3.6 8-10V5.5L12 2 4 5.5V12c0 6.4 8 10 8 10Z"/><path d="M12 8v4"/><path d="M12 15.5h.01"/></svg>';
  var ICON_SPK_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICON_SPK_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m16 9 6 6"/><path d="m22 9-6 6"/></svg>';

  // ---------------- HELPERS ----------------
  function fmt(n) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmt0(n) { return Math.round(Number(n)).toLocaleString("en-US"); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
  function deTashkeel(t) { return String(t || "").replace(/[ً-ْـ]/g, "").trim(); }

  // ---------------- NAVIGATION ----------------
  function show(id) {
    qa(".page").forEach(function (p) {
      p.classList.toggle("active", p.id === id);
      if (p.id === id) p.scrollTop = 0;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    // autofocus only on desktop — on phones it pops the keyboard over the greeting
    var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (id === "s-chat" && fine) { setTimeout(function () { var c = q("#cmd"); if (c) c.focus(); }, 60); }
    if (id === "s-chat") warmTts();
  }
  window.__tharwaShow = show;

  // ---------------- HOME RENDER ----------------
  function renderHome() {
    var amt = q("#s-home .amt");
    if (amt) {
      var v = fmt(state.balance).split(".");
      amt.innerHTML = v[0] + '<span class="dec">.' + v[1] + '</span>';
    }
  }
  function addTxn(name, sub, amount, plus) {
    var ul = q("#s-home .txns"); if (!ul) return;
    var li = document.createElement("li"); li.className = "tx";
    li.innerHTML = '<div class="ti">' + ICON_TRANSFER + '</div>'
      + '<div class="tm"><div class="tn">' + esc(name) + '</div><div class="td">' + esc(sub) + '</div></div>'
      + '<div class="ta ' + (plus ? "plus" : "minus") + '">' + fmt(amount) + (plus ? "+" : "−") + '</div>';
    ul.insertBefore(li, ul.firstChild);
    while (ul.children.length > 4) ul.removeChild(ul.lastChild);
  }

  // ---------------- BUDGETS (spend screen) ----------------
  function renderBudgets() {
    var wrap = q("#budgets"), list = q("#budgetlist");
    if (!wrap || !list) return;
    var keys = Object.keys(state.budgets || {});
    wrap.style.display = keys.length ? "block" : "none";
    list.innerHTML = "";
    keys.forEach(function (k) {
      var b = state.budgets[k], sp = state.expenses[k] || 0;
      var pc = Math.min(100, Math.round(sp / b * 100));
      var color = sp >= b ? "var(--red)" : (sp >= b * 0.7 ? "var(--gold)" : "var(--green)");
      var row = document.createElement("div");
      row.className = "brow";
      row.innerHTML = '<div class="bt"><span>' + esc(k) + '</span><span class="bv">' + fmt0(sp) + ' / ' + fmt0(b) + ' ر.س</span></div>'
        + '<div class="btrack"><span class="bfill" style="width:' + pc + '%;background:' + color + '"></span></div>';
      list.appendChild(row);
    });
  }

  // ---------------- INVEST SCREEN (goal-driven, compound growth) ----------------
  var RISKS = {
    "متحفظ": { pos: "88%", growth: 5.1, alloc: [30, 20, 50], word: "المتحفظ" },
    "متوسط": { pos: "50%", growth: 8.4, alloc: [60, 20, 20], word: "المتوسط" },
    "جريء": { pos: "12%", growth: 12.3, alloc: [80, 15, 5], word: "الجريء" }
  };
  function fvMonthly(monthly, annualPct, months) {
    var i = annualPct / 100 / 12;
    return Math.round(monthly * ((Math.pow(1 + i, months) - 1) / i));
  }
  function neededMonthly(target, annualPct, months) {
    var i = annualPct / 100 / 12;
    return Math.max(50, Math.ceil((target * i / (Math.pow(1 + i, months) - 1)) / 50) * 50);
  }
  function applyInvest(monthly, risk) {
    risk = deTashkeel(risk);
    if (!RISKS[risk]) risk = "متوسط";
    var r = RISKS[risk];
    monthly = Math.max(250, Math.min(20000, Math.round((Number(monthly) || state.invest.monthly || 500) / 50) * 50));
    var goal = (state.invest && state.invest.goal) || { name: "ادخار عام", amount: 20000, months: 24 };
    state.invest = { monthly: monthly, risk: risk, goal: goal };

    var gl = q("#inv-goal"); if (gl) gl.textContent = goal.name + " — " + fmt0(goal.amount) + " ر.س خلال " + goal.months + " شهراً";
    var nd = q("#inv-needed"); if (nd) nd.textContent = fmt0(neededMonthly(goal.amount, r.growth, goal.months)) + " ر.س شهرياً";
    var m = q("#inv-monthly"); if (m) m.textContent = fmt0(monthly);
    var k = q("#inv-knob"); if (k) k.style.left = r.pos;
    qa("#s-invest .rlabels span").forEach(function (sp) {
      sp.classList.toggle("on", deTashkeel(sp.textContent) === risk);
    });
    var g = q("#inv-growth"); if (g) g.textContent = "+" + r.growth + "%";
    var fills = qa("#s-invest .arow .fill"), pcs = qa("#s-invest .arow .pc");
    r.alloc.forEach(function (p, i) {
      if (fills[i]) fills[i].style.width = p + "%";
      if (pcs[i]) pcs[i].textContent = p + "%";
    });
    var w = q("#inv-risk-word"); if (w) w.textContent = r.word;
    var proj = fvMonthly(monthly, r.growth, goal.months);
    var mo = q("#inv-months"); if (mo) mo.textContent = goal.months;
    var pj = q("#inv-proj"); if (pj) pj.textContent = "~" + fmt0(proj) + " ر.س";
    var tr = q("#inv-track");
    if (tr) {
      var ok = proj >= goal.amount;
      tr.className = "tracknote " + (ok ? "ok" : "warn");
      tr.textContent = ok
        ? "الخطة تحقق هدفك — متوقع " + fmt0(proj) + " من " + fmt0(goal.amount) + " ر.س"
        : "أقل من هدفك بـ " + fmt0(goal.amount - proj) + " ر.س — زد القسط أو المدة";
    }
    var cta = q("#s-invest .cta .b");
    if (cta && cta.dataset.on) cta.innerHTML = ICON_CHECK + "الخطة مفعّلة — " + fmt0(monthly) + " ر.س شهرياً";
  }

  // ---------------- VOICE (Arabic speech-to-text + optional spoken replies) ----------------
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var TTS_KEY = "tharwa_tts";
  var ttsOn = false;       // voice replies — user setting (speaker toggle in chat header)
  try { ttsOn = localStorage.getItem(TTS_KEY) === "1"; } catch (e) {}
  var recognizing = false;
  var rec = null;

  var SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  var ttsNodes = [];
  var ttsNextT = 0; // shared Web Audio timeline so consecutive parts chain seamlessly
  var ttsGen = 0; // bump to cancel any in-flight speech
  var audioCtx = null;
  var ttsEl = null;      // one persistent <audio> — unlocked once by a tap, reused forever
  var elUnlocked = false;
  function getEl() {
    if (!ttsEl) {
      ttsEl = new Audio();
      ttsEl.setAttribute("playsinline", "");
    }
    return ttsEl;
  }
  function unlockEl() {
    // must run inside a user tap: playing a silent clip unlocks this element on phones
    if (elUnlocked) return;
    var el = getEl();
    try {
      el.src = SILENT_WAV;
      el.play().then(function () { elUnlocked = true; }).catch(function () {});
    } catch (e) {}
  }
  function getCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }
  function unlockAudio() {
    var c = getCtx();
    if (c && c.state === "suspended") { try { c.resume(); } catch (e) {} }
  }
  function stopSpeak() {
    ttsGen++;
    ttsNextT = 0;
    if (ttsEl) { ttsEl.onended = null; try { ttsEl.pause(); } catch (e) {} }
    for (var i = 0; i < ttsNodes.length; i++) { try { ttsNodes[i].stop(); } catch (e) {} }
    ttsNodes = [];
    if (window.speechSynthesis) { try { speechSynthesis.cancel(); } catch (e) {} }
  }
  function b64ToF32(b64) {
    var bin = atob(b64), n = bin.length >> 1;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var lo = bin.charCodeAt(i * 2), hi = bin.charCodeAt(i * 2 + 1);
      var v = (hi << 8) | lo;
      if (v >= 32768) v -= 65536;
      out[i] = v / 32768;
    }
    return out;
  }
  // wrap raw 16-bit PCM (from Gemini TTS) in a WAV header so <audio> can play it
  function pcmToWavUrl(b64, rate) {
    var bin = atob(b64), n = bin.length;
    var buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    function ws(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    ws(0, "RIFF"); v.setUint32(4, 36 + n, true); ws(8, "WAVE"); ws(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, bin.charCodeAt(i));
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  // emergency fallback only: browser/system voice (robotic — used if the server voice fails)
  function browserSpeak(text) {
    if (!window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "ar-SA";
      u.rate = 1.04;
      var vs = speechSynthesis.getVoices() || [];
      var v = vs.filter(function (x) { return /^ar/i.test(x.lang) && /natural|online/i.test(x.name); })[0]
        || vs.filter(function (x) { return /^ar/i.test(x.lang); })[0];
      if (v) u.voice = v;
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function warmTts() {
    if (!ttsOn) return;
    try { fetch("/api/tts").catch(function () {}); } catch (e) {}
  }
  function playEl(d, clean, onReady) {
    if (!ttsOn || !d || !d.a) { if (onReady) onReady(); browserSpeak(clean); return; }
    var el = getEl();
    el.src = d.m === "mp3" ? "data:audio/mpeg;base64," + d.a : pcmToWavUrl(d.a, d.r || 24000);
    if (onReady) onReady();
    el.play().catch(function () { browserSpeak(clean); });
  }
  function postSpeak(clean, myGen, onReady) {
    return fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean })
    }).then(function (r) { return r.json(); })
      .then(function (d) {
        if (myGen !== ttsGen) { if (onReady) onReady(); return; }
        playEl(d, clean, onReady);
      })
      .catch(function () { if (onReady) onReady(); browserSpeak(clean); });
  }
  // streaming (desktop): schedule PCM chunks through Web Audio as they arrive —
  // playback starts on the first chunk; onFirst fires right as audio begins
  function streamSpeak(clean, onFirst) {
    var ctx = getCtx();
    if (!ctx || !window.ReadableStream || !window.TextDecoder) return Promise.reject(0);
    var myGen = ttsGen;
    return fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, stream: 1 })
    }).then(function (resp) {
      if (!resp.ok || !resp.body) throw 0;
      var ct = resp.headers.get("content-type") || "";
      if (ct.indexOf("ndjson") === -1) {
        return resp.json().then(function (d) {
          if (myGen !== ttsGen) { if (onFirst) onFirst(); return; }
          playEl(d, clean, onFirst);
        });
      }
      var reader = resp.body.getReader(), dec = new TextDecoder();
      var buf = "", got = false;
      function pump() {
        return reader.read().then(function (rr) {
          if (myGen !== ttsGen || !ttsOn) { try { reader.cancel(); } catch (e) {} if (onFirst) onFirst(); return; }
          if (rr.value) buf += dec.decode(rr.value, { stream: true });
          var i;
          while ((i = buf.indexOf("\n")) > -1) {
            var line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line) continue;
            var obj; try { obj = JSON.parse(line); } catch (e) { continue; }
            if (obj.m === "mp3" && obj.a) { playEl(obj, clean, got ? null : onFirst); got = true; continue; }
            if (!obj.a) continue;
            var pcm = b64ToF32(obj.a);
            if (!pcm.length) continue;
            var ab = ctx.createBuffer(1, pcm.length, obj.r || 24000);
            ab.getChannelData(0).set(pcm);
            var srcN = ctx.createBufferSource();
            srcN.buffer = ab;
            srcN.connect(ctx.destination);
            if (!got && onFirst) onFirst();
            var t = Math.max(ctx.currentTime + (got ? 0 : 0.06), ttsNextT);
            srcN.start(t);
            ttsNextT = t + ab.duration;
            ttsNodes.push(srcN);
            got = true;
          }
          if (rr.done) { if (!got) throw 0; return; }
          return pump();
        });
      }
      return pump();
    });
  }
  // speakReady: fires onReady exactly once — at the moment audio starts,
  // or immediately on any failure/timeout, so the text is never held hostage
  function speakReady(text, onReady) {
    var fired = false;
    function go() { if (!fired) { fired = true; if (onReady) onReady(); } }
    if (!ttsOn || recognizing) { go(); return; }
    var full = String(text).replace(/\*\*/g, "").trim().slice(0, 300);
    if (!full) { go(); return; }
    stopSpeak();
    var myGen = ttsGen;
    var guard = setTimeout(go, 8000); // never hold the text hostage
    function ready() { clearTimeout(guard); go(); }
    var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!fine) {
      // phones: one full clip via the persistent unlocked <audio>
      postSpeak(full, myGen, ready);
      return;
    }
    // desktop: one full generation, streamed — playback starts on the first chunk
    streamSpeak(full, ready).catch(function () {
      if (myGen !== ttsGen || !ttsOn) { ready(); return; }
      postSpeak(full, myGen, ready);
    });
  }
  function speak(text) { speakReady(text, null); }

  // ---------------- CHAT UI ----------------
  var log;
  function scrollChat() {
    if (!log) return;
    try { log.scrollTo({ top: log.scrollHeight, behavior: "smooth" }); }
    catch (e) { log.scrollTop = log.scrollHeight; }
  }

  // keyboard-aware layout: expose keyboard height as --kb so the input bar
  // and chat stay visible above the on-screen keyboard (iOS Safari mainly)
  if (window.visualViewport) {
    var vvFix = function () {
      var kb = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
      document.documentElement.style.setProperty("--kb", Math.round(kb) + "px");
      if (kb > 0) scrollChat();
    };
    window.visualViewport.addEventListener("resize", vvFix);
    window.visualViewport.addEventListener("scroll", vvFix);
    vvFix();
  }
  function bubble(cls, html) {
    var d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html;
    log.appendChild(d); scrollChat(); return d;
  }
  function userMsg(t) { return bubble("bubble-user", esc(t)); }
  function botMsg(html) { return bubble("bubble-bot", html); }
  function successBubble(t) {
    var d = document.createElement("div"); d.className = "success";
    d.innerHTML = ICON_OK + esc(t); log.appendChild(d); scrollChat();
  }
  function errorBubble(t) {
    var d = document.createElement("div"); d.className = "success";
    d.style.background = "rgba(240,121,107,.14)"; d.style.color = "#F0796B";
    d.innerHTML = ICON_ERR + esc(t); log.appendChild(d); scrollChat();
  }
  function typingOn() {
    var t = document.createElement("div"); t.className = "typing";
    t.innerHTML = "<i></i><i></i><i></i>"; log.appendChild(t); scrollChat(); return t;
  }
  function cardRow(k, vHtml) {
    return '<div class="r"><span class="k">' + k + '</span>' + vHtml + '</div>';
  }

  // ---------------- TRANSFER CONFIRMATION CARD ----------------
  function renderConfirmCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var init = esc((a.recipient || "م").trim().charAt(0));
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_TRANSFER + '</span>تأكيد التحويل<span class="badge">تحويل فوري</span></div>'
      + cardRow("المستفيد", '<span class="who"><span class="pa">' + init + '</span><span class="v">' + esc(a.recipient) + '</span></span>')
      + (a.bank ? cardRow("البنك", '<span class="v">' + esc(a.bank) + '</span>') : "")
      + (a.iban ? cardRow("الآيبان", '<span class="v" style="direction:ltr;font-size:12.5px;letter-spacing:.3px">' + esc(a.iban) + '</span>') : "")
      + cardRow("من حساب", '<span class="v">' + esc(a.account || state.account) + '</span>')
      + '<div class="r big"><span class="k">المبلغ</span><span class="v">' + fmt(a.amount) + '<span class="c">ر.س</span></span></div>'
      + (a.warn ? '<div class="warnrow">' + ICON_SHIELD + '<span>' + esc(a.warn) + '</span></div>' : "")
      + '<div class="confirm"><button class="btn ok">' + ICON_CHECK + 'تأكيد التحويل</button><button class="btn no">إلغاء</button></div>';
    log.appendChild(card); scrollChat();

    function settle(label, color) {
      var c = q(".confirm", card); if (c) c.remove();
      var d = document.createElement("div"); d.className = "r";
      d.innerHTML = '<span class="k">الحالة</span><span class="v" style="color:' + color + '">' + label + '</span>';
      card.appendChild(d);
    }
    q(".btn.ok", card).onclick = function () {
      if (busy) return; busy = true;
      var t = typingOn();
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: { amount: a.amount, recipient: a.recipient }, state: state, history: history })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (t.parentNode) t.remove();
        if (data.error) { errorBubble(data.error); busy = false; return; }
        if (data.state) { state = data.state; renderBudgets(); }
        var ok = (data.actions || []).some(function (x) { return x.type === "transfer" && x.ok; });
        settle(ok ? "تم التنفيذ" : "فشل", ok ? "var(--green)" : "#F0796B");
        if (data.reply) { history.push({ role: "assistant", text: data.reply }); speak(data.reply); }
        applyActions(data.actions);
        busy = false;
      }).catch(function () {
        if (t.parentNode) t.remove();
        errorBubble("تعذّر الاتصال. حاول مرة ثانية.");
        busy = false;
      });
    };
    q(".btn.no", card).onclick = function () {
      settle("أُلغي", "var(--muted)");
      history.push({ role: "assistant", text: "تم إلغاء التحويل بناءً على طلب العميل." });
      botMsg("تم إلغاء العملية. تحتاج شيئاً آخر؟");
    };
  }

  // ---------------- BENEFICIARY CARD ----------------
  function renderBeneficiaryCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var init = esc((a.name || "م").trim().charAt(0));
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_USERPLUS + '</span>مستفيد جديد<span class="badge">تمت الإضافة</span></div>'
      + cardRow("الاسم", '<span class="who"><span class="pa">' + init + '</span><span class="v">' + esc(a.name) + '</span></span>')
      + cardRow("البنك", '<span class="v">' + esc(a.bank || "") + '</span>')
      + cardRow("الآيبان", '<span class="v" style="direction:ltr;font-size:12.5px;letter-spacing:.3px">' + esc(a.iban || "") + '</span>');
    log.appendChild(card); scrollChat();
  }

  // ---------------- ZAKAT CARD ----------------
  var ICON_COINS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 11v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5"/></svg>';
  function renderZakatCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_COINS + '</span>حاسبة الزكاة<span class="badge">2.5%</span></div>'
      + cardRow("رصيدك الحالي", '<span class="v">' + fmt(a.base) + '</span>')
      + '<div class="r big"><span class="k">زكاتك التقديرية</span><span class="v">' + fmt(a.amount) + '<span class="c">ر.س</span></span></div>'
      + '<div class="r" style="color:var(--muted);font-size:12.5px">تقدير توعوي — يفترض حولان الحول وبلوغ النصاب</div>';
    log.appendChild(card); scrollChat();
  }

  // ---------------- RECEIPT CARD (shareable) ----------------
  var ICON_RECEIPT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22l1-.5V2l-1 .5L16.5 2 14 3.5 11.5 2 9 3.5 6.5 2 4 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>';
  function renderReceiptCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var dt = new Date(a.ts || Date.now());
    var when = dt.toLocaleDateString("ar-SA-u-ca-gregory") + " · " + dt.toLocaleTimeString("ar-SA-u-ca-gregory", { hour: "2-digit", minute: "2-digit" });
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_RECEIPT + '</span>إيصال تحويل<span class="badge">ناجح</span></div>'
      + cardRow("المستفيد", '<span class="v">' + esc(a.recipient) + '</span>')
      + (a.bank ? cardRow("البنك", '<span class="v">' + esc(a.bank) + '</span>') : "")
      + (a.iban ? cardRow("الآيبان", '<span class="v" style="direction:ltr;font-size:12.5px;letter-spacing:.3px">' + esc(a.iban) + '</span>') : "")
      + cardRow("الرقم المرجعي", '<span class="v" style="direction:ltr">' + esc(a.ref || "") + '</span>')
      + cardRow("التاريخ", '<span class="v">' + esc(when) + '</span>')
      + '<div class="r big"><span class="k">المبلغ</span><span class="v">' + fmt(a.amount) + '<span class="c">ر.س</span></span></div>'
      + '<div class="confirm"><button class="btn share">' + ICON_SHARE + 'مشاركة الإيصال</button></div>';
    log.appendChild(card); scrollChat();
    var sb = q(".btn.share", card);
    sb.onclick = function () {
      var text = "إيصال تحويل — ثَروة\nالمبلغ: " + fmt(a.amount) + " ر.س\nالمستفيد: " + a.recipient
        + (a.bank ? " — " + a.bank : "") + (a.iban ? "\nالآيبان: " + a.iban : "")
        + "\nالرقم المرجعي: " + (a.ref || "") + "\nالتاريخ: " + when + "\nالحالة: ناجح";
      if (navigator.share) {
        navigator.share({ title: "إيصال تحويل — ثَروة", text: text }).catch(function () {});
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        sb.innerHTML = ICON_CHECK + "تم نسخ الإيصال";
      }
    };
  }

  // ---------------- APPLY ACTIONS FROM SERVER ----------------
  function applyActions(actions) {
    if (!actions) return;
    actions.forEach(function (a) {
      if (a.type === "confirm") {
        renderConfirmCard(a);
      } else if (a.type === "transfer" && a.ok) {
        successBubble("تم تحويل " + fmt(a.amount) + " ر.س إلى " + a.recipient + " بنجاح.");
        renderHome();
        addTxn("تحويل إلى " + a.recipient, "تحويل · الآن", a.amount, false);
      } else if (a.type === "transfer" && !a.ok) {
        errorBubble(a.message || "تعذّر تنفيذ التحويل.");
      } else if (a.type === "beneficiary") {
        renderBeneficiaryCard(a);
      } else if (a.type === "invest_plan") {
        applyInvest(a.monthly, a.risk);
        setTimeout(function () { show("s-invest"); }, 1100);
      } else if (a.type === "budget") {
        renderBudgets();
        successBubble("تم ضبط ميزانية " + a.category + ": " + fmt0(a.amount) + " ر.س شهرياً.");
        setTimeout(function () { show("s-spend"); }, 1100);
      } else if (a.type === "zakat") {
        renderZakatCard(a);
      } else if (a.type === "receipt") {
        renderReceiptCard(a);
      } else if (a.type === "open" && a.screen) {
        var map = { home: "s-home", spend: "s-spend", invest: "s-invest", chat: "s-chat" };
        var target = map[a.screen];
        if (target && target !== "s-chat") setTimeout(function () { show(target); }, 900);
      }
    });
  }
  window.__tharwaApply = applyActions;

  // ---------------- SEND TO AI ----------------
  var busy = false;
  function handle(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    if (recognizing && rec) { try { rec.stop(); } catch (e) {} }
    if (ttsOn) { unlockAudio(); unlockEl(); }
    busy = true;
    userMsg(text);
    var c = q("#cmd"); if (c) c.value = "";
    history.push({ role: "user", text: text });
    var t = typingOn();

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: history, state: state })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      if (!res.ok || res.data.error) {
        if (t.parentNode) t.remove();
        errorBubble(res.data && res.data.error ? res.data.error : "تعذّر الاتصال بالمساعد حالياً.");
        busy = false; return;
      }
      var data = res.data;
      if (data.state) { state = data.state; renderBudgets(); }
      if (data.reply) history.push({ role: "assistant", text: data.reply });
      var revealed = false;
      var reveal = function () {
        if (revealed) return;
        revealed = true;
        if (t.parentNode) t.remove();
        if (data.reply) botMsg(rich(data.reply));
        applyActions(data.actions);
        busy = false;
      };
      if (data.reply && ttsOn && !recognizing) {
        // voice on → keep the typing dots and reveal the text exactly when audio starts
        speakReady(data.reply, reveal);
      } else {
        reveal();
      }
    }).catch(function () {
      if (t.parentNode) t.remove();
      errorBubble("تعذّر الاتصال بالمساعد. تأكد من الاتصال بالإنترنت وحاول مرة ثانية.");
      busy = false;
    });
  }

  // ---------------- SUGGESTION CHIPS ----------------
  var CHIPS = [
    "حوّل 500 لأحمد",
    "أبي إيصال آخر تحويل",
    "أبي أجمع 30 ألف لسيارة خلال سنة",
    "احسب زكاتي",
    "حط ميزانية 1500 للمطاعم",
    "قيّم وضعي المالي",
    "كم صرفت على المطاعم؟",
    "أضف مستفيد جديد"
  ];

  // ---------------- INIT ----------------
  function init() {
    log = q("#chatlog");
    renderHome();
    renderBudgets();

    // greeting
    botMsg("أهلاً بك، أنا <b>ثَروة</b> — مساعدك البنكي الذكي. أنفّذ تحويلاتك، أحسب زكاتك، أضبط ميزانياتك، أقيّم وضعك المالي، وأجهّز لك خطة استثمار توصلك لهدفك. اكتب طلبك بلغتك الطبيعية أو اضغط زر <b>المايك</b> وتكلّم. ولو تبي ردوداً صوتية، فعّل زر <b>السماعة</b> بالأعلى.");

    var chips = q("#chips");
    if (chips) CHIPS.forEach(function (cText) {
      var b = document.createElement("div"); b.className = "sgchip"; b.textContent = cText;
      b.onclick = function () { handle(cText); };
      chips.appendChild(b);
    });

    var send = q("#send"); if (send) send.onclick = function () { handle(q("#cmd").value); };
    var cmd = q("#cmd"); if (cmd) cmd.addEventListener("keydown", function (e) { if (e.key === "Enter") handle(cmd.value); });

    // voice-reply setting: speaker toggle in the chat header (persisted)
    var spk = q("#spk");
    function renderSpk() {
      if (!spk) return;
      spk.classList.toggle("on", ttsOn);
      spk.innerHTML = ttsOn ? ICON_SPK_ON : ICON_SPK_OFF;
    }
    if (spk) {
      renderSpk();
      spk.onclick = function () {
        ttsOn = !ttsOn;
        try { localStorage.setItem(TTS_KEY, ttsOn ? "1" : "0"); } catch (e) {}
        if (!ttsOn) stopSpeak();
        else {
          // unlock audio inside this tap → phones allow later playback
          unlockEl();
          unlockAudio();
          warmTts();
        }
        renderSpk();
        successBubble(ttsOn ? "تم تفعيل الرد الصوتي — بأقرأ لك الردود." : "تم إيقاف الرد الصوتي.");
      };
    }

    // mic: real Arabic speech recognition (Web Speech API); fallback fills a sample command
    var mic = q("#mic");
    if (mic) {
      if (SR) {
        var PH = cmd ? cmd.placeholder : "";
        var vbase = ""; // text already in the field when the mic starts — dictation appends, never erases
        rec = new SR();
        rec.lang = "ar-SA";
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        rec.onresult = function (e) {
          if (busy) return;
          var txt = "", fin = false;
          for (var i = 0; i < e.results.length; i++) {
            txt += e.results[i][0].transcript;
            if (e.results[i].isFinal) fin = true;
          }
          if (cmd) cmd.value = vbase + txt;
          // done listening → leave the text in the field for the user to review and send
          if (fin) { try { rec.stop(); } catch (err) {} }
        };
        rec.onend = function () {
          recognizing = false;
          mic.classList.remove("rec");
          if (cmd) cmd.placeholder = PH;
        };
        rec.onerror = function () {
          recognizing = false;
          mic.classList.remove("rec");
          if (cmd) cmd.placeholder = PH;
        };
        mic.onclick = function () {
          if (recognizing) { try { rec.stop(); } catch (err) {} return; }
          stopSpeak();
          recognizing = true;
          mic.classList.add("rec");
          vbase = (cmd && cmd.value.trim()) ? cmd.value.replace(/\s+$/, "") + " " : "";
          if (cmd) cmd.placeholder = "أسمعك… تكلّم الآن";
          try { rec.start(); } catch (err) { recognizing = false; mic.classList.remove("rec"); }
        };
      } else {
        mic.onclick = function () { if (cmd) { cmd.value = "حوّل 500 لأحمد"; cmd.focus(); } };
      }
    }
    var cb = q("#chatback"); if (cb) cb.onclick = function () { show("s-home"); };

    // home wiring
    var fab = q("#s-home .fab"); if (fab) fab.onclick = function () { show("s-chat"); };
    qa("#s-home .qa").forEach(function (a) {
      var lb = q(".lb", a); var t = lb ? lb.textContent : "";
      if (t.indexOf("المساعد") > -1 || t.indexOf("تحويل") > -1) a.onclick = function () { show("s-chat"); };
      else if (t.indexOf("استثمار") > -1) a.onclick = function () { show("s-invest"); };
      else if (t.indexOf("دفع") > -1) a.onclick = function () { show("s-spend"); };
    });
    qa("#s-home .sec a").forEach(function (x) { x.onclick = function () { show("s-spend"); }; });
    qa("#s-home .bnav .nv").forEach(function (n) {
      var t = n.textContent || "";
      if (t.indexOf("تحويل") > -1) n.onclick = function () { show("s-chat"); };
      else if (t.indexOf("الرئيسية") > -1) n.onclick = function () { show("s-home"); };
    });

    // back buttons
    var sb = q("#s-spend .th .back"); if (sb) sb.onclick = function () { show("s-home"); };
    var ib = q("#s-invest .th .back"); if (ib) ib.onclick = function () { show("s-home"); };

    // invest interactivity
    var minus = q("#inv-minus"), plus = q("#inv-plus");
    if (minus) minus.onclick = function () { applyInvest(state.invest.monthly - 250, state.invest.risk); };
    if (plus) plus.onclick = function () { applyInvest(state.invest.monthly + 250, state.invest.risk); };
    qa("#s-invest .rlabels span").forEach(function (sp) {
      sp.onclick = function () { applyInvest(state.invest.monthly, sp.textContent); };
    });
    var cta = q("#s-invest .cta .b");
    if (cta) cta.onclick = function () {
      cta.dataset.on = "1";
      cta.style.background = "var(--green)";
      cta.style.color = "#04231a";
      cta.style.boxShadow = "0 12px 26px rgba(55,201,140,.35)";
      cta.innerHTML = ICON_CHECK + "الخطة مفعّلة — " + fmt0(state.invest.monthly) + " ر.س شهرياً";
    };
    applyInvest(state.invest.monthly, state.invest.risk);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
