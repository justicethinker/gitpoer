// ── AI utility — Gemini 2.5 Flash ───────────

// Reads key from localStorage first, then falls back to environment variable
function getKey() {
  const localKey = localStorage.getItem('gg_api_key');
  if (localKey && localKey.trim().length > 0) return localKey.trim();
  return import.meta.env.VITE_GEMINI_API_KEY || '';
}

export async function callAI(messages, system, maxTokens = 2500) {
  const key = getKey();
  if (!key) throw new Error('AI API key not configured. Add your Gemini key in Settings or set VITE_GEMINI_API_KEY in .env');

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;

  // Map messages to Gemini format
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    }
  };

  if (system) {
    payload.systemInstruction = {
      role: 'user',
      parts: [{ text: system }]
    };
  }

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error('AI rate limit hit. Wait a moment and try again.');
    throw new Error(err?.error?.message || `AI request failed (${res.status})`);
  }

  const data = await res.json();
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response from AI');
  }

  return data.candidates[0].content?.parts?.[0]?.text || '';
}

export async function callAIJSON(messages, system, maxTokens = 2000) {
  const raw = await callAI(messages, system, maxTokens);
  // Try to extract JSON from the response — handles cases where Gemini adds prose
  const jsonMatch = raw.match(/```json\s*([\s\S]+?)\s*```/) ||
                    raw.match(/```\s*([\s\S]+?)\s*```/) ||
                    raw.match(/(\{[\s\S]+\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : raw;
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Last resort: try to parse the raw response
    try { return JSON.parse(raw); } catch { return null; }
  }
}
