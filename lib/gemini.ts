const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
export type Content = { role: "user" | "model"; parts: Part[] };
export type FunctionDecl = { name: string; description: string; parameters: Record<string, unknown> };

/** A model that just timed out is skipped for a while, so an agent with several turns does not wait on it every time. */
const SLOW_PAUSE_MS = 5 * 60_000;
const slowUntil = new Map<string, number>();

export async function gemini(body: {
  contents: Content[];
  system?: string;
  tools?: FunctionDecl[];
  json?: Record<string, unknown>;
}): Promise<Part[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  // A slow, busy, retired or out-of-quota model falls through to the next one, so a demo never stalls on one model.
  const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-flash-lite-latest"];
  let last = "";
  const usable = [...new Set(models)].filter((m, i, all) => i === all.length - 1 || !(slowUntil.get(m)! > Date.now()));
  for (const model of usable) {
    let res: Response;
    try {
      res = await call(model, key, body);
    } catch (e) {
      slowUntil.set(model, Date.now() + SLOW_PAUSE_MS);
      last = `Gemini ${model}: ${e instanceof Error ? e.name : "failed"}`;
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts ?? [];
    }
    last = `Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (res.status === 429) slowUntil.set(model, Date.now() + 60_000);
    if (![404, 429].includes(res.status) && res.status < 500) break;
  }
  throw new Error(last);
}

function call(model: string, key: string, body: Parameters<typeof gemini>[0]) {
  return fetch(`${BASE}/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: body.contents,
      ...(body.system && { systemInstruction: { parts: [{ text: body.system }] } }),
      ...(body.tools && { tools: [{ functionDeclarations: body.tools }] }),
      generationConfig: {
        temperature: 0,
        ...(body.json && { responseMimeType: "application/json", responseSchema: body.json }),
      },
    }),
    signal: AbortSignal.timeout(12_000),
  });
}
