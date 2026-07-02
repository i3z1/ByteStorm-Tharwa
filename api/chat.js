// ثَروة — AI banking assistant backend (Google Gemini + Function-Calling)
// FREE tier: create a key at https://aistudio.google.com/apikey (no credit card).
// The key is read from process.env.GEMINI_API_KEY (server-side secret; never exposed to the browser).

// Model fallback chain: on free-tier rate limits (429) we silently degrade to
// the next model so the demo never dies mid-conversation.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

// ---- best-effort in-memory rate limit (per serverless instance) ----
const HITS = new Map();
function limited(ip) {
  const now = Date.now(), win = 60000, max = 25;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > max;
}

const DEFAULT_BENEFICIARIES = [
  { name: "أحمد العتيبي", bank: "مصرف الإنماء", iban: "SA44 0500 0068 2016 1234 9101" },
  { name: "سارة القحطاني", bank: "مصرف الراجحي", iban: "SA03 8000 0000 6080 1016 7519" },
  { name: "محمد الزهراني", bank: "البنك الأهلي SNB", iban: "SA71 1000 0011 2233 4455 6677" }
];

function normAr(t) { return String(t || "").replace(/[ً-ْـ]/g, "").trim(); }
function findBen(list, name) {
  const n = normAr(name);
  if (!n) return null;
  let hit = list.find((b) => normAr(b.name) === n);
  if (hit) return hit;
  hit = list.find((b) => normAr(b.name).includes(n) || n.includes(normAr(b.name)));
  if (hit) return hit;
  const first = n.split(/\s+/)[0];
  return list.find((b) => normAr(b.name).split(/\s+/)[0] === first) || null;
}
function mockIban() {
  let d = "";
  for (let i = 0; i < 20; i++) d += Math.floor(Math.random() * 10);
  return ("SA" + d).replace(/(.{4})/g, "$1 ").trim();
}

const RISKS = { "متحفظ": 5.1, "متوسط": 8.4, "جريء": 12.3 };

const SYSTEM = (s) => `أنت «ثَروة»، مساعد بنكي ذكي داخل تطبيق بنكي سعودي (نموذج تجريبي).
تتحدث بالعربية بلهجة سعودية بسيطة وودّية وباختصار (جملة إلى ثلاث جمل). لا تستخدم الرموز التعبيرية (emojis).
العملة: الريال السعودي (ر.س). لا تخترع أرقاماً غير معطاة لك.

بيانات العميل الحالية:
- الرصيد: ${s.balance} ر.س في ${s.account}
- مصروفات الشهر حسب الفئة: ${Object.entries(s.expenses).map(([k, v]) => k + ": " + v + " ر.س").join(" ، ")}
- المستفيدون المسجّلون: ${s.beneficiaries.map((b) => `${b.name} (${b.bank})`).join(" ، ") || "لا يوجد"}
- خطة الاستثمار الحالية: ${s.invest.monthly} ر.س شهرياً — مستوى المخاطرة: ${s.invest.risk}

أدواتك وكيف تستخدمها:
1) propose_transfer(amount, recipient): استدعها فور معرفة المبلغ واسم المستفيد — ستظهر للعميل بطاقة تأكيد تفاعلية فيها المستفيد والبنك والآيبان والمبلغ وزرّا تأكيد/إلغاء. بعد استدعائها ردّ بجملة قصيرة مثل «جهّزت لك التحويل — راجع البطاقة وأكّد». إذا نقص المبلغ أو المستفيد فاسأل أولاً. لا تسأل تأكيداً نصياً — البطاقة تتكفّل بذلك. إذا كان المستفيد غير مسجّل، اقترح إضافته كمستفيد جديد.
2) execute_transfer(amount, recipient): التنفيذ الفعلي — لا تستدعها إلا إذا كتب العميل تأكيداً صريحاً بعد ظهور البطاقة.
3) add_beneficiary(name, iban, bank): لإضافة مستفيد جديد. يكفي الاسم — اسأل عن الآيبان والبنك مرة واحدة فقط (اختياري)، وإذا ما توفّرا استدعِ الأداة بالاسم فقط وسنولّد بيانات تجريبية.
4) set_investment_plan(monthly, risk): عند طلب خطة استثمار أو تغيير المبلغ/المخاطرة. المستويات: متحفظ (~5.1% نمواً)، متوسط (~8.4%)، جريء (~12.3%). ستُفتح شاشة الاستثمار تلقائياً بالتوزيع المناسب.
5) open_screen(screen): لفتح شاشة home أو spend أو invest عند الطلب.

قواعد: أجب عن أسئلة الرصيد والمصروفات والمستفيدين مباشرة من البيانات أعلاه. التزم بالنطاق البنكي فقط، وإذا سُئلت خارجه اعتذر بلطف ووجّه العميل لما تقدر تساعده فيه.`;

const TOOLS = [{
  function_declarations: [
    {
      name: "propose_transfer",
      description: "يعرض للعميل بطاقة تأكيد تفاعلية لتحويل مالي (المستفيد، البنك، الآيبان، المبلغ + زرا تأكيد/إلغاء). استدعه فور معرفة المبلغ والمستفيد.",
      parameters: {
        type: "OBJECT",
        properties: {
          amount: { type: "NUMBER", description: "المبلغ بالريال السعودي" },
          recipient: { type: "STRING", description: "اسم المستفيد" }
        },
        required: ["amount", "recipient"]
      }
    },
    {
      name: "execute_transfer",
      description: "ينفّذ التحويل فعلياً. لا تستدعه إلا بعد أن أكّد العميل كتابةً بعد ظهور بطاقة التأكيد.",
      parameters: {
        type: "OBJECT",
        properties: {
          amount: { type: "NUMBER", description: "المبلغ بالريال السعودي" },
          recipient: { type: "STRING", description: "اسم المستفيد" }
        },
        required: ["amount", "recipient"]
      }
    },
    {
      name: "add_beneficiary",
      description: "يضيف مستفيداً جديداً لقائمة مستفيدي العميل. يكفي الاسم؛ الآيبان والبنك اختياريان.",
      parameters: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING", description: "اسم المستفيد الكامل" },
          iban: { type: "STRING", description: "رقم الآيبان (اختياري)" },
          bank: { type: "STRING", description: "اسم البنك (اختياري)" }
        },
        required: ["name"]
      }
    },
    {
      name: "set_investment_plan",
      description: "يضبط خطة الاستثمار الشهرية للعميل ويفتح شاشة الاستثمار بالتوزيع المناسب.",
      parameters: {
        type: "OBJECT",
        properties: {
          monthly: { type: "NUMBER", description: "المبلغ الشهري بالريال" },
          risk: { type: "STRING", enum: ["متحفظ", "متوسط", "جريء"], description: "مستوى المخاطرة" }
        },
        required: ["monthly", "risk"]
      }
    },
    {
      name: "open_screen",
      description: "يفتح شاشة داخل التطبيق: تحليل المصروفات (spend) أو خطة الاستثمار (invest) أو الرئيسية (home).",
      parameters: {
        type: "OBJECT",
        properties: {
          screen: { type: "STRING", enum: ["home", "spend", "invest"] }
        },
        required: ["screen"]
      }
    }
  ]
}];

function doPropose(args, s, actions) {
  const amount = Number(args.amount);
  if (!(amount > 0)) return { ok: false, note: "المبلغ غير صالح — اطلب من العميل تحديد مبلغ صحيح." };
  const b = findBen(s.beneficiaries, args.recipient);
  if (!b) return { ok: false, note: `«${args.recipient}» غير مسجّل في قائمة المستفيدين. اقترح على العميل إضافته كمستفيد جديد أولاً.` };
  if (amount > s.balance) return { ok: false, note: `الرصيد غير كافٍ (الرصيد الحالي ${s.balance} ر.س). أخبر العميل بلطف.` };
  actions.push({ type: "confirm", amount, recipient: b.name, bank: b.bank, iban: b.iban, account: s.account });
  return { ok: true, note: "تم عرض بطاقة التأكيد للعميل. اطلب منه مراجعة التفاصيل والضغط على زر التأكيد في البطاقة." };
}

function transfer(s, amount, recipientName, actions) {
  if (!(amount > 0)) return { ok: false, note: "المبلغ غير صالح." };
  if (amount > s.balance) {
    actions.push({ type: "transfer", ok: false, amount, recipient: recipientName, message: "الرصيد غير كافٍ لإتمام التحويل." });
    return { ok: false, note: `الرصيد غير كافٍ. الرصيد الحالي ${s.balance} ر.س.` };
  }
  s.balance = Math.round((s.balance - amount) * 100) / 100;
  s.expenses["تحويلات"] = (s.expenses["تحويلات"] || 0) + amount;
  actions.push({ type: "transfer", ok: true, amount, recipient: recipientName });
  return { ok: true, note: `تم تنفيذ التحويل بنجاح إلى ${recipientName}. الرصيد الجديد ${s.balance} ر.س.` };
}

function doExecute(args, s, actions) {
  const b = findBen(s.beneficiaries, args.recipient);
  return transfer(s, Number(args.amount), b ? b.name : String(args.recipient || "المستفيد"), actions);
}

function doAddBen(args, s, actions) {
  const name = String(args.name || "").trim().slice(0, 60);
  if (!name) return { ok: false, note: "الاسم مطلوب." };
  if (findBen(s.beneficiaries, name)) return { ok: false, note: `«${name}» موجود مسبقاً في المستفيدين.` };
  if (s.beneficiaries.length >= 30) return { ok: false, note: "وصلت للحد الأقصى من المستفيدين." };
  const iban = String(args.iban || "").trim().slice(0, 40) || mockIban();
  const bank = String(args.bank || "").trim().slice(0, 40) || "مصرف الإنماء";
  const b = { name, bank, iban };
  s.beneficiaries.push(b);
  actions.push({ type: "beneficiary", name, bank, iban });
  return { ok: true, note: `تمت إضافة ${name} (${bank}) إلى المستفيدين بنجاح. الآن يمكن التحويل له مباشرة.` };
}

function doInvest(args, s, actions) {
  const risk = Object.prototype.hasOwnProperty.call(RISKS, normAr(args.risk)) ? normAr(args.risk) : "متوسط";
  let monthly = Number(args.monthly);
  if (!(monthly > 0)) monthly = s.invest.monthly || 500;
  monthly = Math.max(250, Math.min(20000, Math.round(monthly / 50) * 50));
  s.invest = { monthly, risk };
  actions.push({ type: "invest_plan", monthly, risk });
  return { ok: true, note: `تم إعداد الخطة: ${monthly} ر.س شهرياً بمستوى «${risk}» (نمو متوقع ~${RISKS[risk]}%). تم فتح شاشة الاستثمار للعميل.` };
}

function doOpen(args, actions) {
  actions.push({ type: "open", screen: String(args.screen || "") });
  return { ok: true, note: "تم فتح الشاشة للعميل." };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) {
    res.status(500).json({ error: "المساعد غير مُفعّل بعد (مفتاح الـ API غير مضبوط على الخادم)." });
    return;
  }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (limited(ip)) { res.status(429).json({ error: "طلبات كثيرة، انتظر لحظة ثم أعد المحاولة." }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // ---- rebuild trusted-ish state from client (demo state; sanitized) ----
  const inState = body.state || {};
  const s = {
    balance: typeof inState.balance === "number" && isFinite(inState.balance) ? inState.balance : 24580,
    account: String(inState.account || "الجاري · •••• 9000").slice(0, 60),
    expenses: Object.assign({}, inState.expenses || { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 }),
    beneficiaries: Array.isArray(inState.beneficiaries) && inState.beneficiaries.length
      ? inState.beneficiaries.slice(0, 30).map((b) => ({
          name: String((b && b.name) || "").slice(0, 60),
          bank: String((b && b.bank) || "").slice(0, 40),
          iban: String((b && b.iban) || "").slice(0, 40)
        })).filter((b) => b.name)
      : DEFAULT_BENEFICIARIES.map((b) => Object.assign({}, b)),
    invest: {
      monthly: (inState.invest && Number(inState.invest.monthly) > 0) ? Number(inState.invest.monthly) : 500,
      risk: (inState.invest && RISKS[normAr(inState.invest.risk)] !== undefined) ? normAr(inState.invest.risk) : "متوسط"
    }
  };

  const actions = [];

  // ---- deterministic path: user clicked the confirmation card button ----
  // (AI proposes → customer approves in UI → system executes. No LLM needed here.)
  if (body.confirm) {
    const amount = Number(body.confirm.amount);
    const b = findBen(s.beneficiaries, body.confirm.recipient);
    const name = b ? b.name : String(body.confirm.recipient || "المستفيد").slice(0, 60);
    const r = transfer(s, amount, name, actions);
    const reply = r.ok
      ? `تم تنفيذ التحويل: ${amount} ر.س إلى ${name}. رصيدك الحالي ${s.balance} ر.س.`
      : "تعذّر تنفيذ التحويل: الرصيد غير كافٍ.";
    res.status(200).json({ reply, state: s, actions });
    return;
  }

  const hist = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const contents = hist
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 800) }] }));
  if (!contents.length || contents[0].role !== "user") {
    res.status(400).json({ error: "لا توجد رسالة صالحة." });
    return;
  }

  let reply = "";

  async function callGemini() {
    const payload = JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM(s) }] },
      contents,
      tools: TOOLS,
      tool_config: { function_calling_config: { mode: "AUTO" } },
      generationConfig: { maxOutputTokens: 800, temperature: 0.4 }
    });
    let lastErr = null;
    for (const model of MODELS) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
        body: payload
      });
      const data = await r.json();
      if (data.error) {
        lastErr = data.error;
        const code = Number(data.error.code) || 0;
        // rate limit / overload / model missing → try the next free model
        if (code === 429 || code === 503 || code === 404) continue;
        return data;
      }
      return data;
    }
    return { error: lastErr || { message: "unavailable" } };
  }

  try {
    for (let i = 0; i < 5; i++) {
      const data = await callGemini();
      if (data.error) {
        const code = Number(data.error.code) || 0;
        const msg = (code === 429 || code === 503)
          ? "المساعد وصل للحد المجاني مؤقتاً — انتظر دقيقة وحاول مرة ثانية."
          : "تعذّر الاتصال بالمساعد: " + (data.error.message || "خطأ");
        res.status(200).json({ error: msg });
        return;
      }
      const cand = data.candidates && data.candidates[0];
      const parts = (cand && cand.content && cand.content.parts) || [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        reply = parts.filter((p) => p.text).map((p) => p.text).join("").trim();
        break;
      }

      contents.push({ role: "model", parts });
      const respParts = [];
      for (const p of calls) {
        const name = p.functionCall.name;
        const fargs = p.functionCall.args || {};
        let out;
        if (name === "propose_transfer") out = doPropose(fargs, s, actions);
        else if (name === "execute_transfer") out = doExecute(fargs, s, actions);
        else if (name === "add_beneficiary") out = doAddBen(fargs, s, actions);
        else if (name === "set_investment_plan") out = doInvest(fargs, s, actions);
        else if (name === "open_screen") out = doOpen(fargs, actions);
        else out = { ok: false, note: "أداة غير معروفة." };
        respParts.push({ functionResponse: { name, response: out } });
      }
      contents.push({ role: "user", parts: respParts });
    }

    if (!reply) reply = "تمام.";
    res.status(200).json({ reply, state: s, actions });
  } catch (err) {
    res.status(200).json({ error: "حدث خطأ في الاتصال بالمساعد." });
  }
}
