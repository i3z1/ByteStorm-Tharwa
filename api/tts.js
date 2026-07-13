// ثَروة — voice replies via Gemini TTS (natural Arabic voice).
// Streaming mode: audio chunks are forwarded as NDJSON lines while Gemini is
// still generating, so playback starts on the first chunk (~1s) instead of
// waiting for the full clip. Non-stream JSON mode kept as a fallback.
const MODELS = [
  process.env.GEMINI_TTS_MODEL,
  "gemini-2.5-flash-preview-tts"
].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

const VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

const HITS = new Map();
function limited(ip) {
  // generous: the whole venue (judges scanning the QR + presenter) shares one NAT IP
  const now = Date.now(), win = 60000, max = 60;
  const arr = (HITS.get(ip) || []).filter((t) => now - t < win);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > max;
}

// same sentence never generated twice per instance — demo commands repeat,
// so those replies become instant
const CACHE = new Map();
function cachePut(k, v) {
  if (CACHE.size >= 50) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(k, v);
}

// optional fast path — only if a dedicated Cloud TTS key is configured
async function cloudTTS(text, key) {
  const voices = [process.env.CLOUD_TTS_VOICE, "ar-XA-Chirp3-HD-Charon", "ar-XA-Wavenet-B"].filter(Boolean);
  for (const name of voices) {
    try {
      const r = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + encodeURIComponent(key), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "ar-XA", name },
          audioConfig: { audioEncoding: "MP3", speakingRate: 1.05 }
        })
      });
      const data = await r.json();
      if (data.audioContent) return data.audioContent;
      const code = Number(data.error && data.error.code) || 0;
      if (code !== 400 && code !== 404) return null;
    } catch (e) { return null; }
  }
  return null;
}

function geminiPayload(text) {
  return JSON.stringify({
    contents: [{ parts: [{ text: "اقرأ بلهجة سعودية ودّية وواضحة:\n" + text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } }
    }
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method === "GET") { res.status(204).end(); return; } // warm-up ping
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

  const wantStream = !!body.stream;
  function sendOne(out) {
    if (wantStream) {
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
      res.write(JSON.stringify(out) + "\n");
      res.end();
    } else {
      res.status(200).json(out);
    }
  }

  const hit = CACHE.get(text);
  if (hit) { sendOne(hit); return; }

  // dedicated Cloud TTS key (if ever configured) → fastest single-shot path
  if (process.env.GOOGLE_TTS_KEY) {
    const mp3 = await cloudTTS(text, process.env.GOOGLE_TTS_KEY);
    if (mp3) {
      const out = { a: mp3, m: "mp3", src: "cloud" };
      cachePut(text, out);
      sendOne(out);
      return;
    }
  }

  try {
    // ---- streaming path: forward Gemini audio chunks as they arrive ----
    if (wantStream) {
      for (const model of MODELS) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
          body: geminiPayload(text)
        });
        if (!r.ok || !r.body) continue;
        res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        let buf = "", rate = 24000, wrote = false;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) > -1) {
            const line = buf.slice(0, i).trim();
            buf = buf.slice(i + 1);
            if (!line.startsWith("data:")) continue;
            const js = line.slice(5).trim();
            if (!js || js === "[DONE]") continue;
            let obj; try { obj = JSON.parse(js); } catch (e) { continue; }
            const parts = (obj.candidates && obj.candidates[0] && obj.candidates[0].content && obj.candidates[0].content.parts) || [];
            for (const p of parts) {
              if (p.inlineData && p.inlineData.data) {
                const m = String(p.inlineData.mimeType || "").match(/rate=(\d+)/);
                if (m) rate = Number(m[1]);
                chunks.push(Buffer.from(p.inlineData.data, "base64"));
                res.write(JSON.stringify({ a: p.inlineData.data, r: rate }) + "\n");
                wrote = true;
              }
            }
          }
        }
        if (wrote) cachePut(text, { a: Buffer.concat(chunks).toString("base64"), r: rate, src: "gemini" });
        res.end();
        return;
      }
      // whole chain failed before headers were sent
      res.status(200).json({ error: "الصوت غير متاح مؤقتاً." });
      return;
    }

    // ---- non-stream fallback path ----
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const model of MODELS) {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
          body: geminiPayload(text)
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
          const out = { a: part.inlineData.data, r: m ? Number(m[1]) : 24000, src: "gemini" };
          cachePut(text, out);
          res.status(200).json(out);
          return;
        }
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
    res.status(200).json({ error: "الصوت غير متاح مؤقتاً." });
  } catch (err) {
    try { res.status(200).json({ error: "تعذّر توليد الصوت." }); } catch (e) { try { res.end(); } catch (e2) {} }
  }
}
