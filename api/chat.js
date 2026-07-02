// ثَروة — AI banking assistant backend (Claude + Function-Calling)
// The API key is read from process.env.ANTHROPIC_API_KEY (server-side secret; never exposed to the browser).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

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
1) تنفيذ التحويلات: قبل تنفيذ أي تحويل، لخّص (المبلغ + اسم المستفيد) واطلب تأكيداً صريحاً من العميل. بعد أن يؤكّد فقط، استدعِ الأداة execute_transfer. لا تنفّذ قبل التأكيد.
2) تحليل المصروفات: أجب عن أسئلة الصرف بالأرقام أعلاه. إذا طلب العميل رؤية التحليل الكامل، استدعِ open_screen بالقيمة spend.
3) توصيات الاستثمار: اقترح خطة شهرية بسيطة حسب مستوى المخاطرة والهدف (مثال: 500 ر.س شهرياً، توزيع 60% صناديق / 20% ذهب / 20% مرابحة، نمو متوقع ~8% سنوياً). إذا ودّ العميل يشوف الخطة، استدعِ open_screen بالقيمة invest.
4) الرصيد: أجب مباشرة من الرصيد أعلاه.

التزم بالنطاق البنكي فقط، وإذا سُئلت خارج النطاق اعتذر بلطف ووجّه العميل لما تقدر تساعده فيه.`;

const TOOLS = [
  {
    name: "execute_transfer",
    description: "ينفّذ تحويلاً مالياً بعد أن يؤكّد العميل صراحةً. استخدمه فقط بعد التأكيد.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number", description: "المبلغ بالريال السعودي" },
        recipient: { type: "string", description: "اسم المستفيد" }
      },
      required: ["amount", "recipient"],
      additionalProperties: false
    }
  },
  {
    name: "open_screen",
    description: "يفتح شاشة داخل التطبيق للعميل: تحليل المصروفات (spend) أو خطة الاستثمار (invest) أو الرئيسية (home).",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        screen: { type: "string", enum: ["home", "spend", "invest"] }
      },
      required: ["screen"],
      additionalProperties: false
    }
  }
];

function doTransfer(input, s, actions) {
  const amount = Number(input.amount);
  const recipient = String(input.recipient || "").trim() || "المستفيد";
  if (!(amount > 0)) {
    return "المبلغ غير صالح.";
  }
  if (amount > s.balance) {
    actions.push({ type: "transfer", ok: false, amount, recipient, message: "الرصيد غير كافٍ لإتمام التحويل." });
    return `فشل التحويل: الرصيد غير كافٍ. الرصيد الحالي ${s.balance} ر.س.`;
  }
  s.balance = Math.round((s.balance - amount) * 100) / 100;
  s.expenses["تحويلات"] = (s.expenses["تحويلات"] || 0) + amount;
  actions.push({ type: "transfer", ok: true, amount, recipient });
  return `تم تنفيذ التحويل بنجاح. تم تحويل ${amount} ر.س إلى ${recipient}. الرصيد الجديد ${s.balance} ر.س.`;
}

function doOpen(input, actions) {
  const screen = String(input.screen || "");
  actions.push({ type: "open", screen });
  return "تم فتح الشاشة للعميل.";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  if (!process.env.ANTHROPIC_API_KEY) {
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
    expenses: inState.expenses || { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 },
    contacts: inState.contacts || ["أحمد العتيبي", "سارة القحطاني", "محمد الزهراني", "نورة العنزي"]
  };
  s.expenses = Object.assign({}, s.expenses);

  const hist = Array.isArray(body.history) ? body.history.slice(-20) : [];
  const messages = hist
    .filter((h) => h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string")
    .map((h) => ({ role: h.role, content: String(h.text).slice(0, 800) }));
  if (!messages.length || messages[0].role !== "user") {
    res.status(400).json({ error: "لا توجد رسالة صالحة." });
    return;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const actions = [];
  let reply = "";

  try {
    for (let i = 0; i < 5; i++) {
      const resp = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM(s),
        tools: TOOLS,
        messages
      });

      if (resp.stop_reason !== "tool_use") {
        reply = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        break;
      }

      messages.push({ role: "assistant", content: resp.content });
      const results = [];
      for (const b of resp.content) {
        if (b.type !== "tool_use") continue;
        let out;
        if (b.name === "execute_transfer") out = doTransfer(b.input || {}, s, actions);
        else if (b.name === "open_screen") out = doOpen(b.input || {}, actions);
        else out = "أداة غير معروفة.";
        results.push({ type: "tool_result", tool_use_id: b.id, content: out });
      }
      messages.push({ role: "user", content: results });
    }

    if (!reply) reply = "تمام.";
    res.status(200).json({ reply, state: s, actions });
  } catch (err) {
    const msg = (err && err.status === 429)
      ? "المساعد مشغول حالياً، حاول بعد لحظات."
      : "حدث خطأ في الاتصال بالمساعد.";
    res.status(200).json({ error: msg });
  }
}
