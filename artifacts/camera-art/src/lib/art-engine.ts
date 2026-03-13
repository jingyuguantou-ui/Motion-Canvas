// Core rendering and particle engine detached from React for maximum performance

export type EffectMode = 'particles' | 'trails' | 'ripple' | 'mirror';
export type Palette = 'neon' | 'fire' | 'ocean' | 'matrix';

export interface ArtSettings {
  mode: EffectMode;
  palette: Palette;
  particleCount: number; // 0 to 100 scale
  sensitivity: number;   // 0 to 100 scale
  showCamera: boolean;
}

const PALETTES: Record<Palette, string[]> = {
  neon: ['#FFD700', '#FF2D78', '#00FFFF', '#FF6B00', '#9B59B6'],
  fire: ['#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00'],
  ocean: ['#00FFFF', '#00BFFF', '#0080FF', '#0040FF', '#00E5FF'],
  matrix: ['#00FF41', '#008F11', '#00FF41', '#003B00', '#00FF41']
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
  mode: EffectMode;
  baseX: number;
  baseY: number;

  constructor(x: number, y: number, color: string, mode: EffectMode) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    
    // Spread based on mode
    const speedMultiplier = mode === 'trails' ? 2.5 : 4;
    this.vx = (Math.random() - 0.5) * speedMultiplier;
    this.vy = (Math.random() - 0.5) * speedMultiplier;
    
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.size = Math.random() * 4 + 2;
    this.mode = mode;

    if (mode === 'ripple') {
      this.size = 1;
      this.vx = 0;
      this.vy = 0;
      this.decay = 0.02;
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    if (this.mode === 'particles' || this.mode === 'mirror') {
      this.vy += 0.08; // Gravity
      this.vx *= 0.98; // Friction
    } else if (this.mode === 'ripple') {
      this.size += 3; // Expand ring
    }
    
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number) {
    ctx.globalAlpha = Math.max(0, this.life);
    
    if (this.mode === 'ripple') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = this.color;
      
      // Neon glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = this.color;

      // In particles mode, draw a blurred circle behind for extra glow
      if (this.mode === 'particles') {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.globalAlpha = Math.max(0, this.life * 0.3);
        ctx.fill();
        ctx.globalAlpha = Math.max(0, this.life);
      }

      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      if (this.mode === 'trails') {
         // Trail streaks are handled by not clearing the canvas fully
         // But we can add extra glow here
         ctx.shadowBlur = 20;
         ctx.shadowColor = this.color;
      }
      
      // Mirror effect draws a reflection on the opposite side
      if (this.mode === 'mirror') {
        const mirroredX = canvasWidth - this.x;
        ctx.beginPath();
        ctx.arc(mirroredX, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        if (this.life > 0.8 && Math.random() > 0.8) {
           ctx.strokeStyle = this.color;
           ctx.lineWidth = 1;
           ctx.globalAlpha = 0.4;
           ctx.beginPath();
           ctx.moveTo(this.x, this.y);
           ctx.lineTo(mirroredX, this.y);
           ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1.0;
  }
}

export class ArtEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  
  private particles: Particle[] = [];
  private prevData: Uint8ClampedArray | null = null;
  private animationId: number = 0;
  private settings: ArtSettings;
  
  private width: number = 0;
  private height: number = 0;
  private detectionWidth = 100;
  private detectionHeight = 75;

  constructor(
    canvas: HTMLCanvasElement, 
    video: HTMLVideoElement, 
    initialSettings: ArtSettings
  ) {
    this.canvas = canvas;
    // We need alpha true to have transparent background for the camera overlay CSS
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.video = video;
    this.settings = initialSettings;

    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.detectionWidth;
    this.offCanvas.height = this.detectionHeight;
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true })!;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  public updateSettings(newSettings: ArtSettings) {
    this.settings = newSettings;
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  private getRandomColor(): string {
    const colors = PALETTES[this.settings.palette];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private detectMotion() {
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return;

    this.offCtx.save();
    this.offCtx.translate(this.detectionWidth, 0);
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(this.video, 0, 0, this.detectionWidth, this.detectionHeight);
    this.offCtx.restore();

    const imageData = this.offCtx.getImageData(0, 0, this.detectionWidth, this.detectionHeight);
    const data = imageData.data;

    if (!this.prevData) {
      this.prevData = new Uint8ClampedArray(data);
      return;
    }

    const threshold = 255 - (this.settings.sensitivity * 2.2); 
    const maxSpawns = Math.floor(this.settings.particleCount / 2);
    let spawned = 0;

    const scaleX = this.width / this.detectionWidth;
    const scaleY = this.height / this.detectionHeight;

    const step = 2;

    for (let y = 0; y < this.detectionHeight; y += step) {
      for (let x = 0; x < this.detectionWidth; x += step) {
        if (spawned > maxSpawns) break;

        const i = (y * this.detectionWidth + x) * 4;
        
        const rDiff = Math.abs(data[i] - this.prevData[i]);
        const gDiff = Math.abs(data[i+1] - this.prevData[i+1]);
        const bDiff = Math.abs(data[i+2] - this.prevData[i+2]);
        const totalDiff = rDiff + gDiff + bDiff;

        if (totalDiff > threshold) {
          if (Math.random() > 0.4) {
            const actualX = x * scaleX + (Math.random() * scaleX);
            const actualY = y * scaleY + (Math.random() * scaleY);
            
            this.particles.push(new Particle(
              actualX, 
              actualY, 
              this.getRandomColor(),
              this.settings.mode
            ));
            spawned++;
          }
        }
      }
    }

    this.prevData.set(data);
  }

  public start() {
    const loop = () => {
      
      // If camera background is shown, we want canvas to be completely transparent or slightly dark
      if (this.settings.showCamera) {
         if (this.settings.mode === 'trails') {
            this.ctx.fillStyle = 'rgba(10, 10, 26, 0.2)';
            this.ctx.fillRect(0, 0, this.width, this.height);
         } else {
            this.ctx.clearRect(0, 0, this.width, this.height);
         }
      } else {
         if (this.settings.mode === 'trails') {
            this.ctx.fillStyle = 'rgba(5, 5, 16, 0.2)';
            this.ctx.fillRect(0, 0, this.width, this.height);
         } else {
            this.ctx.fillStyle = '#050510';
            this.ctx.fillRect(0, 0, this.width, this.height);
         }
      }

      this.detectMotion();

      if (this.particles.length > 2500) {
         this.particles.splice(0, this.particles.length - 2500);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update();
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        } else {
          p.draw(this.ctx, this.width);
        }
      }

      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  }

  public stop() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.resize);
  }
}
