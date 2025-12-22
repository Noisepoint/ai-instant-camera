<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1iibTxUsdL0yw27wMWNldpOcp3dkKpeTz

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. **(推荐，和线上一致 / Key 不暴露到浏览器)**：使用 Vercel Serverless Function 代理 Gemini。
   - 在 Vercel 项目里设置环境变量：`GEMINI_API_KEY=你的key`
   - 本地如果需要完整体验（含 AI 文案），建议使用 Vercel CLI：`vercel dev`
3. Run the app (仅前端；如果不跑 `vercel dev`，AI 文案会自动回退到本地随机短句，不影响 UI/交互):
   `npm run dev`

## Deploy to Vercel（B 方案：Key 只在服务端）

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `GEMINI_API_KEY`: your Gemini API key

部署后前端会调用 `/api/generate-polaroid-text` 生成文案；若 API 失败会回退到本地短句库，保证交互/视觉不受影响。
