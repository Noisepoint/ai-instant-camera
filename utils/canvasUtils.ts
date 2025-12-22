import { PolaroidData, PolaroidStyle } from "../types";
import { STYLES, POLAROID_WIDTH, POLAROID_HEIGHT } from "../constants";

// Helper to load image
const loadImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
};

/**
 * Draws a single Polaroid to a canvas.
 */
export const drawPolaroidToCanvas = async (
  data: PolaroidData, 
  scale = 1
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = POLAROID_WIDTH * scale;
  canvas.height = POLAROID_HEIGHT * scale;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("Could not get canvas context");

  const styleConfig = STYLES[data.style];

  // 1. Draw Paper Background with "Thickness" Gradient
  const paperGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  paperGradient.addColorStop(0, styleConfig.paperColor);
  paperGradient.addColorStop(1, "#e5e5e5"); 
  ctx.fillStyle = paperGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Add Paper Grain/Texture (Optimized to be subtle)
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(0,0,0,0.03)"; // Slightly less opaque
  // Reduced count for performance, slightly larger grain
  for (let i = 0; i < 4000 * scale; i++) {
     const x = Math.random() * canvas.width;
     const y = Math.random() * canvas.height;
     const s = Math.random() * 2.5 * scale;
     ctx.fillRect(x, y, s, s);
  }
  ctx.restore();

  // --- 3D Bevel Effect ---
  ctx.save();
  ctx.lineWidth = 2 * scale;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
  ctx.beginPath();
  ctx.moveTo(canvas.width, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, canvas.height);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.1)"; // Softer shadow
  ctx.beginPath();
  ctx.moveTo(canvas.width, 0);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.stroke();
  ctx.restore();

  // 2. Image Area Dimensions
  const sideMargin = 80 * scale; 
  const topMargin = 80 * scale;
  const bottomSpace = 380 * scale;
  
  const imgWidth = canvas.width - (sideMargin * 2);
  const imgHeight = canvas.height - topMargin - bottomSpace;

  // Placeholder
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);

  try {
    const img = await loadImage(data.originalImage);
    
    // Crop Logic
    const sourceAspect = img.width / img.height;
    const targetAspect = imgWidth / imgHeight;
    
    let sx, sy, sWidth, sHeight;

    if (sourceAspect > targetAspect) {
      sHeight = img.height;
      sWidth = img.height * targetAspect;
      sx = (img.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = img.width;
      sHeight = img.width / targetAspect;
      sx = 0;
      sy = (img.height - sHeight) / 2;
    }

    ctx.save();
    ctx.filter = styleConfig.filter; 
    ctx.drawImage(img, sx, sy, sWidth, sHeight, sideMargin, topMargin, imgWidth, imgHeight);
    
    // Style Specific Effects (Light Leaks & Gradients)
    if (data.style === PolaroidStyle.RETRO_80S) {
        // Heavy vignetting
        const gradient = ctx.createRadialGradient(
            sideMargin + imgWidth/2, topMargin + imgHeight/2, imgWidth * 0.4,
            sideMargin + imgWidth/2, topMargin + imgHeight/2, imgWidth * 0.9
        );
        gradient.addColorStop(0, "rgba(255,100,0,0)"); 
        gradient.addColorStop(1, "rgba(0,0,0,0.4)");   
        ctx.fillStyle = gradient;
        ctx.globalCompositeOperation = "multiply";
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);
        
        // Scanlines
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        for(let y = topMargin; y < topMargin + imgHeight; y += 4 * scale) {
           ctx.fillRect(sideMargin, y, imgWidth, 1 * scale);
        }

        // Random Orange Light Leak (simulating camera defect)
        ctx.globalCompositeOperation = "screen";
        const leakX = Math.random() * imgWidth;
        const leakY = topMargin + imgHeight;
        const leakSize = imgWidth * (0.5 + Math.random() * 0.5);
        const leakGrad = ctx.createRadialGradient(sideMargin + leakX, leakY, 0, sideMargin + leakX, leakY, leakSize);
        leakGrad.addColorStop(0, "rgba(255, 140, 50, 0.5)");
        leakGrad.addColorStop(1, "rgba(255, 140, 50, 0)");
        ctx.fillStyle = leakGrad;
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);

    } else if (data.style === PolaroidStyle.SWEET) {
        // Soft pink wash
        ctx.fillStyle = "rgba(255, 192, 203, 0.1)";
        ctx.globalCompositeOperation = "overlay";
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);

        // Soft white corner bloom
        const bloomGrad = ctx.createRadialGradient(
           sideMargin, topMargin, 0,
           sideMargin, topMargin, imgWidth * 0.6
        );
        bloomGrad.addColorStop(0, "rgba(255,255,255,0.3)");
        bloomGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = bloomGrad;
        ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);
    } else {
        // Standard slight depth gradient
        const depthGrad = ctx.createLinearGradient(sideMargin, topMargin, sideMargin, topMargin + (30*scale));
        depthGrad.addColorStop(0, "rgba(0,0,0,0.2)");
        depthGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "multiply"; // Ensure this darkens
        ctx.fillStyle = depthGrad;
        ctx.fillRect(sideMargin, topMargin, imgWidth, 30*scale);
    }
    
    // Gloss
    const glossGrad = ctx.createLinearGradient(sideMargin, topMargin, sideMargin + imgWidth, topMargin + imgHeight);
    glossGrad.addColorStop(0, "rgba(255,255,255,0.08)");
    glossGrad.addColorStop(0.5, "rgba(255,255,255,0)");
    glossGrad.addColorStop(1, "rgba(255,255,255,0.08)");
    ctx.fillStyle = glossGrad;
    ctx.globalCompositeOperation = "screen";
    ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);
    ctx.restore();

    // Date Timestamp
    const date = new Date(data.createdAt);
    const yy = date.getFullYear().toString().slice(-2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const dateStr = `'${yy} ${mm} ${dd}`;
    
    ctx.save();
    ctx.font = `bold ${32 * scale}px 'VT323', monospace`;
    ctx.fillStyle = "#ff7744"; 
    ctx.shadowColor = "#ff3300";
    ctx.shadowBlur = 4 * scale;
    ctx.textAlign = "right";
    ctx.fillText(dateStr, sideMargin + imgWidth - (20 * scale), topMargin + imgHeight - (20 * scale));
    ctx.restore();

  } catch (e) {
    console.error("Failed to load image", e);
    ctx.fillStyle = "#333";
    ctx.fillRect(sideMargin, topMargin, imgWidth, imgHeight);
  }

  // Inner Cutout
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5 * scale;
  ctx.strokeRect(sideMargin, topMargin, imgWidth, imgHeight);
  ctx.restore();

  // 3. Draw Text (Adjusted Layout)
  ctx.fillStyle = styleConfig.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Smaller font size
  const fontSize = 46 * scale;
  ctx.font = `${fontSize}px ${styleConfig.fontFamily.replace(/'/g, '"')}, sans-serif`;

  const textX = canvas.width / 2;
  // Position text higher up (35% into the bottom space)
  const textY = topMargin + imgHeight + (bottomSpace * 0.35); 
  
  ctx.fillText(data.generatedText, textX, textY);

  // 4. Premium Visual Elements (Divider & Metadata)
  const elementColor = "rgba(0,0,0,0.3)";
  const metaY = topMargin + imgHeight + (bottomSpace * 0.7);

  // A minimal divider line
  ctx.beginPath();
  ctx.moveTo(textX - (20 * scale), metaY);
  ctx.lineTo(textX + (20 * scale), metaY);
  ctx.strokeStyle = elementColor;
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // Metadata Text (Very small, sans-serif)
  ctx.font = `normal ${14 * scale}px 'Arial', sans-serif`;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.letterSpacing = "2px";
  
  // Choose metadata based on style
  let metaText = "AI FILM • ISO 100";
  if (data.style === PolaroidStyle.RETRO_80S) metaText = "COLOR 600 • HK";
  if (data.style === PolaroidStyle.MINIMALIST) metaText = "B&W TYPE • FINE";
  if (data.style === PolaroidStyle.SWEET) metaText = "SOFT FOCUS • JP";
  if (data.style === PolaroidStyle.TRAVEL) metaText = "DAYLIGHT • AUTO";

  ctx.fillText(metaText, textX, metaY + (25 * scale));

  return canvas;
};

/**
 * Generates a poster grid
 */
export const generatePoster = async (items: PolaroidData[], title: string = "My Polaroids"): Promise<string> => {
  const count = items.length;
  
  let cols = 1;
  let rows = 3;
  if (count <= 3) { cols = 1; rows = count; }
  else if (count <= 6) { cols = 2; rows = Math.ceil(count/2); }
  else { cols = 3; rows = Math.ceil(count/3); }
  
  if (count <= 3) rows = 3;

  const gap = 60;
  const paddingX = 120;
  const paddingY = 160; 
  const titleHeight = 200;
  const footerHeight = 120;
  
  const scale = 0.45; 
  const itemW = POLAROID_WIDTH * scale;
  const itemH = POLAROID_HEIGHT * scale;
  
  const posterWidth = (itemW * cols) + (gap * (cols - 1)) + (paddingX * 2);
  const posterHeight = titleHeight + (itemH * rows) + (gap * (rows - 1)) + paddingY + footerHeight;
  
  const canvas = document.createElement("canvas");
  canvas.width = posterWidth;
  canvas.height = posterHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Background - CHANGED: Light warm gray instead of black
  ctx.fillStyle = "#f3f3f0"; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Noise - CHANGED: Dark noise instead of white
  ctx.fillStyle = "rgba(0,0,0,0.03)";
  for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 2, 2);
  }

  // Title - CHANGED: Dark gray
  ctx.fillStyle = "#2c2c2c";
  ctx.font = "bold 90px 'Courier New', monospace"; 
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, canvas.width / 2, paddingY / 2 + 50);
  
  // Date Logic
  const d1 = new Date(items[0].createdAt);
  const d2 = new Date(items[items.length-1].createdAt);
  
  let dateText = `${d1.getFullYear()}.${d1.getMonth()+1}.${d1.getDate()}`;
  if (d1.toDateString() !== d2.toDateString()) {
      dateText += ` - ${d2.getFullYear()}.${d2.getMonth()+1}.${d2.getDate()}`;
  }
  
  // Date Color - CHANGED: Medium gray
  ctx.font = "italic 32px 'Times New Roman', serif";
  ctx.fillStyle = "#666666";
  ctx.fillText(dateText, canvas.width / 2, paddingY + 30);

  // Draw Items
  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    const x = paddingX + (col * (itemW + gap));
    const y = paddingY + titleHeight + (row * (itemH + gap));
    
    const itemCanvas = await drawPolaroidToCanvas(items[i], scale);
    
    // Deep Shadow - Retained but slightly adjusted for light bg
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetX = 15;
    ctx.shadowOffsetY = 25;
    
    const rot = (Math.random() - 0.5) * 0.05; 
    
    ctx.save();
    ctx.translate(x + itemW/2, y + itemH/2);
    ctx.rotate(rot);
    ctx.drawImage(itemCanvas, -itemW/2, -itemH/2);
    ctx.restore();
    
    ctx.shadowColor = "transparent";
  }
  
  // Footer - CHANGED: Light gray
  ctx.fillStyle = "#999999";
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generated by AI Instant Camera", canvas.width / 2, canvas.height - 50);
  
  return canvas.toDataURL("image/png");
};