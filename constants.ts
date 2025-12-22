import { PolaroidStyle, StyleConfig } from './types';

export const POLAROID_WIDTH = 1080;
export const POLAROID_HEIGHT = 1440; // 3:4 Aspect Ratio for final export
export const DISPLAY_RATIO = 3 / 4;

export const STYLES: Record<PolaroidStyle, StyleConfig> = {
  [PolaroidStyle.MINIMALIST]: {
    id: PolaroidStyle.MINIMALIST,
    label: "文青极简",
    fontFamily: "'Noto Serif SC', serif",
    textColor: "#262626",
    paperColor: "#ffffff",
    filter: "contrast(1.05) saturate(0.8) brightness(1.02)",
    description: "Simple, clean, and poetic."
  },
  [PolaroidStyle.RETRO_80S]: {
    id: PolaroidStyle.RETRO_80S,
    label: "1980s 复古",
    fontFamily: "'ZCOOL XiaoWei', serif",
    textColor: "#a13d2d", // Faded reddish
    paperColor: "#fdfbf7", // Slight yellowing
    // Stronger retro effect: high contrast, warm sepia, slight blur for glow
    filter: "sepia(0.4) contrast(1.25) saturate(1.4) hue-rotate(-15deg) brightness(0.9)",
    description: "High contrast, warm nostalgic tones."
  },
  [PolaroidStyle.TRAVEL]: {
    id: PolaroidStyle.TRAVEL,
    label: "旅行手帐",
    fontFamily: "'Caveat', cursive", // Handwriting
    textColor: "#1f2937",
    paperColor: "#f3f4f6", // Textured look simulated by color
    filter: "brightness(1.1) saturate(1.3) contrast(1.1)",
    description: "Handwritten memories of the journey."
  },
  [PolaroidStyle.SWEET]: {
    id: PolaroidStyle.SWEET,
    label: "日系轻甜",
    fontFamily: "'Long Cang', cursive",
    textColor: "#ec4899", // Pinkish
    paperColor: "#fff0f5", // Lavender blush
    // Soft, bright, low contrast
    filter: "brightness(1.15) saturate(1.1) contrast(0.95) blur(0.2px)",
    description: "Soft, pastel, and airy."
  }
};