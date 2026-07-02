/* ثَروة — front-end: screen navigation + live AI chat (calls /api/chat) */
(function () {
  "use strict";
  var q = function (s, r) { return (r || document).querySelector(s); };
  var qa = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  // ---------------- STATE ----------------
  var state = {
    balance: 24580.00,
    account: "الجاري · •••• 9000",
    expenses: { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 },
    contacts: ["أحمد العتيبي", "سارة القحطاني", "محمد الزهراني", "نورة العنزي"]
  };
  var history = []; // {role:'user'|'assistant', text}

  var ICON_TRANSFER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2.5 21 6.5l-4 4"/><path d="M3 11V9.5a2 2 0 0 1 2-2h16"/><path d="M7 21.5 3 17.5l4-4"/><path d="M21 13v1.5a2 2 0 0 1-2 2H3"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="#37C98C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>';
  var ICON_ERR = '<svg viewBox="0 0 24 24" fill="none" stroke="#F0796B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>';

  // ---------------- HELPERS ----------------
  function fmt(n) { return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmt0(n) { return Math.round(Number(n)).toLocaleString("en-US"); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }

  // ---------------- NAVIGATION ----------------
  function show(id) {
    qa(".page").forEach(function (p) { p.classList.toggle("active", p.id === id); });
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (id === "s-chat") { setTimeout(function () { var c = q("#cmd"); if (c) c.focus(); }, 60); }
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

  // ---------------- CHAT UI ----------------
  var log;
  function scrollChat() { if (log) log.scrollTop = log.scrollHeight; }
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

  // ---------------- APPLY ACTIONS FROM SERVER ----------------
  function applyActions(actions) {
    if (!actions) return;
    actions.forEach(function (a) {
      if (a.type === "transfer" && a.ok) {
        successBubble("تم تحويل " + fmt(a.amount) + " ر.س إلى " + a.recipient + " بنجاح.");
        renderHome();
        addTxn("تحويل إلى " + a.recipient, "تحويل · الآن", a.amount, false);
      } else if (a.type === "transfer" && !a.ok) {
        errorBubble(a.message || "تعذّر تنفيذ التحويل.");
      } else if (a.type === "open" && a.screen) {
        var map = { home: "s-home", spend: "s-spend", invest: "s-invest", chat: "s-chat" };
        var target = map[a.screen];
        if (target && target !== "s-chat") {
          var btn = document.createElement("button");
          btn.className = "linkbtn"; btn.textContent = "فتح الشاشة";
          btn.onclick = function () { show(target); };
          log.appendChild(btn); scrollChat();
          setTimeout(function () { show(target); }, 900);
        }
      }
    });
  }

  // ---------------- SEND TO AI ----------------
  var busy = false;
  function handle(text) {
    text = (text || "").trim();
    if (!text || busy) return;
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
      if (t.parentNode) t.remove();
      if (!res.ok || res.data.error) {
        errorBubble(res.data && res.data.error ? res.data.error : "تعذّر الاتصال بالمساعد حالياً.");
        busy = false; return;
      }
      var data = res.data;
      if (data.state) state = data.state;
      if (data.reply) { botMsg(rich(data.reply)); history.push({ role: "assistant", text: data.reply }); }
      applyActions(data.actions);
      busy = false;
    }).catch(function () {
      if (t.parentNode) t.remove();
      errorBubble("تعذّر الاتصال بالمساعد. تأكد من الاتصال بالإنترنت وحاول مرة ثانية.");
      busy = false;
    });
  }

  // ---------------- SUGGESTION CHIPS ----------------
  var CHIPS = ["حوّل 500 لأحمد", "كم صرفت هذا الشهر؟", "كم صرفت على المطاعم؟", "اقترح لي خطة استثمار", "كم رصيدي؟"];

  // ---------------- INIT ----------------
  function init() {
    log = q("#chatlog");
    renderHome();

    // greeting
    botMsg("أهلاً بك، أنا <b>ثَروة</b> — مساعدك البنكي الذكي. أقدر أنفّذ تحويلاتك، أحلّل مصروفاتك، وأقترح خطط استثمار. اكتب طلبك بلغتك الطبيعية، أو اختر أحد الاقتراحات بالأسفل.");

    var chips = q("#chips");
    if (chips) CHIPS.forEach(function (cText) {
      var b = document.createElement("div"); b.className = "sgchip"; b.textContent = cText;
      b.onclick = function () { handle(cText); };
      chips.appendChild(b);
    });

    var send = q("#send"); if (send) send.onclick = function () { handle(q("#cmd").value); };
    var cmd = q("#cmd"); if (cmd) cmd.addEventListener("keydown", function (e) { if (e.key === "Enter") handle(cmd.value); });
    var mic = q("#mic"); if (mic) mic.onclick = function () { q("#cmd").value = "حوّل 500 لأحمد"; q("#cmd").focus(); };
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

    // invest CTA
    var cta = q("#s-invest .cta .b");
    if (cta) cta.onclick = function () { cta.innerHTML = "تم تفعيل الخطة — سنستثمر 500 ر.س شهرياً"; };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
