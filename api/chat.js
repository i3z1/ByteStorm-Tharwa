// ثَروة — AI banking assistant backend (Google Gemini + Function-Calling)
// FREE tier: create a key at https://aistudio.google.com/apikey (no credit card).
// The key is read from process.env.GEMINI_API_KEY (server-side secret; never exposed to the browser).

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ---- best-effort in-memory rate limit (per serverless instance) ----
const HITS = new Map();
function limited(ip) {
  const now = Date.now(), win = 60000, max = 20;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > max;
}

const SYSTEM = (s) => `أنت «ثَروة»، مساعد بنكي ذكي داخل تطبيق بنكي سعودي (نموذج تجريبي).
تتحدث بالعربية بلهجة سعودية بسيطة وودّية، وباختصار (جملة إلى ثلاث جمل). لا تستخدم الرموز التعبيرية (emojis).
العملة هي الريال السعودي (ر.س). لا تخترع أرقاماً غير معطاة لك.

بيانات العميل الحالية:
- الرصيد: ${s.balance} ر.س في ${s.account}
- المصروفات هذا الشهر حسب الفئة: ${Object.entries(s.expenses).map(([k, v]) => k + ": " + v + " ر.س").join(" ، ")}
- جهات الاتصال المتاحة للتحويل: ${s.contacts.join(" ، ")}

قدراتك:
1) تنفيذ التحويلات: قبل تنفيذ أي تحويل، لخّص (المبلغ + اسم المستفيد) واطلب تأكيداً صريحاً من العميل. بعد أن يؤكّد فقط، استدعِ الدالة execute_transfer. لا تنفّذ قبل التأكيد.
2) تحليل المصروفات: أجب عن أسئلة الصرف بالأرقام أعلاه. إذا طلب العميل رؤية التحليل الكامل، استدعِ open_screen بالقيمة spend.
3) توصيات الاستثمار: اقترح خطة شهرية بسيطة حسب مستوى المخاطرة والهدف (مثال: 500 ر.س شهرياً، توزيع 60% صناديق / 20% ذهب / 20% مرابحة، نمو متوقع ~8% سنوياً). إذا ودّ العميل يشوف الخطة، استدعِ open_screen بالقيمة invest.
4) الرصيد: أجب مباشرة من الرصيد أعلاه.

التزم بالنطاق البنكي فقط، وإذا سُئلت خارج النطاق اعتذر بلطف ووجّه العميل لما تقدر تساعده فيه.`;

const TOOLS = [{
  function_declarations: [
    {
      name: "execute_transfer",
      description: "ينفّذ تحويلاً مالياً بعد أن يؤكّد العميل صراحةً. استخدمه فقط بعد التأكيد.",
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

function doTransfer(args, s, actions) {
  const amount = Number(args.amount);
  const recipient = String(args.recipient || "").trim() || "المستفيد";
  if (!(amount > 0)) return { ok: false, note: "المبلغ غير صالح." };
  if (amount > s.balance) {
    actions.push({ type: "transfer", ok: false, amount, recipient, message: "الرصيد غير كافٍ لإتمام التحويل." });
    return { ok: false, note: `الرصيد غير كافٍ. الرصيد الحالي ${s.balance} ر.س.` };
  }
  s.balance = Math.round((s.balance - amount) * 100) / 100;
  s.expenses["تحويلات"] = (s.expenses["تحويلات"] || 0) + amount;
  actions.push({ type: "transfer", ok: true, amount, recipient });
  return { ok: true, note: `تم تنفيذ التحويل بنجاح إلى ${recipient}. الرصيد الجديد ${s.balance} ر.س.` };
}

function doOpen(args, actions) {
  const screen = String(args.screen || "");
  actions.push({ type: "open", screen });
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

  const inState = body.state || {};
  const s = {
    balance: typeof inState.balance === "number" ? inState.balance : 24580,
    account: inState.account || "الجاري · •••• 9000",
    expenses: Object.assign({}, inState.expenses || { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 }),
    contacts: inState.contacts || ["أحمد العتيبي", "سارة القحطاني", "محمد الزهراني", "نورة العنزي"]
  };

  const hist = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const contents = hist
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .map((h) => ({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: String(h.text).slice(0, 800) }] }));
  if (!contents.length || contents[0].role !== "user") {
    res.status(400).json({ error: "لا توجد رسالة صالحة." });
    return;
  }

  const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const actions = [];
  let reply = "";

  async function callGemini() {
    const r = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM(s) }] },
        contents,
        tools: TOOLS,
        tool_config: { function_calling_config: { mode: "AUTO" } },
        generationConfig: { maxOutputTokens: 800, temperature: 0.4 }
      })
    });
    return r.json();
  }

  try {
    for (let i = 0; i < 5; i++) {
      const data = await callGemini();
      if (data.error) {
        res.status(200).json({ error: "تعذّر الاتصال بالمساعد: " + (data.error.message || "خطأ") });
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
        if (name === "execute_transfer") out = doTransfer(fargs, s, actions);
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
