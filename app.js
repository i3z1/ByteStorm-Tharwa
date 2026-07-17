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
    cards: [
      { id: "mada", name: "مدى الرقمية", last4: "4821", frozen: false },
      { id: "credit", name: "الائتمانية بلاتينيوم", last4: "9310", frozen: false }
    ],
    invest: { monthly: 500, goal: { name: "ادخار عام", amount: 20000, months: 24 } },
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

  // ---------------- CARDS (home screen) ----------------
  var ICON_FREEZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="m4.9 7 14.2 10"/><path d="m4.9 17 14.2-10"/><path d="m9.5 3.5 2.5 2 2.5-2"/><path d="m9.5 20.5 2.5-2 2.5 2"/><path d="m3.5 9.8 3-.9.4-3.1"/><path d="m20.5 14.2-3 .9-.4 3.1"/><path d="m3.5 14.2 3 .9.4 3.1"/><path d="m20.5 9.8-3-.9-.4-3.1"/></svg>';
  var ICON_CARDCHIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="6" width="16" height="12" rx="2.4"/><path d="M4 10.5h5M4 13.5h5M15 10.5h5M15 13.5h5M9 6v12M15 6v12"/></svg>';
  function renderCards() {
    var row = q("#cardrow"); if (!row) return;
    row.innerHTML = "";
    (state.cards || []).forEach(function (c) {
      var d = document.createElement("div");
      d.className = "bcard " + (c.id === "credit" ? "navy" : "sunset") + (c.frozen ? " frozen" : "");
      d.innerHTML =
        '<div class="bctop"><span class="bcname">' + esc(c.name) + '</span>'
        + '<button class="bcfrz" title="' + (c.frozen ? "إعادة التفعيل" : "إيقاف مؤقت") + '">' + ICON_FREEZE + '</button></div>'
        + '<span class="bcchip">' + ICON_CARDCHIP + '</span>'
        + '<div class="bcnum">•••• &nbsp;' + esc(c.last4) + '</div>'
        + '<div class="bcbottom"><span class="bcholder">عبدالعزيز أحمد</span><span class="bcnet">' + (c.id === "credit" ? "VISA" : "mada") + '</span></div>'
        + '<div class="bcfrozen">' + ICON_FREEZE + ' موقّفة مؤقتاً</div>';
      q(".bcfrz", d).onclick = function () {
        c.frozen = !c.frozen;
        renderCards();
      };
      row.appendChild(d);
    });
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

  // ---------------- SAVINGS SCREEN (goal-driven, compound murabaha growth) ----------------
  var SAVE_RATE = 4.0; // حساب ادخار مرابحة — عائد سنوي متوقع (نموذج تجريبي)
  function fvMonthly(monthly, annualPct, months) {
    var i = annualPct / 100 / 12;
    return Math.round(monthly * ((Math.pow(1 + i, months) - 1) / i));
  }
  function neededMonthly(target, annualPct, months) {
    var i = annualPct / 100 / 12;
    return Math.max(50, Math.ceil((target * i / (Math.pow(1 + i, months) - 1)) / 50) * 50);
  }
  function applyInvest(monthly) {
    monthly = Math.max(250, Math.min(20000, Math.round((Number(monthly) || state.invest.monthly || 500) / 50) * 50));
    var goal = (state.invest && state.invest.goal) || { name: "ادخار عام", amount: 20000, months: 24 };
    state.invest = { monthly: monthly, goal: goal };

    var gl = q("#inv-goal"); if (gl) gl.textContent = goal.name + " — " + fmt0(goal.amount) + " ر.س خلال " + goal.months + " شهراً";
    var nd = q("#inv-needed"); if (nd) nd.textContent = fmt0(neededMonthly(goal.amount, SAVE_RATE, goal.months)) + " ر.س شهرياً";
    var m = q("#inv-monthly"); if (m) m.textContent = fmt0(monthly);
    var g = q("#inv-growth"); if (g) g.textContent = "+" + SAVE_RATE + "%";
    var proj = fvMonthly(monthly, SAVE_RATE, goal.months);
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

  // ---------------- OTP SIMULATION (fake SMS + code entry) ----------------
  var ICON_MSG = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  // the fake SMS lives INSIDE the card, right above the code boxes — the browser
  // always keeps the focused input (and therefore the code) on screen, so the
  // keyboard can never hide it. Tapping it auto-fills, like iOS SMS AutoFill.
  function otpGate(mount, onOk) {
    var code = String(Math.floor(1000 + Math.random() * 9000));
    mount.innerHTML = '<div class="otpwrap"><div class="otpt">' + ICON_LOCK + 'أدخل رمز التحقق المرسل إلى جوالك ‎05x xxx xx42</div>'
      + '<div class="smsslot"></div>'
      + '<div class="otpboxes">'
      + '<input type="tel" inputmode="numeric" maxlength="1" autocomplete="one-time-code"><input type="tel" inputmode="numeric" maxlength="1">'
      + '<input type="tel" inputmode="numeric" maxlength="1"><input type="tel" inputmode="numeric" maxlength="1">'
      + '</div><div class="otprow"><span>ما وصلك الرمز؟</span><a>إعادة إرسال</a></div></div>';
    var boxes = Array.prototype.slice.call(mount.querySelectorAll(".otpboxes input"));
    var wrap = q(".otpboxes", mount);
    var slot = q(".smsslot", mount);
    function fill(c) {
      String(c).split("").forEach(function (d, j) {
        if (boxes[j]) { boxes[j].value = d; boxes[j].classList.add("full"); }
      });
      verify();
    }
    // realistic pacing: a "sending…" beat, then the SMS pops in, and the
    // autofill hint surfaces a moment later — like iOS SMS suggestions
    function deliverSms() {
      slot.innerHTML = '<div class="otpsend"><span class="spin"></span>جاري إرسال رمز التحقق إلى جوالك…</div>';
      scrollChat();
      setTimeout(function () {
        if (!slot.parentNode) return;
        slot.innerHTML = '<div class="smsin"><div class="snic">' + ICON_MSG + '</div><div class="snb"><div class="snt">ثروة — رسالة نصية<span>الآن</span></div>'
          + '<div class="snm">رمز التحقق: <b>' + code + '</b></div>'
          + '<div class="snfill">اضغط على الرسالة لتعبئة الرمز تلقائياً</div></div></div>';
        q(".smsin", slot).onclick = function () { fill(code); };
        scrollChat();
        setTimeout(function () {
          var f = q(".snfill", slot); if (f) f.classList.add("show");
        }, 1500);
      }, 1800);
    }
    deliverSms();
    scrollChat();
    function verify() {
      var v = boxes.map(function (b) { return b.value; }).join("");
      if (v.length < 4) return;
      if (v === code) {
        mount.innerHTML = '<div class="otpwrap" style="border-top:none;padding-top:2px"><div class="otpok">' + ICON_CHECK + 'تم التحقق من الرمز</div></div>';
        onOk();
      } else {
        wrap.classList.add("err");
        setTimeout(function () {
          wrap.classList.remove("err");
          boxes.forEach(function (b) { b.value = ""; b.classList.remove("full"); });
          boxes[0].focus();
        }, 430);
      }
    }
    // Samsung/iOS Arabic keyboards emit Arabic-Indic digits — normalize them
    function toEnDigits(s) {
      return String(s).replace(/[٠-٩۰-۹]/g, function (d) { return String.fromCharCode((d.charCodeAt(0) & 15) + 48); });
    }
    boxes.forEach(function (b, i) {
      b.oninput = function () {
        b.value = toEnDigits(b.value).replace(/\D/g, "").slice(-1);
        b.classList.toggle("full", !!b.value);
        if (b.value && i < 3) boxes[i + 1].focus();
        if (boxes.every(function (o) { return o.value; })) verify();
      };
      b.onkeydown = function (e) {
        if (e.key === "Backspace" && !b.value && i > 0) boxes[i - 1].focus();
      };
      b.onpaste = function (e) {
        var t = toEnDigits((e.clipboardData || window.clipboardData).getData("text") || "").replace(/\D/g, "").slice(0, 4);
        if (t.length === 4) {
          e.preventDefault();
          boxes.forEach(function (o, j) { o.value = t[j]; o.classList.add("full"); });
          verify();
        }
      };
    });
    q(".otprow a", mount).onclick = function () {
      code = String(Math.floor(1000 + Math.random() * 9000));
      boxes.forEach(function (b) { b.value = ""; b.classList.remove("full"); });
      deliverSms();
    };
    boxes[0].focus();
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
    function execTransfer() {
      // serialize behind any in-flight chat request — a reply landing after the
      // transfer would clobber state with a pre-transfer snapshot
      if (busy) { setTimeout(execTransfer, 400); return; }
      busy = true;
      var t = typingOn();
      fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: { amount: a.amount, recipient: a.recipient }, state: state, history: history })
      }).then(function (r) { return r.json(); }).then(function (data) {
        if (t.parentNode) t.remove();
        if (data.error) { errorBubble(data.error); busy = false; return; }
        if (data.state) { state = data.state; renderBudgets(); renderCards(); }
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
    }
    q(".btn.ok", card).onclick = function () {
      if (busy) return;
      // bank-grade step: OTP entry before anything moves
      otpGate(q(".confirm", card), execTransfer);
    };
    q(".btn.no", card).onclick = function () {
      settle("أُلغي", "var(--muted)");
      history.push({ role: "assistant", text: "تم إلغاء التحويل بناءً على طلب العميل." });
      botMsg("تم إلغاء العملية. تحتاج شيئاً آخر؟");
    };
  }

  // ---------------- BENEFICIARY CARD (OTP-gated) ----------------
  function renderBeneficiaryCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var init = esc((a.name || "م").trim().charAt(0));
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_USERPLUS + '</span>مستفيد جديد<span class="badge" style="background:rgba(226,169,59,.16);color:#E2A93B">بانتظار التحقق</span></div>'
      + cardRow("الاسم", '<span class="who"><span class="pa">' + init + '</span><span class="v">' + esc(a.name) + '</span></span>')
      + cardRow("البنك", '<span class="v">' + esc(a.bank || "") + '</span>')
      + cardRow("الآيبان", '<span class="v" style="direction:ltr;font-size:12.5px;letter-spacing:.3px">' + esc(a.iban || "") + '</span>')
      + '<div class="confirm"></div>';
    log.appendChild(card); scrollChat();
    otpGate(q(".confirm", card), function () {
      var badge = q(".badge", card);
      badge.style.background = ""; badge.style.color = "";
      badge.textContent = "تمت الإضافة";
      var m = "تم التحقق — أضفت " + (a.name || "المستفيد") + " لمستفيديك، وتقدر تحوّل له مباشرة من الآن.";
      history.push({ role: "assistant", text: m });
      botMsg(m);
    });
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

  // ---------------- FINANCIAL HEALTH CARD ----------------
  var ICON_PULSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  var FCOLORS = { ok: "var(--green)", warn: "var(--gold)", bad: "#F0796B" };
  function renderHealthCard(a) {
    var score = Math.max(0, Math.min(100, Math.round(a.score)));
    var color = score >= 75 ? "#37C98C" : (score >= 50 ? "#E2A93B" : "#F0796B");
    var C = Math.round(2 * Math.PI * 40 * 100) / 100;
    var card = document.createElement("div");
    card.className = "tcard";
    var rows = (a.factors || []).map(function (f) {
      var c = FCOLORS[f.status] || FCOLORS.warn;
      var pc = Math.round(f.pts / f.max * 100);
      return '<div class="hfrow"><div class="hft"><span class="fn">' + esc(f.name) + '</span><span class="fpts" style="color:' + c + '">' + f.pts + "/" + f.max + '</span></div>'
        + '<div class="ftrack"><span class="ffill" style="width:' + pc + '%;background:' + c + '"></span></div>'
        + '<div class="fnote">' + esc(f.note || "") + '</div></div>';
    }).join("");
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_PULSE + '</span>صحتك المالية<span class="badge" style="background:rgba(255,255,255,.07);color:' + color + '">' + score + '/100</span></div>'
      + '<div class="hgwrap"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface2)" stroke-width="9"/>'
      + '<circle class="hgarc" cx="50" cy="50" r="40" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + C + '" stroke-dashoffset="' + C + '" transform="rotate(-90 50 50)"/></svg>'
      + '<div class="hgnum" style="color:' + color + '">' + score + '<span>من 100</span></div></div>'
      + rows;
    log.appendChild(card); scrollChat();
    var arc = q(".hgarc", card);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { arc.style.strokeDashoffset = (C * (1 - score / 100)).toFixed(2); });
    });
  }

  // ---------------- CARD LOCK CARD ----------------
  function renderCardLockCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var locked = !!a.locked;
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_FREEZE + '</span>' + (locked ? "إيقاف مؤقت للبطاقة" : "إعادة تفعيل البطاقة")
      + '<span class="badge" style="' + (locked ? "background:rgba(94,143,176,.18);color:#8FC0DE" : "") + '">' + (locked ? "موقّفة" : "نشطة") + '</span></div>'
      + cardRow("البطاقة", '<span class="v">' + esc(a.name || "") + ' •••• ' + esc(a.last4 || "") + '</span>')
      + cardRow("الحالة", '<span class="v" style="color:' + (locked ? "#8FC0DE" : "var(--green)") + '">' + (locked ? "موقّفة مؤقتاً — كل العمليات مرفوضة" : "نشطة — تعمل بشكل طبيعي") + '</span>')
      + '<div class="r" style="color:var(--muted);font-size:12.5px">' + (locked ? "تقدر تعيد تفعيلها بأي وقت بقولك «فك تجميد بطاقتي»" : "استمتع باستخدامها بأمان") + '</div>';
    log.appendChild(card); scrollChat();
  }

  // ---------------- RECEIPT CARD (shareable) ----------------
  var ICON_RECEIPT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2.5-1.5L9 22l2.5-1.5L14 22l2.5-1.5L19 22l1-.5V2l-1 .5L16.5 2 14 3.5 11.5 2 9 3.5 6.5 2 4 2Z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';
  var ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>';
  var ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  // ---------------- RECEIPT → PDF (canvas → embedded JPEG → hand-built PDF) ----------------
  // no external libs: nothing to fetch, nothing to fail during the demo
  function receiptPdf(a, when) {
    var W = 1000, H = 1360;
    var c = document.createElement("canvas"); c.width = W; c.height = H;
    var g = c.getContext("2d");
    g.fillStyle = "#0B1E2C"; g.fillRect(0, 0, W, H);
    var grd = g.createLinearGradient(0, 0, 0, 300);
    grd.addColorStop(0, "#13293A"); grd.addColorStop(1, "#0B1E2C");
    g.fillStyle = grd; g.fillRect(0, 0, W, 300);
    function star(cx, cy, r, col) {
      g.beginPath();
      g.moveTo(cx, cy - r); g.quadraticCurveTo(cx + r * .13, cy - r * .13, cx + r, cy);
      g.quadraticCurveTo(cx + r * .13, cy + r * .13, cx, cy + r);
      g.quadraticCurveTo(cx - r * .13, cy + r * .13, cx - r, cy);
      g.quadraticCurveTo(cx - r * .13, cy - r * .13, cx, cy - r);
      g.closePath(); g.fillStyle = col; g.fill();
    }
    star(478, 100, 52, "#EC7C5A"); star(548, 152, 24, "#F5A882");
    g.direction = "rtl"; g.textAlign = "center";
    g.fillStyle = "#ECF2F6"; g.font = "800 52px Tajawal, sans-serif";
    g.fillText("إيصال تحويل — ثَروة", 500, 268);
    g.fillStyle = "#37C98C"; g.font = "700 30px Tajawal, sans-serif";
    g.fillText("✓ عملية ناجحة", 500, 322);
    g.fillStyle = "#ECF2F6"; g.font = "800 92px Tajawal, sans-serif";
    g.fillText(fmt(a.amount), 500, 452);
    g.fillStyle = "#7E93A2"; g.font = "700 32px Tajawal, sans-serif";
    g.fillText("ريال سعودي", 500, 505);
    var rows = [
      ["المستفيد", a.recipient || ""],
      a.bank ? ["البنك", a.bank] : null,
      a.iban ? ["الآيبان", a.iban] : null,
      ["من حساب", state.account || ""],
      ["الرقم المرجعي", a.ref || ""],
      ["التاريخ", when]
    ].filter(Boolean);
    var y = 620;
    rows.forEach(function (r) {
      g.textAlign = "right"; g.fillStyle = "#7E93A2"; g.font = "600 29px Tajawal, sans-serif";
      g.fillText(r[0], 900, y);
      g.textAlign = "left"; g.fillStyle = "#ECF2F6"; g.font = "700 31px Tajawal, sans-serif";
      g.fillText(String(r[1]), 100, y);
      g.strokeStyle = "rgba(255,255,255,.08)"; g.beginPath(); g.moveTo(100, y + 36); g.lineTo(900, y + 36); g.stroke();
      y += 96;
    });
    g.textAlign = "center"; g.fillStyle = "#7E93A2"; g.font = "600 24px Tajawal, sans-serif";
    g.fillText("إيصال إلكتروني صادر من ثَروة — المساعد المصرفي الذكي", 500, H - 90);
    g.font = "700 24px Tajawal, sans-serif"; g.fillStyle = "#EC7C5A"; g.direction = "ltr";
    g.fillText("tharwa-orcin.vercel.app", 500, H - 50);
    downloadPdfFromJpeg(c.toDataURL("image/jpeg", 0.92), W, H, "إيصال-" + (a.ref || "ثروة") + ".pdf");
  }
  function downloadPdfFromJpeg(dataUrl, wPx, hPx, name) {
    var bin = atob(dataUrl.split(",")[1]);
    var img = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) img[i] = bin.charCodeAt(i);
    var wPt = 400, hPt = Math.round(wPt * hPx / wPx);
    function enc(s) { var u = new Uint8Array(s.length); for (var j = 0; j < s.length; j++) u[j] = s.charCodeAt(j) & 255; return u; }
    var chunks = [], offs = [], pos = 0;
    function push(u) { chunks.push(u); pos += u.length; }
    function obj(n, body) { offs[n] = pos; push(enc(n + " 0 obj\n" + body + "\nendobj\n")); }
    push(enc("%PDF-1.4\n"));
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + wPt + " " + hPt + "] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>");
    var cs = "q " + wPt + " 0 0 " + hPt + " 0 0 cm /Im0 Do Q";
    obj(4, "<< /Length " + cs.length + " >>\nstream\n" + cs + "\nendstream");
    offs[5] = pos;
    push(enc("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + wPx + " /Height " + hPx + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + img.length + " >>\nstream\n"));
    push(img);
    push(enc("\nendstream\nendobj\n"));
    var xref = pos, t = "xref\n0 6\n0000000000 65535 f \n";
    for (var n = 1; n <= 5; n++) t += ("0000000000" + offs[n]).slice(-10) + " 00000 n \n";
    t += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    push(enc(t));
    var total = 0; chunks.forEach(function (u) { total += u.length; });
    var out = new Uint8Array(total), p = 0;
    chunks.forEach(function (u) { out.set(u, p); p += u.length; });
    // iOS (esp. standalone-PWA) can't reliably download blobs — use the share
    // sheet there instead; desktop and Android keep the normal direct download
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isIOS) {
      try {
        var f = new File([out], name, { type: "application/pdf" });
        if (navigator.canShare && navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: name }).catch(function () {});
          return;
        }
      } catch (e) {}
    }
    var url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }));
    var el = document.createElement("a");
    el.href = url; el.download = name;
    document.body.appendChild(el); el.click();
    setTimeout(function () { el.remove(); URL.revokeObjectURL(url); }, 4000);
  }
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
      + '<div class="confirm"><button class="btn share">' + ICON_SHARE + 'مشاركة</button><button class="btn pdf">' + ICON_DOWNLOAD + 'حفظ PDF</button></div>';
    log.appendChild(card); scrollChat();
    q(".btn.pdf", card).onclick = function () { receiptPdf(a, when); };
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

  // ---------------- FINANCING ESTIMATE CARD ----------------
  var ICON_FIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9v6M18 9v6"/></svg>';
  function renderLoanCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    var dsrPct = Math.min(100, Math.round(a.dsr / 33 * 100));
    var dsrColor = a.fits ? "var(--green)" : "#F0796B";
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_FIN + '</span>تقدير التمويل الشخصي<span class="badge">مرابحة</span></div>'
      + cardRow(a.requested ? "المبلغ المطلوب" : "الحد الأقصى المتاح لك", '<span class="v">' + fmt0(a.amount) + ' ر.س</span>')
      + cardRow("مدة السداد", '<span class="v">' + a.months + ' شهراً</span>')
      + cardRow("هامش المرابحة السنوي", '<span class="v">~' + a.rate + '% (متناقص)</span>')
      + '<div class="r big"><span class="k">القسط الشهري</span><span class="v" style="color:' + dsrColor + '">' + fmt0(a.monthly) + '<span class="c">ر.س</span></span></div>'
      + '<div class="r" style="display:block"><div style="display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted);margin-bottom:5px"><span>نسبة الاستقطاع من دخلك</span><span style="color:' + dsrColor + ';font-weight:700">' + a.dsr + '% من حد 33%</span></div>'
      + '<div style="height:7px;border-radius:5px;background:var(--surface2);overflow:hidden"><span style="display:block;height:100%;width:' + dsrPct + '%;background:' + dsrColor + '"></span></div></div>'
      + (a.fits
          ? '<div class="confirm"><button class="btn ok apply-fin">' + ICON_CHECK + 'قدّم طلب التمويل</button></div>'
          : '<div class="warnrow">' + ICON_SHIELD + '<span>القسط يتجاوز الحد الآمن — جرّب مبلغاً أقل (حتى ~' + fmt0(a.maxAmount) + ' ر.س) أو مدة أطول.</span></div>')
      + '<div class="r" style="color:var(--muted);font-size:12.5px">تقدير مبدئي من دخلك ومصروفاتك الفعلية — ليس موافقة ائتمانية نهائية.</div>';
    log.appendChild(card); scrollChat();
    var ab = q(".apply-fin", card);
    if (ab) ab.onclick = function () {
      ab.disabled = true;
      handle("أبي أقدم طلب التمويل رسمياً");
    };
  }

  // ---------------- SUPPORT TICKET CARD ----------------
  var ICON_TICKET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>';
  function renderTicketCard(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_TICKET + '</span>تذكرة دعم — لموظف مختص<span class="badge">مفتوحة</span></div>'
      + cardRow("رقم التذكرة", '<span class="v" style="direction:ltr">' + esc(a.ref) + '</span>')
      + cardRow("التصنيف", '<span class="v">' + esc(a.category) + '</span>')
      + cardRow("طلبك", '<span class="v" style="font-size:13px">' + esc(a.summary) + '</span>')
      + cardRow("التواصل المتوقع", '<span class="v" style="color:var(--green)">' + esc(a.eta) + '</span>')
      + '<div class="r" style="color:var(--muted);font-size:12.5px">احتفظ برقم التذكرة — موظف مختص بيتواصل معك، وتقدر تسألني عنها بأي وقت.</div>';
    log.appendChild(card); scrollChat();
  }

  // ---------------- CARD RECOMMENDATION OFFER ----------------
  function renderCardOffer(a) {
    var card = document.createElement("div");
    card.className = "tcard";
    card.innerHTML =
      '<div class="h"><span class="ti">' + ICON_FIN + '</span>ترشيح ثَروة لك<span class="badge">' + a.match + '% تطابق</span></div>'
      + '<div style="position:relative;margin:10px 0;border-radius:14px;padding:14px 16px;height:118px;background:linear-gradient(135deg,#274B66,#122536);overflow:hidden">'
      +   '<div style="display:flex;justify-content:space-between;align-items:flex-start"><b style="color:#fff;font-size:13px">ثَروة</b><i style="color:#fff;font-weight:900;font-size:12px;font-style:italic">VISA</i></div>'
      +   '<div style="color:#fff;font-weight:800;font-size:16px;margin-top:8px">فيزا كاش باك</div>'
      +   '<div style="direction:ltr;text-align:right;color:#fff;font-size:13px;letter-spacing:2px;margin-top:12px">•••• 2088</div>'
      + '</div>'
      + cardRow("سبب الترشيح", '<span class="v" style="font-size:12.5px">أعلى فئة صرفك «' + esc(a.topCat) + '» — ' + a.topPct + '% من ' + fmt0(a.monthlySpend) + ' ر.س شهرياً</span>')
      + '<div class="r big"><span class="k">كاش باك متوقع أول سنة</span><span class="v" style="color:var(--green)">~' + fmt0(a.annualValue) + '<span class="c">ر.س</span></span></div>'
      + cardRow("المزايا", '<span class="v" style="font-size:12.5px">3% مطاعم وتوصيل أول 3 أشهر · 1% على الباقي</span>')
      + cardRow("الرسوم", '<span class="v" style="font-size:12.5px">مجانية أول سنة — بعدها 199 ر.س تُعفى عند إنفاق 20,000</span>')
      + (a.issued
          ? '<div class="confirm"><button class="btn ok" disabled>' + ICON_CHECK + 'بطاقتك صادرة بالفعل</button></div>'
          : '<div class="confirm"><button class="btn ok issue-card">' + ICON_CHECK + 'أصدر البطاقة الرقمية</button></div>')
      + '<div class="r" style="color:var(--muted);font-size:12.5px">الترشيح مبني على نمط صرفك الفعلي — وليس موافقة ائتمانية نهائية.</div>';
    log.appendChild(card); scrollChat();
    var ib = q(".issue-card", card);
    if (ib) ib.onclick = function () {
      ib.disabled = true;
      handle("أصدر لي بطاقة فيزا كاش باك");
    };
  }

  // ---------------- APPLY ACTIONS FROM SERVER ----------------
  // transparency chip: every executed tool is shown by name above its card —
  // the "AI proposes, code executes" architecture made visible + a live counter
  var TOOL_LABELS = {
    confirm: "propose_transfer", transfer: "execute_transfer", beneficiary: "add_beneficiary",
    invest_plan: "set_investment_plan", budget: "set_budget", zakat: "calculate_zakat",
    receipt: "show_receipt", health: "financial_health", card_lock: "set_card_lock",
    loan: "financing_estimate", ticket: "create_support_ticket",
    card_offer: "recommend_card", card_issued: "issue_card"
  };
  var toolCount = 0;
  function toolChip(type) {
    var name = TOOL_LABELS[type];
    if (!name || !log) return;
    var d = document.createElement("div");
    d.className = "toolchip";
    d.textContent = "⚙ " + name;
    log.appendChild(d);
    toolCount++;
    var el = q("#toolctr");
    if (el) el.textContent = "⚙ " + toolCount;
  }
  function applyActions(actions) {
    if (!actions) return;
    actions.forEach(function (a) {
      toolChip(a.type);
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
        applyInvest(a.monthly);
        setTimeout(function () { show("s-invest"); }, 1100);
      } else if (a.type === "budget") {
        renderBudgets();
        successBubble("تم ضبط ميزانية " + a.category + ": " + fmt0(a.amount) + " ر.س شهرياً.");
        setTimeout(function () { show("s-spend"); }, 1100);
      } else if (a.type === "zakat") {
        renderZakatCard(a);
      } else if (a.type === "receipt") {
        renderReceiptCard(a);
      } else if (a.type === "card_lock") {
        renderCardLockCard(a);
        renderCards();
      } else if (a.type === "health") {
        renderHealthCard(a);
      } else if (a.type === "loan") {
        renderLoanCard(a);
      } else if (a.type === "ticket") {
        renderTicketCard(a);
      } else if (a.type === "card_offer") {
        renderCardOffer(a);
      } else if (a.type === "card_issued") {
        renderCards();
        successBubble("تم إصدار بطاقة " + a.name + " الرقمية •••• " + a.last4 + " — تلقاها في بطاقاتك الآن.");
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
      if (data.state) { state = data.state; renderBudgets(); renderCards(); }
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
    "ضاعت بطاقتي!",
    "أبي إيصال آخر تحويل",
    "أبي أجمع 30 ألف لسيارة خلال سنة",
    "احسب زكاتي",
    "حط ميزانية 1500 للمطاعم",
    "قيّم وضعي المالي",
    "وش أفضل بطاقة لي؟",
    "كم يطلع لي تمويل شخصي؟",
    "كم صرفت على المطاعم؟",
    "أضف مستفيد جديد"
  ];

  // ---------------- INIT ----------------
  function init() {
    log = q("#chatlog");
    renderHome();
    renderBudgets();
    renderCards();

    // greeting
    botMsg("أهلاً بك، أنا <b>ثَروة</b> — مساعدك البنكي الذكي. أنفّذ تحويلاتك، أحسب زكاتك، أضبط ميزانياتك، أقيّم وضعك المالي، وأجهّز لك خطة ادخار توصلك لهدفك. اكتب طلبك بلغتك الطبيعية أو اضغط زر <b>المايك</b> وتكلّم. ولو تبي ردوداً صوتية، فعّل زر <b>السماعة</b> بالأعلى.");

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
      else if (t.indexOf("ادخار") > -1) a.onclick = function () { show("s-invest"); };
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
    if (minus) minus.onclick = function () { applyInvest(state.invest.monthly - 250); };
    if (plus) plus.onclick = function () { applyInvest(state.invest.monthly + 250); };
    var cta = q("#s-invest .cta .b");
    if (cta) cta.onclick = function () {
      cta.dataset.on = "1";
      cta.style.background = "var(--green)";
      cta.style.color = "#04231a";
      cta.style.boxShadow = "0 12px 26px rgba(55,201,140,.35)";
      cta.innerHTML = ICON_CHECK + "الخطة مفعّلة — " + fmt0(state.invest.monthly) + " ر.س شهرياً";
    };
    applyInvest(state.invest.monthly);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
