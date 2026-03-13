import { useEffect, useRef, useState } from 'react';
import { ArtEngine, ArtSettings } from '@/lib/art-engine';
import { AlertCircle, Camera, Loader2 } from 'lucide-react';

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
        setError("Camera access denied. Please allow camera permissions to experience the art.");
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

    // Small delay to ensure video has metadata
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
  }, [isActive, error]); // Intentionally omitting settings here, handled below

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
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* States */}
      {!isActive && !error && (
        <div className="relative z-10 flex flex-col items-center">
          {/* We rely on the parent to show the landing UI when inactive */}
        </div>
      )}

      {isRequesting && (
        <div className="relative z-20 flex flex-col items-center text-primary animate-pulse">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <h2 className="text-xl font-display text-white tracking-widest">Accessing Optics...</h2>
        </div>
      )}

      {error && (
        <div className="relative z-20 glass-panel p-8 rounded-2xl max-w-md text-center border-destructive/50 shadow-[0_0_50px_rgba(255,0,0,0.1)]">
          <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-6" />
          <h2 className="text-2xl font-display text-white mb-4">Signal Lost</h2>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            {error}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-destructive/10 text-destructive border border-destructive/30 rounded-full hover:bg-destructive/20 hover:text-white transition-all font-medium uppercase tracking-wider text-sm"
          >
            Re-Initialize
          </button>
        </div>
      )}
    </div>
  );
}
