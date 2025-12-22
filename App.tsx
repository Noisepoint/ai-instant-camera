import React, { useState, useEffect, useRef } from 'react';
import { Camera, Upload, Download, Grid, Share2, RefreshCw, ChevronLeft, Trash2, X, Maximize2, Loader2, Sparkles, Move, Check, Pencil, Image as ImageIcon, RotateCcw, AlertCircle, AlertTriangle } from 'lucide-react';
import { PolaroidStyle, AppState, PolaroidData } from './types';
import { STYLES } from './constants';
import { generatePolaroidText } from './services/geminiService';
import { drawPolaroidToCanvas, generatePoster } from './utils/canvasUtils';

// --- Utils ---

// Helper to compress images before storage
// 800px width is sufficient for on-screen display and typical polaroid prints
const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'; // Prevent transparency issues
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64Str); // Fallback
      }
    };
    img.onerror = () => resolve(base64Str);
  });
};

// --- IndexedDB Helpers ---
const DB_NAME = 'PolaroidCameraDB';
const STORE_NAME = 'photos';
const DB_VERSION = 1;

const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

const dbAPI = {
  getAll: async (): Promise<PolaroidData[]> => {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("DB Get Error:", e);
      return [];
    }
  },
  add: async (item: PolaroidData): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  delete: async (id: string): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};


// --- Components ---

// 1. High-Fidelity 3D Camera Component
interface ThreeDCameraProps {
  onShutter: () => void;
  isEjecting: boolean;
}

const ThreeDCamera: React.FC<ThreeDCameraProps> = ({ onShutter, isEjecting }) => {
  const [rotate, setRotate] = useState({ x: -5, y: 15 }); // Initial jaunty angle
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation limits (Max 20 degrees)
    const rotateX = ((y - centerY) / centerY) * -20; 
    const rotateY = ((x - centerX) / centerX) * 20; 

    setRotate({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setRotate({ x: -5, y: 15 }); // Return to nice idle pose
  };

  return (
    <div 
      ref={containerRef}
      className="camera-scene cursor-pointer"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => {
        // Allow clicking the body to trigger shutter too, unless clicking specific parts
        if ((e.target as HTMLElement).closest('.shutter-btn')) return;
        onShutter();
      }}
    >
      <div 
        className="camera-body"
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`
        }}
      >
        <div className="face front">
          <div className="flash-unit">
             <div className="flash-bulb"></div>
          </div>
          <div className="viewfinder-front"></div>
          <div className="lens-housing">
            <div className="lens-glass">
              <div className="lens-reflection"></div>
              <div className="lens-reflection-2"></div>
            </div>
          </div>
          <div className="rainbow-stripe"></div>
          <button 
            className="shutter-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onShutter();
            }}
            aria-label="Take Photo"
          ></button>
        </div>
        <div className="face back"></div>
        <div className="face right"></div>
        <div className="face left"></div>
        <div className="face top"></div>
        <div className="face bottom">
          <div className="photo-slot"></div>
        </div>
        
        {/* Shadow */}
        <div className="camera-shadow"></div>

        {/* Ejecting Photo Animation */}
        <div className={`ejecting-photo ${isEjecting ? 'active' : ''}`}>
           <div className="ejecting-photo-inner"></div>
        </div>
      </div>
    </div>
  );
};

// 2. Viewfinder Overlay Component
interface ViewfinderProps {
  onClose: () => void;
  onCapture: (imageSrc: string) => void;
  onUploadClick: () => void;
}

const Viewfinder: React.FC<ViewfinderProps> = ({ onClose, onCapture, onUploadClick }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      // Stop previous tracks if any
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: facingMode,
            width: { ideal: 1920 }, // Try for high res
            height: { ideal: 1080 }
          } 
        });
        if (mounted) {
            setStream(mediaStream);
            if (videoRef.current) {
              videoRef.current.srcObject = mediaStream;
            }
            setError(null);
        } else {
            mediaStream.getTracks().forEach(track => track.stop());
        }
      } catch (err) {
        console.error("Camera access denied:", err);
        if (mounted) setError("Unable to access camera. Please allow permission or use upload.");
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    
    // Logic: Keep height, calculate width needed for 3:4 (0.75)
    const targetRatio = 3 / 4;
    
    let cropW, cropH, startX, startY;
    if (videoW / videoH > targetRatio) {
      cropH = videoH;
      cropW = videoH * targetRatio;
      startX = (videoW - cropW) / 2;
      startY = 0;
    } else {
      cropW = videoW;
      cropH = videoW / targetRatio;
      startX = 0;
      startY = (videoH - cropH) / 2;
    }

    canvas.width = cropW;
    canvas.height = cropH;

    // Flip horizontally ONLY if using front-facing camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, cropW, cropH);
    
    // REDUCED QUALITY FOR STORAGE SAFETY (0.95 -> 0.7)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center animate-fade-in-up font-sans">
      {/* Background Video Stream */}
      <div className="absolute inset-0 overflow-hidden">
        {error ? (
          <div className="w-full h-full flex items-center justify-center text-white/50 bg-stone-900">
            {error}
          </div>
        ) : (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className={`w-full h-full object-cover transition-transform duration-500 ${facingMode === 'user' ? 'transform -scale-x-100' : ''}`} 
          />
        )}
      </div>

      {/* Overlay UI (The "Mask") */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
        {/* Top Darken */}
        <div className="flex-1 w-full bg-black/60 backdrop-blur-[2px]"></div>
        
        <div className="flex w-full max-w-[800px]">
           {/* Left Darken */}
           <div className="flex-1 bg-black/60 backdrop-blur-[2px]"></div>
           
           {/* The Clear Viewfinder Frame (3:4 Ratio) */}
           <div className="relative w-full max-w-[400px] aspect-[3/4] border border-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
              {/* Corner Guides - Minimalist */}
              <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-white/90"></div>
              <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-white/90"></div>
              <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-white/90"></div>
              <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-white/90"></div>
              
              {/* Rule of Thirds Grid - Very Subtle */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-10">
                 <div className="border-r border-b border-white"></div>
                 <div className="border-r border-b border-white"></div>
                 <div className="border-b border-white"></div>
                 <div className="border-r border-b border-white"></div>
                 <div className="border-r border-b border-white"></div>
                 <div className="border-b border-white"></div>
                 <div className="border-r border-white"></div>
                 <div className="border-r border-white"></div>
                 <div></div>
              </div>
           </div>

           {/* Right Darken */}
           <div className="flex-1 bg-black/60 backdrop-blur-[2px]"></div>
        </div>

        {/* Bottom Darken */}
        <div className="flex-1 w-full bg-black/60 backdrop-blur-[2px]"></div>
      </div>

      {/* Controls Container */}
      <div className="absolute bottom-0 w-full flex items-center justify-between px-8 pb-10 pt-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-20 max-w-2xl mx-auto left-0 right-0">
         
         {/* Album Button */}
         <div 
           onClick={onUploadClick}
           className="flex flex-col items-center gap-2 group cursor-pointer transition-transform duration-200 active:scale-95"
         >
            <div className="w-14 h-14 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center overflow-hidden transition-all duration-300 group-hover:bg-white/20 group-hover:border-white/40 shadow-lg">
               <ImageIcon size={24} className="text-white opacity-90" />
            </div>
            <span className="text-[10px] text-white/60 font-bold tracking-[0.2em] uppercase drop-shadow-md group-hover:text-white transition-colors">Album</span>
         </div>

         {/* Shutter Button */}
         <div className="relative -top-4 flex flex-col items-center gap-4">
           {/* Camera Switcher (Above shutter) */}
           <button 
             onClick={toggleCamera}
             className="bg-black/30 backdrop-blur-md p-2 rounded-full border border-white/10 text-white/80 hover:bg-black/50 hover:text-white transition-all pointer-events-auto"
           >
             <RotateCcw size={20} />
           </button>

           <button 
             onClick={takePhoto}
             disabled={!!error}
             className="group relative flex items-center justify-center focus:outline-none pointer-events-auto"
           >
             {/* Outer Ring */}
             <div className="w-[84px] h-[84px] rounded-full border-[4px] border-white/90 shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-transform duration-200 group-active:scale-95"></div>
             
             {/* Inner Button */}
             <div className="absolute w-[70px] h-[70px] rounded-full bg-[#E53935] border border-[#B71C1C] flex items-center justify-center shadow-inner transition-colors duration-200 group-hover:bg-[#EF5350]">
                {/* Gloss Reflection */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-black/20 to-white/10 opacity-50 pointer-events-none"></div>
             </div>
           </button>
         </div>

         {/* Close Button */}
         <div 
           onClick={onClose}
           className="flex flex-col items-center gap-2 group cursor-pointer transition-transform duration-200 active:scale-95"
         >
            <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center transition-all duration-300 group-hover:bg-black/50 group-hover:border-white/30">
               <X size={24} className="text-white/80" />
            </div>
            <span className="text-[10px] text-white/40 font-bold tracking-[0.2em] uppercase group-hover:text-white/70 transition-colors">Cancel</span>
         </div>
      </div>
      
      {/* Hidden Canvas for Capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};


const StyleButton: React.FC<{ styleId: PolaroidStyle, isSelected: boolean, onClick: () => void }> = ({ styleId, isSelected, onClick }) => {
  const config = STYLES[styleId];
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-300 transform border flex flex-col items-center gap-1 ${
        isSelected 
          ? 'bg-stone-800 text-white border-stone-800 scale-105 shadow-md' 
          : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50 hover:border-stone-300'
      }`}
    >
      <span className="w-4 h-4 rounded-full border border-black/10 shadow-sm" style={{background: config.paperColor}}></span>
      {config.label}
    </button>
  );
};

// 3D Tilt Wrapper
interface TiltCardProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const TiltCard = ({ children, className = "", style = {} }: TiltCardProps) => {
  const [rotate, setRotate] = useState({ x: 0, y: 0 });
  const [gloss, setGloss] = useState({ x: 50, y: 50, opacity: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate rotation (max 10 degrees)
    const rotateX = ((y - centerY) / centerY) * -6; // Invert Y
    const rotateY = ((x - centerX) / centerX) * 6;

    setRotate({ x: rotateX, y: rotateY });
    
    // Calculate gloss position
    setGloss({ x: (x / rect.width) * 100, y: (y / rect.height) * 100, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 });
    setGloss(prev => ({ ...prev, opacity: 0 }));
  };

  return (
    <div className="perspective-container">
      <div 
        ref={containerRef}
        className={`tilt-card ${className}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `rotateX(${rotate.x}deg) rotateY(${rotate.y}deg)`,
          ...style
        }}
      >
        {children}
        {/* Dynamic Gloss Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none rounded-sm transition-opacity duration-500 z-50 mix-blend-soft-light"
          style={{
            background: `radial-gradient(circle at ${gloss.x}% ${gloss.y}%, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 60%)`,
            opacity: gloss.opacity
          }}
        />
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [appState, setAppState] = useState<AppState>('IDLE');
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentStyle, setCurrentStyle] = useState<PolaroidStyle>(PolaroidStyle.MINIMALIST);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [collection, setCollection] = useState<PolaroidData[]>([]);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [selectedForPoster, setSelectedForPoster] = useState<Set<string>>(new Set());
  const [viewingItem, setViewingItem] = useState<PolaroidData | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // -- NEW: Delete Confirmation State --
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Async saving state
  
  // Developing State
  const [developProgress, setDevelopProgress] = useState(0);
  const [shakeIntensity, setShakeIntensity] = useState(0);
  
  // Animation State
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [isEjecting, setIsEjecting] = useState(false);
  
  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // UX Feedback State
  const [isSaved, setIsSaved] = useState(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  
  // Text Editing State
  const [isEditingText, setIsEditingText] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence: Load (Migration Strategy included)
  useEffect(() => {
    const loadData = async () => {
      try {
        const db = await initDB();
        
        // 1. Check for legacy localStorage data
        // Wrap in try-catch in case access fails completely
        try {
          const localData = localStorage.getItem('polaroid_collection');
          if (localData) {
            try {
              const parsed = JSON.parse(localData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log("Migrating legacy data...", parsed.length);
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                for (const item of parsed) {
                  store.put(item);
                }
                // Wait for transaction to complete conceptually, but localStorage removal is safe
                localStorage.removeItem('polaroid_collection');
              }
            } catch (e) {
              console.error("Migration parse error", e);
            }
          }
        } catch (e) {
           console.error("LocalStorage access error", e);
        }
        
        // 2. Load from DB
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          // Sort by createdAt desc (newest first)
          const items = (request.result as PolaroidData[]).sort((a, b) => b.createdAt - a.createdAt);
          setCollection(items);
          setIsLoaded(true);
        };
        request.onerror = () => {
          console.error("Failed to load from DB");
          setIsLoaded(true);
        }
      } catch (e) {
        console.error("DB Error", e);
        setIsLoaded(true); // Load anyway so app works (empty)
      }
    };
    loadData();
  }, []);

  // Sync saved status with collection state
  useEffect(() => {
    if (isSaved && lastSavedId) {
      const stillExists = collection.some(item => item.id === lastSavedId);
      if (!stillExists) {
        setIsSaved(false);
        setLastSavedId(null);
      }
    }
  }, [collection, isSaved, lastSavedId]);

  // --- Shake Logic ---
  useEffect(() => {
    let lastX = 0;
    let lastY = 0;
    let speed = 0;
    let timer: number;

    const handleShake = (e: MouseEvent) => {
      if (appState !== 'DEVELOPING') return;

      const dx = Math.abs(e.clientX - lastX);
      const dy = Math.abs(e.clientY - lastY);
      speed = dx + dy;
      
      lastX = e.clientX;
      lastY = e.clientY;

      if (speed > 30) {
        setShakeIntensity(s => Math.min(s + 10, 100));
        setDevelopProgress(prev => Math.min(prev + 0.8, 100));
      } else {
        setShakeIntensity(s => Math.max(s - 5, 0));
      }
    };

    if (appState === 'DEVELOPING') {
      window.addEventListener('mousemove', handleShake);
      timer = window.setInterval(() => {
        setDevelopProgress(prev => {
          if (prev >= 100) return 100;
          return prev + 0.4; // Slightly faster base speed to avoid "stuck" feeling
        });
      }, 50);
    }

    return () => {
      window.removeEventListener('mousemove', handleShake);
      clearInterval(timer);
    };
  }, [appState]);

  useEffect(() => {
    if (developProgress >= 100 && appState === 'DEVELOPING') {
       if (!isGeneratingText) {
         setAppState('EDITING');
       }
    }
  }, [developProgress, appState, isGeneratingText]);


  // Triggered when user clicks camera body or shutter
  const handleShutterClick = () => {
    setIsCameraOpen(true);
  };

  // Processing logic for BOTH File Upload and Camera Capture
  const handlePhotoInput = async (rawBase64: string) => {
    // 0. Close camera if open
    setIsCameraOpen(false);

    // 0.5 Compress Image immediately
    const imgBase64 = await compressImage(rawBase64);

    // 1. Flash
    setIsFlashActive(true);
    setTimeout(() => setIsFlashActive(false), 100);
    
    // 2. Eject Animation (wait for flash)
    setIsEjecting(true);
    setCurrentImage(imgBase64);
    setDevelopProgress(0);
    startDevelopingProcess(imgBase64);
    
    // 3. Wait for Ejection to finish before changing state
    await new Promise(r => setTimeout(r, 1200));
    
    // 4. Go to developing
    setAppState('DEVELOPING');
    setIsEjecting(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        handlePhotoInput(result); // Pass to common handler which compresses
      };
      reader.readAsDataURL(file);
    }
  };

  const startDevelopingProcess = async (imgBase64: string) => {
    setIsSaved(false);
    setLastSavedId(null);
    setIsEditingText(false);
    setGeneratedText("Thinking...");
    setIsGeneratingText(true);
    try {
      const text = await generatePolaroidText(currentStyle, imgBase64);
      setGeneratedText(text);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingText(false);
    }
  };

  const handleStyleChange = async (newStyle: PolaroidStyle) => {
    setCurrentStyle(newStyle);
    setIsSaved(false); // Reset saved status on edit
    setLastSavedId(null);
    if (currentImage) {
      regenerateText(newStyle);
    }
  };
  
  const regenerateText = async (style: PolaroidStyle) => {
    setIsSaved(false); // Reset saved status on edit
    setLastSavedId(null);
    setIsEditingText(false);
    setIsGeneratingText(true);
    await new Promise(r => setTimeout(r, 500)); 
    const newText = await generatePolaroidText(style, currentImage || undefined);
    setGeneratedText(newText);
    setIsGeneratingText(false);
  };

  const addToCollection = async () => {
    if (!currentImage || isSaving) return;
    
    setIsSaving(true);
    
    const newItem: PolaroidData = {
      id: Date.now().toString(),
      originalImage: currentImage,
      style: currentStyle,
      generatedText: generatedText,
      createdAt: Date.now()
    };

    try {
      // Save to IndexedDB first
      await dbAPI.add(newItem);
      
      // Update state
      setCollection(prev => [newItem, ...prev]);
      
      // Elegant Feedback
      setIsSaved(true);
      setLastSavedId(newItem.id);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      setStorageError(false);
    } catch (e) {
      console.error("Save failed", e);
      setStorageError(true);
    } finally {
      setIsSaving(false);
    }
  };

  // -- NEW DELETE LOGIC --
  const requestDelete = (id: string) => {
    setItemToDelete(id);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    const id = itemToDelete;
    
    try {
      await dbAPI.delete(id);
      setCollection(prev => prev.filter(c => c.id !== id));
      setSelectedForPoster(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        return next;
      });
      if (viewingItem?.id === id) setViewingItem(null);
      setItemToDelete(null);
      setStorageError(false);
    } catch (e) {
      console.error("Delete failed", e);
      alert("Failed to delete item from database");
    }
  };

  const downloadItem = async (data: PolaroidData) => {
     const canvas = await drawPolaroidToCanvas(data, 2); 
     const link = document.createElement('a');
     link.download = `polaroid_${data.id}.png`;
     link.href = canvas.toDataURL('image/png');
     link.click();
  };

  const downloadCurrentPolaroid = async () => {
    if (!currentImage) return;
    const item: PolaroidData = {
      id: "temp",
      originalImage: currentImage,
      style: currentStyle,
      generatedText: generatedText,
      createdAt: Date.now()
    };
    await downloadItem(item);
  };

  const generateAndDownloadPoster = async () => {
    if (selectedForPoster.size < 3) {
      alert("Please select at least 3 photos for the poster.");
      return;
    }
    const items = collection.filter(item => selectedForPoster.has(item.id));
    const dataUrl = await generatePoster(items);
    setPosterUrl(dataUrl);
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedForPoster);
    if (newSet.has(id)) newSet.delete(id);
    else if (newSet.size < 9) newSet.add(id);
    setSelectedForPoster(newSet);
  };

  // --- Render Functions ---

  const renderIdle = () => (
    <div className="flex flex-col items-center justify-center min-h-[85vh] px-4 animate-fade-in-up relative">
      <div className="mt-8 mb-12">
        {/* NEW 3D Camera */}
        <ThreeDCamera onShutter={handleShutterClick} isEjecting={isEjecting} />
      </div>

      <div className="text-center z-10 pointer-events-none">
        <h1 className="text-3xl font-bold text-stone-700 mb-2 font-serif">AI Instant Camera</h1>
        <p className="text-stone-500 mb-6 text-sm">Press the red button or click the camera to start.</p>
        
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileUpload} 
          accept="image/png, image/jpeg" 
          className="hidden pointer-events-auto" 
        />
      </div>
      
      <div className="mt-8 flex gap-4 text-stone-400 text-xs tracking-wider uppercase opacity-70">
        <span>JPG/PNG</span>
        <span>•</span>
        <span>AI Poetry</span>
        <span>•</span>
        <span>Realistic Film</span>
      </div>
      
      {collection.length > 0 && (
         <button onClick={() => setAppState('GALLERY')} className="mt-8 flex items-center gap-2 text-stone-600 font-medium hover:text-orange-600 transition pointer-events-auto">
           <Grid size={18} /> View Collection ({collection.length})
         </button>
      )}
    </div>
  );

  const renderDeveloping = () => {
    const brightness = 5 - (developProgress / 100) * 4;
    const contrast = 0.2 + (developProgress / 100) * 0.8;
    const grayscale = 1 - (developProgress / 100);
    const opacity = 0.2 + (developProgress / 100) * 0.8;

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-stone-900 relative overflow-hidden cursor-move">
        <div className="absolute top-0 w-full h-32 bg-stone-200 shadow-xl z-20 rounded-b-3xl flex items-end justify-center pb-2 border-b-8 border-stone-300">
             <div className="w-64 h-2 bg-black opacity-20 rounded-full"></div>
        </div>

        <div className={`fixed top-40 z-30 transition-opacity duration-300 ${shakeIntensity > 20 ? 'opacity-0' : 'opacity-100'}`}>
           <div className="bg-black/50 backdrop-blur text-white px-6 py-2 rounded-full flex items-center gap-2 animate-bounce">
              <Move size={16} /> 
              <span className="font-bold tracking-widest text-sm">SHAKE YOUR MOUSE TO DEVELOP</span>
           </div>
        </div>
        
        <div className={`fixed top-40 z-30 transition-opacity duration-100 ${shakeIntensity > 20 ? 'opacity-100' : 'opacity-0'}`}>
           <span className="text-orange-500 font-black text-2xl tracking-[0.5em] animate-pulse">FASTER!</span>
        </div>

        <div 
          className="relative bg-white p-4 pb-12 shadow-2xl z-10 w-[300px] h-[400px] flex flex-col mt-32 transform transition-transform duration-500 ease-out animate-[slideDown_0.5s_ease-out]"
        >
          <div className="bg-stone-100 w-full h-full relative overflow-hidden">
             {currentImage && (
               <img 
                 src={currentImage} 
                 className="w-full h-full object-cover transition-all duration-100" 
                 style={{ 
                   filter: `brightness(${brightness}) contrast(${contrast}) grayscale(${grayscale})`,
                   opacity: opacity
                 }}
                 alt="Developing" 
               />
             )}
          </div>
          <div className="h-16 flex items-center justify-center pt-4">
             <div className="w-3/4 h-1 bg-stone-200 rounded overflow-hidden">
               <div className="h-full bg-orange-500 transition-all duration-100" style={{ width: `${developProgress}%` }}></div>
             </div>
          </div>
        </div>

        <div className="absolute bottom-12 text-white/50 font-mono text-sm flex items-center gap-2">
           <span className="tabular-nums">{Math.floor(developProgress)}%</span> Developed
        </div>
      </div>
    );
  };

  const renderEditing = () => {
    const activeConfig = STYLES[currentStyle];
    const dateStr = `'${new Date().getFullYear().toString().slice(-2)} ${(new Date().getMonth()+1).toString().padStart(2,'0')} ${new Date().getDate().toString().padStart(2,'0')}`;
    
    let metaText = "AI FILM • ISO 100";
    if (currentStyle === PolaroidStyle.RETRO_80S) metaText = "COLOR 600 • HK";
    if (currentStyle === PolaroidStyle.MINIMALIST) metaText = "B&W TYPE • FINE";
    if (currentStyle === PolaroidStyle.SWEET) metaText = "SOFT FOCUS • JP";
    if (currentStyle === PolaroidStyle.TRAVEL) metaText = "DAYLIGHT • AUTO";

    return (
      <div className="min-h-screen flex flex-col bg-stone-100">
        
        {/* Storage Error Warning */}
        {storageError && (
          <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-up w-[90%] max-w-md">
            <div className="bg-red-50 text-red-800 px-4 py-3 rounded-xl shadow-lg border border-red-200 flex items-start gap-3">
              <AlertTriangle className="shrink-0 mt-0.5" size={18} />
              <div>
                <p className="font-bold text-sm">Saving Error</p>
                <p className="text-xs mt-1">Unable to save to database. Please check your storage settings.</p>
              </div>
              <button onClick={() => setStorageError(false)} className="text-red-400 hover:text-red-700"><X size={16}/></button>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in-up">
              <div className="bg-stone-800 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-stone-700/50 backdrop-blur-md">
                  <Check size={18} className="text-green-400" />
                  <span className="font-medium tracking-wide text-sm">Added to Collection</span>
              </div>
          </div>
        )}

        <div className="w-full bg-white/80 backdrop-blur-md shadow-sm px-4 py-3 flex justify-between items-center z-10 sticky top-0 border-b border-stone-200">
           <button onClick={() => {setAppState('IDLE'); setCurrentImage(null);}} className="p-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors">
             <ChevronLeft size={20} />
           </button>
           <span className="font-serif font-bold text-stone-700 text-lg tracking-wide">The Studio</span>
           <button onClick={() => setAppState('GALLERY')} className="p-2 rounded-full hover:bg-stone-100 text-stone-500 transition-colors">
             <Grid size={20} />
           </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row max-w-6xl mx-auto w-full p-6 gap-10 justify-center items-start animate-fade-in-up">
          
          <div className="w-full md:w-auto flex-shrink-0 flex justify-center sticky md:top-24 z-20">
             <TiltCard>
               <div 
                className="relative transition-all duration-500 ease-in-out transform"
                style={{ 
                  width: '340px', 
                  height: '453px', 
                  backgroundColor: activeConfig.paperColor,
                  padding: '24px 24px 0 24px', 
                  boxShadow: `
                    0 2px 5px rgba(0,0,0,0.05), 
                    0 25px 50px -10px rgba(0,0,0,0.3),
                    inset 0 -2px 10px rgba(0,0,0,0.02)
                  `,
                  borderRadius: '2px',
                }}
              >
                <div className="absolute inset-0 paper-texture opacity-30 pointer-events-none z-10 mix-blend-multiply"></div>
                
                 <div className="relative w-full aspect-[0.85] overflow-hidden bg-stone-900 ring-1 ring-black/10 shadow-inner">
                    {currentImage && (
                      <img 
                        src={currentImage} 
                        className="w-full h-full object-cover" 
                        style={{ filter: activeConfig.filter }}
                        alt="Polaroid" 
                      />
                    )}
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/10 to-transparent opacity-50"></div>
                    <div className="absolute inset-0 pointer-events-none shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]"></div>

                    <div className="absolute bottom-2 right-2 text-[#ff5533] font-[VT323] text-xl tracking-widest opacity-90 font-bold" style={{textShadow: '0 1px 2px rgba(0,0,0,0.3)'}}>
                      {dateStr}
                    </div>
                 </div>
                 
                 <div className="flex-1 h-[100px] flex flex-col items-center justify-start px-1 relative z-20 mt-4">
                    {isGeneratingText ? (
                      <div className="flex items-center gap-2 text-stone-400 text-sm mt-4">
                        <Loader2 className="animate-spin" size={14} /> Developing Text...
                      </div>
                    ) : (
                      <>
                        {isEditingText ? (
                          <textarea
                            autoFocus
                            value={generatedText}
                            onChange={(e) => {
                                setGeneratedText(e.target.value);
                                setIsSaved(false);
                                setLastSavedId(null);
                            }}
                            onBlur={() => setIsEditingText(false)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                setIsEditingText(false);
                              }
                            }}
                            className="w-full bg-transparent text-center outline-none resize-none overflow-hidden placeholder-stone-300/50"
                            style={{ 
                              fontFamily: activeConfig.fontFamily, 
                              color: activeConfig.textColor,
                              fontSize: '1.25rem', // text-xl
                              lineHeight: '1.25'
                            }}
                            rows={2}
                            maxLength={24}
                          />
                        ) : (
                          <div 
                            className="relative group w-full flex justify-center cursor-text"
                            onClick={() => setIsEditingText(true)}
                          >
                            <p 
                              className="text-center text-xl transition-colors duration-500 leading-tight"
                              style={{ 
                                fontFamily: activeConfig.fontFamily, 
                                color: activeConfig.textColor 
                              }}
                            >
                              {generatedText}
                            </p>
                            <div className="absolute -right-6 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="p-2 text-stone-400 hover:text-stone-600 cursor-pointer">
                                <Pencil size={14} />
                              </div>
                            </div>
                          </div>
                        )}
                        
                        <div className="mt-4 flex flex-col items-center gap-2 opacity-30">
                           <div className="w-8 h-[1px] bg-black"></div>
                           <span className="text-[10px] tracking-[0.2em] font-sans uppercase">{metaText}</span>
                        </div>
                      </>
                    )}
                 </div>
              </div>
            </TiltCard>
          </div>

          <div className="w-full md:w-[380px] flex flex-col gap-6 bg-white/60 backdrop-blur-sm p-6 rounded-2xl shadow-sm border border-stone-200/50 z-10">
             <div>
               <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                    <Sparkles size={12} /> Film Preset
                  </h3>
                  <button 
                    onClick={() => regenerateText(currentStyle)}
                    className="text-xs flex items-center gap-1 text-orange-600 hover:text-orange-800 font-medium px-2 py-1 bg-orange-50 rounded-full transition-colors"
                    disabled={isGeneratingText}
                  >
                    <RefreshCw size={12} className={isGeneratingText ? "animate-spin" : ""} />
                    {isGeneratingText ? "Thinking..." : "Regenerate Text"}
                  </button>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  {Object.values(STYLES).map((s) => (
                    <StyleButton 
                      key={s.id} 
                      styleId={s.id} 
                      isSelected={currentStyle === s.id} 
                      onClick={() => handleStyleChange(s.id)} 
                    />
                  ))}
               </div>
             </div>
             
             <div className="w-full h-[1px] bg-stone-200"></div>
             
             <div className="flex flex-col gap-3">
                <button 
                  onClick={downloadCurrentPolaroid}
                  className="w-full py-3 bg-stone-900 text-white rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-black transition shadow-lg shadow-stone-200 active:scale-[0.98]"
                >
                  <Download size={18} /> Download Photo
                </button>
                <button 
                  onClick={addToCollection}
                  disabled={isSaved || isSaving}
                  className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition active:scale-[0.98] ${
                    isSaved 
                    ? 'bg-green-50 text-green-700 border border-green-200 cursor-default'
                    : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  {isSaving ? <Loader2 size={18} className="animate-spin" /> : (isSaved ? <Check size={18} /> : <Upload size={18} />)}
                  {isSaving ? "Saving..." : (isSaved ? "Saved to Collection" : "Save to Collection")}
                </button>
                <button
                  onClick={() => {
                    setAppState('IDLE');
                    setCurrentImage(null);
                  }}
                  className="w-full py-3 text-stone-500 font-medium hover:text-stone-800 hover:bg-stone-100 rounded-xl transition flex items-center justify-center gap-2"
                >
                  <Camera size={18} /> Take Another
                </button>
             </div>
             
             <div className="p-3 rounded-lg text-center">
               <p className="text-[10px] text-stone-400 uppercase tracking-widest">
                 AI Generated • Unique Print
               </p>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGallery = () => {
    if (posterUrl) {
      return (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up">
          <div className="bg-stone-800 w-full max-w-2xl p-4 rounded-xl max-h-[90vh] flex flex-col relative">
             <button onClick={() => setPosterUrl(null)} className="absolute top-4 right-4 text-white/50 hover:text-white"><X /></button>
            <div className="text-center text-white mb-4">
              <h2 className="font-bold text-xl font-serif">Poster Preview</h2>
            </div>
            <div className="flex-1 overflow-auto flex justify-center bg-stone-900 rounded-lg p-4 no-scrollbar">
               <img src={posterUrl} className="max-w-full h-auto shadow-2xl object-contain" alt="Poster" />
            </div>
            <div className="mt-4 flex justify-center">
              <a 
                href={posterUrl} 
                download="my_week_in_polaroids.png"
                className="px-8 py-3 bg-white hover:bg-stone-200 text-black rounded-full flex gap-2 items-center font-bold transition shadow-lg"
              >
                <Download size={18} /> Save to Device
              </a>
            </div>
          </div>
        </div>
      );
    }

    if (viewingItem) {
      const config = STYLES[viewingItem.style];
       return (
        <div className="fixed inset-0 z-50 bg-stone-100/90 flex flex-col items-center justify-center p-4 backdrop-blur-md animate-fade-in-up">
           <div className="w-full max-w-4xl h-full flex flex-col items-center justify-center relative">
              <button 
                onClick={() => setViewingItem(null)} 
                className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg text-stone-600 hover:text-black z-50 transition-transform hover:scale-110"
              >
                <X size={24} />
              </button>

              {/* Using TiltCard in Gallery View too! */}
              <TiltCard className="relative bg-white shadow-2xl max-h-[80vh] aspect-[3/4] p-4 flex flex-col" style={{ backgroundColor: config.paperColor, maxWidth: '90vw' }}>
                  <div className="relative w-full aspect-[0.85] bg-stone-200 overflow-hidden ring-1 ring-black/5">
                     <img src={viewingItem.originalImage} className="w-full h-full object-cover" style={{ filter: config.filter }} alt="" />
                      <div className="absolute bottom-2 right-2 text-[#ff5533] font-[VT323] text-xl md:text-2xl font-bold opacity-90 shadow-black">
                        {`'${new Date(viewingItem.createdAt).getFullYear().toString().slice(-2)} ${(new Date(viewingItem.createdAt).getMonth()+1).toString().padStart(2,'0')} ${new Date(viewingItem.createdAt).getDate().toString().padStart(2,'0')}`}
                      </div>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center">
                     <p 
                       className="text-center text-2xl md:text-3xl px-4"
                       style={{ fontFamily: config.fontFamily, color: config.textColor }}
                     >
                       {viewingItem.generatedText}
                     </p>
                     <div className="mt-4 w-12 h-[1px] bg-black/20"></div>
                  </div>
              </TiltCard>

              <div className="mt-8 flex gap-4">
                 <button 
                  onClick={() => downloadItem(viewingItem)}
                  className="px-8 py-3 bg-stone-900 text-white rounded-full font-medium flex items-center gap-2 hover:scale-105 transition shadow-xl"
                 >
                   <Download size={20} /> Download High-Res
                 </button>
                 <button 
                  onClick={() => requestDelete(viewingItem.id)}
                  className="px-8 py-3 bg-red-100 text-red-600 rounded-full font-medium flex items-center gap-2 hover:bg-red-200 transition shadow-inner"
                 >
                   <Trash2 size={20} /> Delete
                 </button>
              </div>
           </div>
        </div>
       );
    }

    return (
      <div className="min-h-screen bg-stone-100 p-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-8 sticky top-0 bg-stone-100/80 backdrop-blur z-30 py-4">
            <button onClick={() => {
              setAppState(currentImage ? 'EDITING' : 'IDLE');
            }} className="flex items-center gap-2 text-stone-600 font-bold hover:text-stone-900 bg-white px-4 py-2 rounded-full shadow-sm transition-all hover:shadow-md">
               <ChevronLeft size={18} /> Back
            </button>
            <h1 className="text-2xl font-serif font-bold text-stone-800">Gallery</h1>
          </div>
          
          {collection.length === 0 ? (
            <div className="text-center py-20 text-stone-400 flex flex-col items-center animate-fade-in-up">
               <div className="w-24 h-24 bg-stone-200 rounded-full flex items-center justify-center mb-4">
                 <Camera size={48} className="opacity-20" />
               </div>
               <p className="text-lg font-serif">No photos yet.</p>
               <button onClick={() => {setAppState('IDLE'); fileInputRef.current?.click();}} className="mt-4 text-orange-600 font-bold hover:underline">
                 Go take one
               </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-stone-200 animate-fade-in-up">
                 <div className="text-sm text-stone-500 flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                   <span>Select <span className="font-bold text-stone-800">3, 6, or 9</span> photos to build a poster.</span>
                 </div>
                 <div className="flex gap-2">
                   <button 
                     onClick={generateAndDownloadPoster}
                     disabled={selectedForPoster.size < 3}
                     className={`px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition ${
                       selectedForPoster.size >= 3 
                       ? 'bg-stone-800 text-white hover:bg-black shadow-md' 
                       : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                     }`}
                   >
                     <Share2 size={14} /> Create Poster ({selectedForPoster.size})
                   </button>
                 </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8 animate-fade-in-up">
                 {collection.map((item, index) => {
                   const config = STYLES[item.style];
                   const isSelected = selectedForPoster.has(item.id);
                   
                   return (
                     <div 
                        key={item.id} 
                        className={`relative group transition-all duration-300 ${isSelected ? 'transform scale-95' : 'hover:scale-[1.02] hover:shadow-xl'}`}
                        style={{ transitionDelay: `${index * 50}ms` }}
                     >
                        <div 
                           className={`bg-white p-3 pb-6 shadow-md cursor-pointer relative overflow-hidden transition-all ${isSelected ? 'ring-4 ring-orange-500' : ''}`}
                           style={{ backgroundColor: config.paperColor }}
                           onClick={() => setViewingItem(item)}
                        >
                           <div className="aspect-[0.85] bg-stone-200 overflow-hidden mb-3 relative">
                              <img src={item.originalImage} className="w-full h-full object-cover" style={{ filter: config.filter }} alt="" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
                              <Maximize2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white opacity-0 group-hover:opacity-100 drop-shadow-md transition-opacity" />
                           </div>
                           <p 
                              className="text-center text-xs truncate px-1 opacity-70"
                              style={{ fontFamily: config.fontFamily, color: config.textColor }}
                           >
                             {item.generatedText}
                           </p>
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelection(item.id);
                          }}
                          className={`absolute top-2 left-2 w-8 h-8 rounded-full shadow-md border-2 border-white flex items-center justify-center transition-all z-20 ${isSelected ? 'bg-orange-500 text-white' : 'bg-stone-200/80 text-transparent hover:bg-stone-300'}`}
                        >
                          {isSelected && <Check size={16} />}
                        </button>
                        
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             requestDelete(item.id);
                           }}
                           className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full shadow-md z-20 hover:bg-red-600 transition-opacity flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                           title="Delete"
                         >
                           <Trash2 size={14} />
                         </button>
                     </div>
                   );
                 })}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Global Flash Overlay */}
      <div className={`flash-overlay ${isFlashActive ? 'active' : ''}`}></div>
      
      {/* Delete Confirmation Modal */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-up">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-500">
              <AlertCircle size={24} />
            </div>
            <h3 className="text-xl font-bold text-stone-800 mb-2">Delete Memory?</h3>
            <p className="text-stone-500 text-sm mb-6">
              This action cannot be undone. This photo will be permanently removed from your collection.
            </p>
            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-3 bg-stone-100 text-stone-600 rounded-xl font-medium hover:bg-stone-200 transition"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition shadow-lg shadow-red-200"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewfinder Overlay (Modal) */}
      {isCameraOpen && (
        <Viewfinder 
          onClose={() => setIsCameraOpen(false)}
          onCapture={handlePhotoInput}
          onUploadClick={() => fileInputRef.current?.click()}
        />
      )}
      
      {appState === 'IDLE' && renderIdle()}
      {appState === 'DEVELOPING' && renderDeveloping()}
      {appState === 'EDITING' && renderEditing()}
      {appState === 'GALLERY' && renderGallery()}
    </>
  );
}