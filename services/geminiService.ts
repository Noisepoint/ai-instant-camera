import { PolaroidStyle } from "../types";

// A rich, diverse library of phrases to ensure variety even if API fails
const LOCAL_PHRASES = [
  "偷得浮生半日闲。", "追风筝的人。", "白日梦游。", "橘子汽水味。", "私藏的夏天。", 
  "云端漫步。", "时间暂停。", "追光者。", "温柔且热烈。", "好事发生。", 
  "自由灵魂。", "落日弥漫。", "限定记忆。", "贩卖晚霞。", "生活碎片。", 
  "万物可爱。", "恰似少年。", "心动时刻。", "风的形状。", "无尽的夏。",
  "保持热爱。", "山海皆可平。", "浪漫不死。", "此间少年。", "星河入梦。",
  "我在人间凑数。", "野生艺术家。", "快乐崇拜。", "人间烟火气。", "知足且上进。",
  "正在输入中...", "未完待续。", "独家记忆。", "我在未来等你。", "去有风的地方。",
  "拒绝焦虑。", "随便长长。", "好运正在派送。", "按时长大。", "仅对自己可见。",
  "像风一样自由。", "眼里有光。", "心中有爱。", "春日来信。", "秋日私语。"
];

const getRandomLocalPhrase = () => {
  return LOCAL_PHRASES[Math.floor(Math.random() * LOCAL_PHRASES.length)];
};

export const generatePolaroidText = async (style: PolaroidStyle, imageBase64?: string): Promise<string> => {
  let styleInstruction = "";
  switch (style) {
    case PolaroidStyle.MINIMALIST:
      styleInstruction = "Style: Minimalist, Zen, Haiku. Tone: Quiet, observant, deep. Use periods.";
      break;
    case PolaroidStyle.RETRO_80S:
      styleInstruction = "Style: 80s Hong Kong Cinema, Wong Kar-wai. Tone: Melancholic, passionate. Use commas or ellipses.";
      break;
    case PolaroidStyle.TRAVEL:
      styleInstruction = "Style: Adventure log. Tone: Free, spirited. Use exclamations subtly.";
      break;
    case PolaroidStyle.SWEET:
      styleInstruction = "Style: Soft, cute. Tone: Sweet, playful. Use tilde ~ or hearts.";
      break;
  }

  // Use timestamp to force cache busting
  const timestamp = Date.now();

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
    const response = await fetch("/api/generate-polaroid-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        style,
        imageBase64,
        timestamp,
      }),
    });

    if (!response.ok) {
      console.error("Gemini API proxy error:", await response.text());
      return getRandomLocalPhrase();
    }

    const data = (await response.json()) as { text?: string };
    let text = data.text?.trim();
    
    // Fallback if response is empty
    if (!text) return getRandomLocalPhrase();

    // Clean up only bad formatting, keep punctuation
    text = text.replace(/["'《》]/g, "").replace(/\n/g, "");
    
    // Validation: Enforce minimum length of 2
    if (text.length < 2) return getRandomLocalPhrase();

    if (text.length > 15) text = text.substring(0, 15);
    
    return text;

  } catch (error) {
    console.error("Gemini API Error (using fallback):", error);
    return getRandomLocalPhrase();
  }
};