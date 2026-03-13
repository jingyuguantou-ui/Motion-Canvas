import { useEffect, useRef, useState } from 'react';
import { ArtEngine, ArtSettings } from '@/lib/art-engine';
import { AlertCircle, Loader2 } from 'lucide-react';

interface CameraLayerProps {
  settings: ArtSettings;
  isActive: boolean;
  onCameraReady: () => void;
}

export function CameraLayer({ settings, isActive, onCameraReady }: CameraLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ArtEngine | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Handle stream initialization
  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    let stream: MediaStream | null = null;

    const startCamera = async () => {
      setIsRequesting(true);
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          onCameraReady();
        }
      } catch (err) {
        console.error("Camera access denied or failed", err);
        setError("NEURAL LINK SEVERED. CAMERA ACCESS DENIED.");
      } finally {
        setIsRequesting(false);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isActive, onCameraReady]);

  // Handle Art Engine lifecycle
  useEffect(() => {
    if (!isActive || error || !canvasRef.current || !videoRef.current) return;

    const timer = setTimeout(() => {
      if (!canvasRef.current || !videoRef.current) return;
      
      engineRef.current = new ArtEngine(canvasRef.current, videoRef.current, settings);
      engineRef.current.start();
    }, 500);

    return () => {
      clearTimeout(timer);
      if (engineRef.current) {
        engineRef.current.stop();
        engineRef.current = null;
      }
    };
  }, [isActive, error]);

  // Sync settings without rebuilding the engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateSettings(settings);
    }
  }, [settings]);

  return (
    <div className="absolute inset-0 w-full h-full bg-background overflow-hidden flex items-center justify-center">
      {/* Hidden video element used purely as a data source */}
      <video 
        ref={videoRef} 
        className="hidden" 
        playsInline 
        muted 
      />

      {/* Main rendering canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover z-10"
      />

      {/* Camera Feed overlay with hue adjustment if enabled */}
      {isActive && settings.showCamera && (
        <video 
          autoPlay 
          muted 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover opacity-20 sepia saturate-200 hue-rotate-[150deg] mix-blend-screen scale-x-[-1] z-0"
          ref={(el) => {
            if (el && videoRef.current && el.srcObject !== videoRef.current.srcObject) {
              el.srcObject = videoRef.current.srcObject;
            }
          }}
        />
      )}

      {/* Status Overlay when Active */}
      {isActive && !error && !isRequesting && (
        <div className="absolute top-0 left-0 w-full z-20 pointer-events-none">
          <div className="flex items-center justify-between p-4 bg-background/50 border-b border-secondary/30 font-mono text-xs text-secondary w-full">
            <div className="flex gap-4">
              <span>SYS.OK</span>
              <span className="animate-pulse text-primary">REC_ACTIVE</span>
            </div>
            <div className="flex gap-4">
              <span>FPS: {'>'}60</span>
              <span>BUFFER: STABLE</span>
            </div>
          </div>
        </div>
      )}

      {isRequesting && (
        <div className="relative z-20 flex flex-col items-center text-primary animate-pulse glass-panel p-8 clip-corner border border-primary glow-box">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <h2 className="text-xl font-mono text-primary tracking-widest uppercase">Initializing Neural Link...</h2>
        </div>
      )}

      {error && (
        <div className="relative z-20 glass-panel p-8 clip-corner border-2 border-destructive max-w-md text-center shadow-[0_0_30px_rgba(255,0,0,0.3)] bg-background/90">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-6 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]" />
          <h2 className="text-xl font-mono text-destructive mb-4 tracking-widest">{error}</h2>
          <p className="text-secondary/70 mb-6 font-mono text-sm leading-relaxed">
            CHECK OPTICAL SENSOR HARDWARE AND PERMISSIONS.
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-destructive/20 text-destructive border border-destructive hover:bg-destructive hover:text-black transition-all font-mono uppercase tracking-widest text-sm"
          >
            [ REBOOT SYSTEM ]
          </button>
        </div>
      )}
    </div>
  );
}
