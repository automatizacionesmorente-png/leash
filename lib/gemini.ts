const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
export type Content = { role: "user" | "model"; parts: Part[] };
export type FunctionDecl = { name: string; description: string; parameters: Record<string, unknown> };

export async function gemini(body: {
  contents: Content[];
  system?: string;
  tools?: FunctionDecl[];
  json?: Record<string, unknown>;
}): Promise<Part[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  // A busy model (503) or a spent free-tier quota (429) falls through to the next one.
  const models = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-2.5-flash", "gemini-flash-lite-latest"];
  let last = "";
  for (const model of [...new Set(models)]) {
    const res = await call(model, key, body);
    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts ?? [];
    }
    last = `Gemini ${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (res.status !== 503 && res.status !== 429) break;
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
    signal: AbortSignal.timeout(25_000),
  });
}
