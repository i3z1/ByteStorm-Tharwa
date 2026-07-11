// ثَروة — AI banking assistant backend (Google Gemini + Function-Calling)
// FREE tier: create a key at https://aistudio.google.com/apikey (no credit card).
// The key is read from process.env.GEMINI_API_KEY (server-side secret; never exposed to the browser).

// Model fallback chain: on rate limits/overload (429/503) we silently degrade
// to the next model so the demo never dies mid-conversation.
// Paid tier: flash first (smarter), lite as the safety net.
const MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
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

const DEFAULT_TXNS = [
  { name: "مطعم النخيل", cat: "مطاعم", amount: 85, dir: "out", when: "اليوم 1:24 م" },
  { name: "سوبرماركت العثيم", cat: "تسوّق", amount: 243.5, dir: "out", when: "أمس 6:10 م" },
  { name: "راتب — شركة", cat: "دخل", amount: 12000, dir: "in", when: "27 يونيو" }
];

const DEFAULT_CARDS = [
  { id: "mada", name: "مدى الرقمية", last4: "4821", frozen: false },
  { id: "credit", name: "الائتمانية بلاتينيوم", last4: "9310", frozen: false }
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
function normIban(v) { return String(v || "").replace(/\s+/g, "").toUpperCase(); }
function validIban(v) { return /^SA\d{20,24}$/.test(normIban(v)); }
function fmtIban(v) { return normIban(v).replace(/(.{4})/g, "$1 ").trim(); }

const RISKS = { "متحفظ": 5.1, "متوسط": 8.4, "جريء": 12.3 };
const CATS = ["مطاعم", "تسوّق", "فواتير", "تحويلات", "أخرى"];

// future value of a monthly contribution at annualPct compound growth
function fvMonthly(monthly, annualPct, months) {
  const i = annualPct / 100 / 12;
  return Math.round(monthly * ((Math.pow(1 + i, months) - 1) / i));
}
// monthly contribution needed to reach target in `months` (rounded up to 50)
function neededMonthly(target, annualPct, months) {
  const i = annualPct / 100 / 12;
  return Math.max(50, Math.ceil((target * i / (Math.pow(1 + i, months) - 1)) / 50) * 50);
}

const SYSTEM = (s) => {
  const totalExp = Math.round(Object.values(s.expenses).reduce((a, b) => a + b, 0));
  const surplus = Math.max(0, Math.round(s.income - totalExp));
  const g = s.invest.goal || {};
  return `أنت «ثَروة»، مساعد بنكي ذكي داخل تطبيق بنكي سعودي (نموذج تجريبي).
تتحدث بالعربية بلهجة سعودية بسيطة وودّية وباختصار (جملة إلى ثلاث جمل). لا تستخدم الرموز التعبيرية (emojis).
العملة: الريال السعودي (ر.س). لا تخترع أرقاماً غير معطاة لك.

بيانات العميل الحالية:
- الرصيد: ${s.balance} ر.س في ${s.account}
- الدخل الشهري: ${s.income} ر.س — إجمالي مصروفات الشهر: ${totalExp} ر.س — الفائض الشهري المتاح تقريباً: ${surplus} ر.س
- مصروفات الشهر حسب الفئة: ${Object.entries(s.expenses).map(([k, v]) => k + ": " + v + " ر.س").join(" ، ")}
- الميزانيات المضبوطة: ${Object.entries(s.budgets).map(([k, v]) => `${k}: صرف ${s.expenses[k] || 0} من حد ${v} ر.س`).join(" ، ") || "لا يوجد"}
- آخر العمليات (الأحدث أولاً): ${s.txns.map((t) => `${t.name} — ${t.amount} ر.س ${t.dir === "in" ? "(دخل)" : "(صرف · " + t.cat + ")"} — ${t.when}`).join(" ، ") || "لا يوجد"}
- المستفيدون المسجّلون: ${s.beneficiaries.map((b) => `${b.name} (${b.bank})`).join(" ، ") || "لا يوجد"}
- بطاقات العميل: ${s.cards.map((c) => `${c.name} •••• ${c.last4} (${c.frozen ? "موقوفة مؤقتاً" : "نشطة"})`).join(" ، ")}
- خطة الاستثمار الحالية: ${s.invest.monthly} ر.س شهرياً — مخاطرة: ${s.invest.risk} — الهدف: ${g.amount > 0 ? `${g.name} (${g.amount} ر.س خلال ${g.months} شهراً)` : "غير محدد"}

قاعدة أساسية: الكلام وحده لا ينفّذ شيئاً — أي إجراء (بطاقة تحويل، إضافة مستفيد، خطة استثمار، ميزانية، زكاة، فتح شاشة) يتم فقط عبر استدعاء الأداة فعلياً في نفس هذا الرد. لا تقل أبداً «تم الضبط» أو «تم التنفيذ» أو إن بطاقة أو شاشة ظهرت للعميل إذا لم تستدعِ الأداة — الادعاء النصي بدون أداة يعتبر خطأً جسيماً.

أدواتك وكيف تستخدمها:
1) propose_transfer(amount, recipient): استدعها فور معرفة المبلغ واسم المستفيد — ستظهر للعميل بطاقة تأكيد تفاعلية فيها المستفيد والبنك والآيبان والمبلغ وزرّا تأكيد/إلغاء. إذا طابق الاسم المذكور مستفيداً واحداً فقط (ولو بالاسم الأول) فلا تسأل — اعتبره المقصود واستدعِ الأداة فوراً. اسأل فقط إذا نقص المبلغ أو كان الاسم يطابق أكثر من مستفيد. لا تسأل تأكيداً نصياً — البطاقة تتكفّل بذلك. إذا كان المستفيد غير مسجّل، اقترح إضافته كمستفيد جديد.
2) execute_transfer(amount, recipient): التنفيذ الفعلي — لا تستدعها إلا إذا كتب العميل تأكيداً صريحاً بعد ظهور البطاقة.
3) add_beneficiary(name, iban, bank): لإضافة مستفيد جديد لازم تجمع البيانات كاملة — الاسم الكامل + رقم الآيبان (يبدأ بحرفَي SA ثم 22 رقماً) + اسم البنك. اسأل العميل عن كل بيان ناقص واحداً واحداً: اطلب الآيبان أولاً، ثم اسم البنك. تحقّق أن الآيبان بالصيغة الصحيحة، وإذا كان ناقصاً أو خاطئاً اطلبه من جديد بلطف. لا تخترع آيباناً أو بنكاً أبداً، ولا تستدعِ الأداة إلا بعد أن يعطيك العميل الآيبان واسم البنك فعلياً. بعد نجاح الإضافة تظهر للعميل بطاقة المستفيد بكل تفاصيله. (ملاحظة: المستفيدون المسجّلون مسبقاً معروفة بياناتهم — لا تسأل عنها عند التحويل لهم.)
4) set_investment_plan(monthly, risk, goal_name, goal_amount, goal_months): عند طلب خطة استثمار أو هدف ادخار (مثل: «أبي أجمع 30 ألف لسيارة خلال سنة» → goal_name سيارة، goal_amount 30000، goal_months 12). إذا لم يحدد العميل مبلغاً شهرياً لا ترسل monthly — سيُحسب تلقائياً القسط الذي يحقق الهدف بعائد مركّب. المستويات: متحفظ (~5.1%)، متوسط (~8.4%)، جريء (~12.3%) — إن لم يحدد استخدم متوسط. ستُفتح شاشة الاستثمار تلقائياً.
5) set_budget(category, amount): استدعها فوراً عند أي طلب فيه «ميزانية» أو «حد صرف» أو «سقف» لفئة — أمثلة: «حط ميزانية 1500 للمطاعم»، «أبي ميزانية للتسوق 1000»، «لا أبي أصرف أكثر من 800 على الفواتير». الفئات: مطاعم، تسوّق، فواتير، تحويلات، أخرى. تظهر بشريط تقدم في شاشة التحليل.
6) calculate_zakat(): عند سؤال العميل عن زكاته — تحسب 2.5% من رصيده وتعرض بطاقة. وضّح دائماً أنه تقدير توعوي.
7) show_receipt(): عند طلب إيصال أو وصل آخر تحويل («أبي إيصال آخر عملية») — تعرض بطاقة إيصال قابلة للمشاركة.
8) open_screen(screen): لفتح شاشة home أو spend أو invest عند الطلب.
9) financial_health(): يحسب درجة صحة العميل المالية من 100 ويعرض بطاقة بصرية بعداد وثلاثة عوامل. استدعها فوراً عند أي طلب تقييم للوضع المالي: «قيّم وضعي المالي»، «كيف وضعي المالي»، «كم درجتي المالية». بعد النجاح علّق باختصار وقدّم نصيحة عملية واحدة على أضعف عامل.
10) set_card_lock(card, lock): إيقاف بطاقة مؤقتاً أو إعادة تفعيلها. استدعها فوراً عند: «جمّد بطاقتي»، «أوقف بطاقة مدى»، «ضاعت بطاقتي»، «انسرقت بطاقتي»، «فك تجميد بطاقتي»، «فعّل بطاقتي». مرّر اسم البطاقة أو نوعها أو آخر 4 أرقام. إذا قال «بطاقتي» فقط وعنده أكثر من بطاقة نشطة اسأله أيّها يقصد (اذكر أسماءها). عند بطاقة مفقودة/مسروقة: جمّدها فوراً بدون أسئلة إضافية، وبعد النجاح طمّن العميل أن أي عملية عليها مرفوضة الآن، واعرض عليه طلب بطاقة بديلة (تصل خلال 3-5 أيام عمل) وأنه يقدر يفك التجميد بنفس الطريقة لو لقاها.

أنت أيضاً خط الدعم الأول للعميل — جاوب استفسارات الخدمة مباشرة من هذه المعلومات بدل تحويله لمركز الاتصال:
- التحويل المحلي (سريع): فوري ومجاني. الحد اليومي للتحويلات: 60,000 ر.س ويمكن تعديله من إعدادات الأمان.
- تحديث الهوية/الإقامة: يتم تلقائياً عبر أبشر خلال 24 ساعة من التجديد — ما يحتاج زيارة فرع.
- الاعتراض على عملية غير معروفة: يقدَّم من التطبيق وتُعالَج خلال 10 أيام عمل، والمبلغ يُعاد إذا ثبت الاحتيال.
- بطاقة مفقودة أو اشتباه احتيال على البطاقة: الإجراء الفوري هو التجميد المؤقت بأداة set_card_lock.
- إذا خرج الطلب عن معلوماتك أو احتاج تدخلاً بشرياً (قروض، فتح حسابات، شكاوى معقدة): اعتذر بلطف واعرض تحويله لموظف خدمة العملاء.

قواعد: أجب عن أسئلة الرصيد والمصروفات والدخل والمستفيدين مباشرة من البيانات أعلاه. تقييم الوضع المالي يتم حصراً عبر أداة financial_health (لا تحلّل نصياً بدونها). إذا اقترحت خطة استثمار تأكد أن القسط ضمن الفائض الشهري وإلا نبّه العميل بلطف. التزم بالنطاق البنكي فقط، وإذا سُئلت خارجه اعتذر بلطف ووجّه العميل لما تقدر تساعده فيه.`;
};

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
      description: "يضبط خطة استثمار مرتبطة بهدف ادخار: يحسب القسط الشهري المطلوب بعائد مركّب ويفتح شاشة الاستثمار. مرّر الهدف إذا ذكره العميل، ولا تمرّر monthly إلا إذا حدده العميل صراحة.",
      parameters: {
        type: "OBJECT",
        properties: {
          monthly: { type: "NUMBER", description: "المبلغ الشهري بالريال (اتركه إذا لم يحدده العميل — سيُحسب من الهدف)" },
          risk: { type: "STRING", enum: ["متحفظ", "متوسط", "جريء"], description: "مستوى المخاطرة (متوسط إن لم يُحدد)" },
          goal_name: { type: "STRING", description: "اسم الهدف، مثل: سيارة، زواج، طوارئ" },
          goal_amount: { type: "NUMBER", description: "مبلغ الهدف بالريال" },
          goal_months: { type: "NUMBER", description: "مدة الهدف بالأشهر" }
        },
        required: []
      }
    },
    {
      name: "set_budget",
      description: "يضبط ميزانية شهرية / حد صرف / سقف إنفاق لفئة مصروفات، وتظهر بشريط تقدم في شاشة التحليل. استدعه فوراً لأي طلب مثل: حط ميزانية 1500 للمطاعم، أبي ميزانية للتسوق، لا أبي أصرف أكثر من كذا على فئة.",
      parameters: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", description: "الفئة: مطاعم، تسوّق، فواتير، تحويلات، أخرى" },
          amount: { type: "NUMBER", description: "حد الميزانية الشهري بالريال" }
        },
        required: ["category", "amount"]
      }
    },
    {
      name: "calculate_zakat",
      description: "يحسب زكاة رصيد العميل الحالي (2.5%) كتقدير توعوي ويعرض بطاقة بالتفاصيل.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "show_receipt",
      description: "يعرض للعميل إيصال آخر تحويل نفّذه (بطاقة قابلة للمشاركة). استدعه عند طلب: أبي إيصال آخر عملية، إيصال التحويل، وصل التحويل.",
      parameters: { type: "OBJECT", properties: {} }
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
    },
    {
      name: "financial_health",
      description: "يحسب درجة الصحة المالية للعميل من 100 (نسبة الادخار + الالتزام بالميزانيات + توازن الصرف) ويعرض بطاقة بصرية بعداد دائري وثلاثة عوامل ملونة. استدعه فوراً عند: قيّم وضعي المالي، كيف وضعي المالي، كم درجتي المالية، افحص صحتي المالية.",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "set_card_lock",
      description: "يوقف بطاقة العميل مؤقتاً (تجميد) أو يعيد تفعيلها. استدعه فوراً عند أي طلب مثل: جمّد بطاقتي، أوقف بطاقة مدى، قفل البطاقة، ضاعت بطاقتي، انسرقت بطاقتي، فك التجميد، فعّل بطاقتي. البطاقة الموقوفة تُرفض منها كل العمليات فوراً.",
      parameters: {
        type: "OBJECT",
        properties: {
          card: { type: "STRING", description: "اسم البطاقة أو نوعها أو آخر 4 أرقام (مثل: مدى، الائتمانية، 4821)" },
          lock: { type: "BOOLEAN", description: "true = إيقاف مؤقت، false = إعادة تفعيل" }
        },
        required: ["card", "lock"]
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
  // fraud guard: flag amounts far above the customer's usual pattern
  const warn = (amount >= 5000 || amount > s.balance * 0.4)
    ? "هذا المبلغ أعلى من نمط تحويلاتك المعتاد — تأكد من صحة المستفيد قبل التأكيد."
    : "";
  actions.push({ type: "confirm", amount, recipient: b.name, bank: b.bank, iban: b.iban, account: s.account, warn });
  return { ok: true, note: `تم عرض بطاقة التأكيد للعميل — المستفيد المطابق: ${b.name} (${b.bank}). في ردك اذكر اسم المستفيد الكامل وبنكه حتى يتأكد العميل أنه الشخص الصحيح، واطلب منه مراجعة التفاصيل والضغط على زر التأكيد.` + (warn ? " ظهر في البطاقة تنبيه حماية لأن المبلغ أعلى من المعتاد — نبّه العميل بلطف أن يتأكد من المستفيد." : "") };
}

function transfer(s, amount, recipientName, actions, ben) {
  if (!(amount > 0)) return { ok: false, note: "المبلغ غير صالح." };
  if (amount > s.balance) {
    actions.push({ type: "transfer", ok: false, amount, recipient: recipientName, message: "الرصيد غير كافٍ لإتمام التحويل." });
    return { ok: false, note: `الرصيد غير كافٍ. الرصيد الحالي ${s.balance} ر.س.` };
  }
  s.balance = Math.round((s.balance - amount) * 100) / 100;
  s.expenses["تحويلات"] = (s.expenses["تحويلات"] || 0) + amount;
  s.txns.unshift({ name: "تحويل إلى " + recipientName, cat: "تحويلات", amount, dir: "out", when: "الآن" });
  if (s.txns.length > 15) s.txns.length = 15;
  actions.push({ type: "transfer", ok: true, amount, recipient: recipientName });
  actions.push(receiptAction(amount, recipientName, ben));
  return { ok: true, note: `تم تنفيذ التحويل بنجاح إلى ${recipientName}. الرصيد الجديد ${s.balance} ر.س. ظهر للعميل إيصال التحويل ويقدر يشاركه من زر المشاركة.` };
}

function receiptAction(amount, recipient, ben) {
  return {
    type: "receipt", amount, recipient,
    bank: ben ? ben.bank : "", iban: ben ? ben.iban : "",
    ref: "THW-" + Date.now().toString(36).toUpperCase().slice(-6),
    ts: Date.now()
  };
}

function doExecute(args, s, actions) {
  const b = findBen(s.beneficiaries, args.recipient);
  return transfer(s, Number(args.amount), b ? b.name : String(args.recipient || "المستفيد"), actions, b);
}

function doReceipt(s, actions) {
  const t = s.txns.find((x) => x.dir === "out" && x.cat === "تحويلات");
  if (!t) return { ok: false, note: "لا يوجد تحويلات سابقة في سجل العميل — أخبره بلطف أنه ما نفّذ تحويلات بعد." };
  const name = t.name.replace(/^تحويل إلى\s*/, "");
  const b = findBen(s.beneficiaries, name);
  actions.push(receiptAction(t.amount, name, b));
  return { ok: true, note: `ظهر للعميل إيصال آخر تحويل: ${t.amount} ر.س إلى ${name}. يقدر يشاركه من زر المشاركة في البطاقة.` };
}

function doAddBen(args, s, actions) {
  const name = String(args.name || "").trim().slice(0, 60);
  if (!name) return { ok: false, note: "ناقص: الاسم الكامل للمستفيد. اطلبه من العميل." };
  if (findBen(s.beneficiaries, name)) return { ok: false, note: `«${name}» مسجّل مسبقاً في المستفيدين — تقدر تحوّل له مباشرة.` };
  const bank = String(args.bank || "").trim().slice(0, 40);
  const ibanRaw = String(args.iban || "").trim();
  if (!ibanRaw) return { ok: false, note: `ناقص: رقم الآيبان لـ${name}. اطلب الآيبان من العميل (يبدأ بـ SA). لا تضف المستفيد بدونه.` };
  if (!validIban(ibanRaw)) return { ok: false, note: "الآيبان غير صحيح — لازم يبدأ بحرفَي SA ويتبعه 22 رقماً. اطلب من العميل الآيبان الصحيح." };
  if (!bank) return { ok: false, note: `ناقص: اسم بنك المستفيد ${name}. اطلب اسم البنك من العميل. لا تضف المستفيد بدونه.` };
  if (s.beneficiaries.length >= 30) return { ok: false, note: "وصلت للحد الأقصى من المستفيدين." };
  const iban = fmtIban(ibanRaw);
  const b = { name, bank, iban };
  s.beneficiaries.push(b);
  actions.push({ type: "beneficiary", name, bank, iban });
  return { ok: true, note: `تمت إضافة ${name} — ${bank} — آيبان ${iban} — بنجاح. الآن تقدر تحوّل له مباشرة.` };
}

function doInvest(args, s, actions) {
  const risk = Object.prototype.hasOwnProperty.call(RISKS, normAr(args.risk)) ? normAr(args.risk) : (s.invest.risk || "متوسط");
  const g = Object.assign({ name: "ادخار عام", amount: 20000, months: 24 }, s.invest.goal || {});
  if (Number(args.goal_amount) > 0) {
    g.amount = Math.min(10000000, Math.round(Number(args.goal_amount)));
    g.months = Number(args.goal_months) > 0 ? Math.min(120, Math.round(Number(args.goal_months))) : 24;
    g.name = String(args.goal_name || "هدف ادخار").slice(0, 40);
  }
  let monthly = Number(args.monthly);
  if (!(monthly > 0)) monthly = neededMonthly(g.amount, RISKS[risk], g.months);
  monthly = Math.max(250, Math.min(20000, Math.round(monthly / 50) * 50));
  const projected = fvMonthly(monthly, RISKS[risk], g.months);
  const surplus = Math.max(0, Math.round(s.income - Object.values(s.expenses).reduce((a, b) => a + b, 0)));
  s.invest = { monthly, risk, goal: g };
  actions.push({ type: "invest_plan", monthly, risk, goal: g, projected });
  const fit = projected >= g.amount ? "الخطة تحقق الهدف" : "المتوقع أقل من الهدف — اقترح على العميل زيادة القسط أو المدة";
  const afford = monthly > surplus ? ` انتبه: القسط أعلى من فائض العميل الشهري (~${surplus} ر.س) — نبّهه بلطف.` : ` القسط ضمن فائض العميل الشهري (~${surplus} ر.س).`;
  return { ok: true, note: `الخطة: ${monthly} ر.س شهرياً بمستوى «${risk}» (~${RISKS[risk]}% سنوياً). الهدف: ${g.name} — ${g.amount} ر.س خلال ${g.months} شهراً. المتوقع تجميعه بعائد مركّب: ~${projected} ر.س (${fit}).${afford} فُتحت شاشة الاستثمار للعميل.` };
}

function doBudget(args, s, actions) {
  const raw = normAr(args.category);
  const cat = CATS.find((c) => normAr(c) === raw || normAr(c).indexOf(raw) > -1 || raw.indexOf(normAr(c)) > -1) || "";
  if (!cat) return { ok: false, note: "الفئة غير معروفة — الفئات المتاحة: " + CATS.join("، ") + ". اسأل العميل أي فئة يقصد." };
  let amount = Number(args.amount);
  if (!(amount > 0)) return { ok: false, note: "المبلغ غير صالح — اطلب من العميل حد الميزانية الشهري." };
  amount = Math.max(50, Math.min(100000, Math.round(amount / 50) * 50));
  s.budgets[cat] = amount;
  const spent = s.expenses[cat] || 0;
  actions.push({ type: "budget", category: cat, amount, spent });
  const pct = Math.round(spent / amount * 100);
  return { ok: true, note: `تم ضبط ميزانية «${cat}» عند ${amount} ر.س شهرياً. المصروف حتى الآن ${spent} ر.س (${pct}%).${spent >= amount ? " العميل متجاوز الميزانية بالفعل — نبّهه بلطف." : ""} تظهر بشريط تقدم في شاشة التحليل.` };
}

function doZakat(s, actions) {
  const amount = Math.round(s.balance * 0.025 * 100) / 100;
  actions.push({ type: "zakat", amount, base: s.balance });
  return { ok: true, note: `الزكاة التقديرية: 2.5% من الرصيد الحالي (${s.balance} ر.س) = ${amount} ر.س. ظهرت بطاقة للعميل. وضّح أنه تقدير توعوي يفترض حولان الحول وبلوغ النصاب، وأن عليه ضم بقية أمواله الزكوية.` };
}

function doOpen(args, actions) {
  actions.push({ type: "open", screen: String(args.screen || "") });
  return { ok: true, note: "تم فتح الشاشة للعميل." };
}

function doHealth(s, actions) {
  const totalExp = Object.values(s.expenses).reduce((a, b) => a + b, 0);
  const surplus = Math.max(0, s.income - totalExp);
  const saveRatio = s.income > 0 ? surplus / s.income : 0;
  const savePts = Math.round(Math.min(1, saveRatio / 0.3) * 45);
  const saveStatus = saveRatio >= 0.25 ? "ok" : (saveRatio >= 0.1 ? "warn" : "bad");

  const bKeys = Object.keys(s.budgets);
  let budgetPts, budgetNote, budgetStatus;
  if (!bKeys.length) {
    budgetPts = 18;
    budgetStatus = "warn";
    budgetNote = "ما ضبطت ميزانيات بعد — جرّب «حط ميزانية 1500 للمطاعم»";
  } else {
    const okCount = bKeys.filter((k) => (s.expenses[k] || 0) < s.budgets[k]).length;
    budgetPts = Math.round(okCount / bKeys.length * 30);
    budgetStatus = okCount === bKeys.length ? "ok" : (okCount ? "warn" : "bad");
    budgetNote = `${okCount} من ${bKeys.length} ${bKeys.length === 1 ? "ميزانية" : "ميزانيات"} ضمن الحد`;
  }

  const vals = Object.values(s.expenses);
  const topVal = vals.length ? Math.max.apply(null, vals) : 0;
  const topShare = totalExp > 0 ? topVal / totalExp : 0;
  const topCat = Object.keys(s.expenses).find((k) => s.expenses[k] === topVal) || "";
  const balancePts = Math.round(Math.max(0, Math.min(1, (0.6 - topShare) / 0.25)) * 25);
  const balanceStatus = topShare <= 0.4 ? "ok" : (topShare <= 0.5 ? "warn" : "bad");

  const score = Math.max(5, Math.min(100, savePts + budgetPts + balancePts));
  const factors = [
    { name: "نسبة الادخار", pts: savePts, max: 45, status: saveStatus, note: `توفّر ~${Math.round(saveRatio * 100)}% من دخلك (الموصى به 30%+)` },
    { name: "الالتزام بالميزانيات", pts: budgetPts, max: 30, status: budgetStatus, note: budgetNote },
    { name: "توازن الصرف", pts: balancePts, max: 25, status: balanceStatus, note: `أعلى فئة (${topCat}) تمثل ${Math.round(topShare * 100)}% من صرفك` }
  ];
  // the weakest factor (as a fraction of its max) becomes the actionable tip
  const weakest = factors.reduce((a, b) => (a.pts / a.max <= b.pts / b.max ? a : b));
  actions.push({ type: "health", score, factors, focus: weakest.name });
  return {
    ok: true,
    note: `درجة الصحة المالية: ${score}/100 — العوامل: ${factors.map((f) => `${f.name} ${f.pts}/${f.max} (${f.note})`).join(" ، ")}. ظهرت البطاقة البصرية للعميل. علّق باختصار على الدرجة وقدّم نصيحة عملية واحدة تركز على أضعف عامل (${weakest.name}).`
  };
}

function findCard(cards, ref) {
  const n = normAr(ref).replace(/^ال/, "");
  if (!n) return null;
  const digits = n.replace(/\D/g, "");
  if (digits.length >= 4) {
    const hit = cards.find((c) => c.last4 === digits.slice(-4));
    if (hit) return hit;
  }
  return cards.find((c) => {
    const cn = normAr(c.name).replace(/^ال/, "");
    return cn === n || cn.includes(n) || n.includes(cn) || normAr(c.id) === n
      || (/(مدى|مدي|mada)/i.test(n) && c.id === "mada")
      || (/(ائتمان|اءتمان|credit|فيزا|visa|بلاتين)/i.test(n) && c.id === "credit");
  }) || null;
}

function doCardLock(args, s, actions) {
  const lock = args.lock !== false;
  const c = findCard(s.cards, args.card);
  if (!c) {
    return { ok: false, note: `لم أتعرف على البطاقة «${args.card}». بطاقات العميل: ${s.cards.map((x) => `${x.name} •••• ${x.last4}`).join(" ، ")}. اسأل العميل أي بطاقة يقصد.` };
  }
  if (c.frozen === lock) {
    return { ok: false, note: `بطاقة ${c.name} •••• ${c.last4} ${lock ? "موقوفة مؤقتاً بالفعل" : "نشطة بالفعل"} — أخبر العميل بذلك.` };
  }
  c.frozen = lock;
  actions.push({ type: "card_lock", name: c.name, last4: c.last4, locked: lock });
  return {
    ok: true,
    note: lock
      ? `تم إيقاف بطاقة ${c.name} •••• ${c.last4} مؤقتاً — كل العمليات عليها مرفوضة من هذه اللحظة. طمّن العميل، واعرض عليه طلب بطاقة بديلة إذا كانت مفقودة (تصل خلال 3-5 أيام عمل)، وذكّره أنه يقدر يفك التجميد بأي وقت لو لقاها.`
      : `تمت إعادة تفعيل بطاقة ${c.name} •••• ${c.last4} — تشتغل الآن بشكل طبيعي. أخبر العميل.`
  };
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
    income: (typeof inState.income === "number" && isFinite(inState.income) && inState.income > 0) ? Math.min(1000000, inState.income) : 12000,
    budgets: (() => {
      const b = {}, src = inState.budgets || {};
      Object.keys(src).slice(0, 10).forEach((k) => {
        const v = Number(src[k]);
        if (v > 0) b[String(k).slice(0, 20)] = Math.min(100000, v);
      });
      return b;
    })(),
    expenses: Object.assign({}, inState.expenses || { "مطاعم": 2247, "تسوّق": 1412, "فواتير": 1156, "تحويلات": 963, "أخرى": 642 }),
    beneficiaries: Array.isArray(inState.beneficiaries) && inState.beneficiaries.length
      ? inState.beneficiaries.slice(0, 30).map((b) => ({
          name: String((b && b.name) || "").slice(0, 60),
          bank: String((b && b.bank) || "").slice(0, 40),
          iban: String((b && b.iban) || "").slice(0, 40)
        })).filter((b) => b.name)
      : DEFAULT_BENEFICIARIES.map((b) => Object.assign({}, b)),
    txns: Array.isArray(inState.txns) && inState.txns.length
      ? inState.txns.slice(0, 15).map((t) => ({
          name: String((t && t.name) || "").slice(0, 60),
          cat: String((t && t.cat) || "أخرى").slice(0, 20),
          amount: Number(t && t.amount) || 0,
          dir: t && t.dir === "in" ? "in" : "out",
          when: String((t && t.when) || "").slice(0, 30)
        })).filter((t) => t.name && t.amount > 0)
      : DEFAULT_TXNS.map((t) => Object.assign({}, t)),
    cards: Array.isArray(inState.cards) && inState.cards.length
      ? inState.cards.slice(0, 5).map((c) => ({
          id: String((c && c.id) || "").slice(0, 20),
          name: String((c && c.name) || "بطاقة").slice(0, 40),
          last4: String((c && c.last4) || "").replace(/\D/g, "").slice(-4),
          frozen: !!(c && c.frozen)
        })).filter((c) => c.last4)
      : DEFAULT_CARDS.map((c) => Object.assign({}, c)),
    invest: {
      monthly: (inState.invest && Number(inState.invest.monthly) > 0) ? Number(inState.invest.monthly) : 500,
      risk: (inState.invest && RISKS[normAr(inState.invest.risk)] !== undefined) ? normAr(inState.invest.risk) : "متوسط",
      goal: (() => {
        const g = (inState.invest && inState.invest.goal) || {};
        const amount = Number(g.amount);
        return {
          name: String(g.name || "ادخار عام").slice(0, 40),
          amount: amount > 0 ? Math.min(10000000, Math.round(amount)) : 20000,
          months: Number(g.months) > 0 ? Math.min(120, Math.round(Number(g.months))) : 24
        };
      })()
    }
  };

  const actions = [];

  // ---- deterministic path: user clicked the confirmation card button ----
  // (AI proposes → customer approves in UI → system executes. No LLM needed here.)
  if (body.confirm) {
    const amount = Number(body.confirm.amount);
    const b = findBen(s.beneficiaries, body.confirm.recipient);
    const name = b ? b.name : String(body.confirm.recipient || "المستفيد").slice(0, 60);
    const r = transfer(s, amount, name, actions, b);
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
      // thinkingBudget 0: replies come straight out — no hidden "thinking" tokens
      // eating the output budget (that's what was truncating replies mid-sentence)
      generationConfig: { maxOutputTokens: 1024, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } }
    });
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
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
      // whole chain rate-limited → brief pause, then one more sweep
      if (attempt === 0) await new Promise((r) => setTimeout(r, 3000));
    }
    return { error: lastErr || { message: "unavailable" } };
  }

  // If the LLM dies AFTER a tool already executed, answer with a canned line —
  // the action (card/beneficiary/plan) already happened; never show an error then.
  function cannedReply() {
    const last = actions[actions.length - 1];
    if (!last) return "";
    if (last.type === "confirm") return "جهّزت لك بطاقة التأكيد — راجع التفاصيل واضغط «تأكيد التحويل».";
    if (last.type === "beneficiary") return `تمت إضافة ${last.name} إلى مستفيديك — تقدر تحوّل له مباشرة.`;
    if (last.type === "invest_plan") return `جهّزت لك الخطة: ${last.monthly} ر.س شهرياً بمستوى «${last.risk}» — افتح شاشة الاستثمار وشوف التفاصيل.`;
    if (last.type === "budget") return `تم ضبط ميزانية ${last.category} عند ${last.amount} ر.س شهرياً — تشوفها في شاشة التحليل.`;
    if (last.type === "zakat") return `زكاتك التقديرية ${last.amount} ر.س (2.5% من رصيدك الحالي).`;
    if (last.type === "receipt") return "هذا إيصال التحويل — تقدر تشاركه من زر المشاركة في البطاقة.";
    if (last.type === "health") return `صحتك المالية ${last.score} من 100 — تفاصيل العوامل الثلاثة في البطاقة، وأضعفها حالياً ${last.focus}.`;
    if (last.type === "card_lock") return last.locked
      ? `تم إيقاف بطاقة ${last.name} •••• ${last.last4} مؤقتاً — كل العمليات عليها مرفوضة الآن، وتقدر تفك التجميد بأي وقت.`
      : `تمت إعادة تفعيل بطاقة ${last.name} •••• ${last.last4} — تشتغل الآن بشكل طبيعي.`;
    if (last.type === "transfer" && last.ok) return `تم تنفيذ التحويل بنجاح. رصيدك الحالي ${s.balance} ر.س.`;
    if (last.type === "transfer") return "تعذّر تنفيذ التحويل: الرصيد غير كافٍ.";
    if (last.type === "open") return "فتحت لك الشاشة.";
    return "";
  }

  try {
    for (let i = 0; i < 4; i++) {
      const data = await callGemini();
      if (data.error) {
        const canned = cannedReply();
        if (canned) { res.status(200).json({ reply: canned, state: s, actions }); return; }
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
        else if (name === "set_budget") out = doBudget(fargs, s, actions);
        else if (name === "calculate_zakat") out = doZakat(s, actions);
        else if (name === "show_receipt") out = doReceipt(s, actions);
        else if (name === "open_screen") out = doOpen(fargs, actions);
        else if (name === "set_card_lock") out = doCardLock(fargs, s, actions);
        else if (name === "financial_health") out = doHealth(s, actions);
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
