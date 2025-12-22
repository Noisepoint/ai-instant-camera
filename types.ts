export enum PolaroidStyle {
  MINIMALIST = 'MINIMALIST', // 文青极简
  RETRO_80S = 'RETRO_80S',   // 1980s 复古
  TRAVEL = 'TRAVEL',         // 旅行手帐
  SWEET = 'SWEET'            // 日系轻甜
}

export interface PolaroidData {
  id: string;
  originalImage: string; // Base64 or Blob URL
  style: PolaroidStyle;
  generatedText: string;
  createdAt: number;
}

export interface StyleConfig {
  id: PolaroidStyle;
  label: string;
  fontFamily: string;
  textColor: string;
  paperColor: string; // Background of the polaroid
  textureOverlay?: string; // CSS class for texture
  filter: string; // CSS filter for the image
  description: string;
}

export type AppState = 'IDLE' | 'DEVELOPING' | 'EDITING' | 'GALLERY';
