import { GoogleGenAI } from "@google/genai";

type PolaroidStyle = "MINIMALIST" | "RETRO_80S" | "TRAVEL" | "SWEET";

type RequestBody = {
  style: PolaroidStyle;
  imageBase64?: string;
  timestamp?: number;
};

const ALLOWED_STYLES: Set<PolaroidStyle> = new Set([
  "MINIMALIST",
  "RETRO_80S",
  "TRAVEL",
  "SWEET",
]);

function buildStyleInstruction(style: PolaroidStyle): string {
  switch (style) {
    case "MINIMALIST":
      return "Style: Minimalist, Zen, Haiku. Tone: Quiet, observant, deep. Use periods.";
    case "RETRO_80S":
      return "Style: 80s Hong Kong Cinema, Wong Kar-wai. Tone: Melancholic, passionate. Use commas or ellipses.";
    case "TRAVEL":
      return "Style: Adventure log. Tone: Free, spirited. Use exclamations subtly.";
    case "SWEET":
      return "Style: Soft, cute. Tone: Sweet, playful. Use tilde ~ or hearts.";
  }
}

export default async function handler(req: any, res: any) {
  // CORS (minimal; avoids blocking in some embed/preview contexts)
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Method Not Allowed" }));
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Missing GEMINI_API_KEY" }));
    return;
  }

  let body: RequestBody | undefined;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    body = undefined;
  }

  const style = body?.style;
  const imageBase64 = body?.imageBase64;
  const timestamp = typeof body?.timestamp === "number" ? body.timestamp : Date.now();

  if (!style || !ALLOWED_STYLES.has(style)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Invalid style" }));
    return;
  }

  const styleInstruction = buildStyleInstruction(style);
  const promptText = `
    Task: Write a single, UNIQUE Chinese phrase (4-12 characters) for a Polaroid photo.
    
    Context:
    - ${styleInstruction}
    - Current Time Seed: ${timestamp}
    
    CRITICAL RULES:
    1. INCLUDE PUNCTUATION (periods, commas, etc.) to make it look like a complete thought or poetic sentence.
    2. DO NOT use generic clichés like "记录生活" or "小确幸".
    3. BE CREATIVE. Abstract, emotional, or atmospheric.
    4. MUST BE AT LEAST 2 CHARACTERS LONG. NO SINGLE CHARACTERS.
    5. Return ONLY the text.
  `;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const parts: any[] = [{ text: promptText }];
    if (imageBase64) {
      const base64Data = imageBase64.split(",")[1];
      if (base64Data) {
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        });
      }
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts },
      config: {
        maxOutputTokens: 30,
        temperature: 1.5,
        topP: 0.95,
      },
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ text: response.text?.trim() ?? "" }));
  } catch (error: any) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Gemini API Error",
        message: error?.message ?? String(error),
      }),
    );
  }
}


