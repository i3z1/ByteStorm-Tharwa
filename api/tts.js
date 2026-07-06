// ثَروة — voice replies via Gemini TTS (natural Arabic voice).
// Returns base64 16-bit PCM + sample rate; the client wraps it in a WAV header.
const MODELS = [
  process.env.GEMINI_TTS_MODEL,
  "gemini-2.5-flash-preview-tts"
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

const VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

const HITS = new Map();
function limited(ip) {
  const now = Date.now(), win = 60000, max = 20;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > max;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") { res.status(204).end(); return; } // warm-up ping from the client
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) { res.status(500).json({ error: "الصوت غير مفعّل (المفتاح غير مضبوط)." }); return; }

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "anon";
  if (limited(ip)) { res.status(429).json({ error: "طلبات صوتية كثيرة — انتظر لحظة." }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const text = String(body.text || "").replace(/\*\*/g, "").trim().slice(0, 300);
  if (!text) { res.status(400).json({ error: "لا يوجد نص." }); return; }

  const payload = JSON.stringify({
    contents: [{ parts: [{ text: "اقرأ بلهجة سعودية ودّية وواضحة:\n" + text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
    }
  });

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const model of MODELS) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
          body: payload
        });
        const data = await r.json();
        if (data.error) {
          const code = Number(data.error.code) || 0;
          if (code === 429 || code === 503 || code === 404) continue;
          res.status(200).json({ error: data.error.message || "تعذّر توليد الصوت." });
          return;
        }
        const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
        const part = parts.find((p) => p.inlineData && p.inlineData.data);
        if (part) {
          const mime = part.inlineData.mimeType || "";
          const m = mime.match(/rate=(\d+)/);
          res.status(200).json({ audio: part.inlineData.data, rate: m ? Number(m[1]) : 24000 });
          return;
        }
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    res.status(200).json({ error: "الصوت غير متاح مؤقتاً." });
  } catch (err) {
    res.status(200).json({ error: "تعذّر توليد الصوت." });
  }
}
