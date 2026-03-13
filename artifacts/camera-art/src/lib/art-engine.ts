// Core rendering and particle engine detached from React for maximum performance

export type EffectMode =
  | 'particles' | 'trails' | 'ripple' | 'mirror'
  | 'ascii' | 'contour' | 'magnet-shatter' | 'neural-ascii'
  | 'ascii-shatter' | 'magnet-neural'
  | 'neural-burst' | 'neural-flow';

export type Palette = 'neon' | 'fire' | 'ocean' | 'matrix';

export interface ArtSettings {
  mode: EffectMode;
  palette: Palette;
  particleCount: number;
  sensitivity: number;
  showCamera: boolean;
  demoMode?: boolean;
}

const PALETTES: Record<Palette, string[]> = {
  neon:   ['#FFD700', '#FF2D78', '#00FFFF', '#FF6B00', '#9B59B6'],
  fire:   ['#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00'],
  ocean:  ['#00FFFF', '#00BFFF', '#0080FF', '#0040FF', '#00E5FF'],
  matrix: ['#00FF41', '#008F11', '#00FF41', '#003B00', '#00FF41'],
};

const ASCII_CHARS = [' ', '.', ':', ';', '+', 'x', '%', '#', '@'];
const GLITCH_CHARS = '!@#$%^&*<>?|{}[];01';

// ---------------------------------------------------------------------------
// Standard Particle
// ---------------------------------------------------------------------------
class Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; color: string; size: number;
  mode: EffectMode;

  constructor(x: number, y: number, color: string, mode: EffectMode) {
    this.x = x; this.y = y;
    const spd = mode === 'trails' ? 2.5 : 4;
    this.vx = (Math.random() - 0.5) * spd;
    this.vy = (Math.random() - 0.5) * spd;
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.size = Math.random() * 4 + 2;
    this.mode = mode;
    if (mode === 'ripple') { this.size = 1; this.vx = 0; this.vy = 0; this.decay = 0.02; }
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.mode === 'particles' || this.mode === 'mirror') { this.vy += 0.08; this.vx *= 0.98; }
    else if (this.mode === 'ripple') { this.size += 3; }
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, W: number) {
    ctx.globalAlpha = Math.max(0, this.life);
    if (this.mode === 'ripple') {
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.shadowBlur = 15; ctx.shadowColor = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
      if (this.mode === 'particles') {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.globalAlpha = Math.max(0, this.life * 0.3); ctx.fill();
        ctx.globalAlpha = Math.max(0, this.life);
      }
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
      if (this.mode === 'mirror') {
        const mx = W - this.x;
        ctx.beginPath(); ctx.arc(mx, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        if (this.life > 0.8 && Math.random() > 0.8) {
          ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(mx, this.y); ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
  }
}

// ---------------------------------------------------------------------------
// ASCII-SHATTER: flying character cell
// ---------------------------------------------------------------------------
interface AsciiCell {
  homeX: number; homeY: number;
  x: number; y: number;
  vx: number; vy: number;
  char: string; brightness: number;
  displaced: number; // 0-1
  colorIdx: number;
  angle: number; spin: number;
}

// ---------------------------------------------------------------------------
// MAGNET-NEURAL: flowing field particle
// ---------------------------------------------------------------------------
interface FieldParticle {
  nodeA: number; nodeB: number;
  t: number; speed: number;
  color: string; size: number;
  trail: { x: number; y: number }[];
}

// ---------------------------------------------------------------------------
// Magnet shard (magnet-shatter)
// ---------------------------------------------------------------------------
interface Shard {
  srcX: number; srcY: number; x: number; y: number;
  vx: number; vy: number; life: number;
  r: number; g: number; b: number;
}

// ---------------------------------------------------------------------------
// Neural packet
// ---------------------------------------------------------------------------
interface Packet {
  nodeA: number; nodeB: number; t: number; speed: number; color: string;
}

// ---------------------------------------------------------------------------
// Hotspot node
// ---------------------------------------------------------------------------
interface Hotspot { x: number; y: number; strength: number; }

// ---------------------------------------------------------------------------
// ArtEngine
// ---------------------------------------------------------------------------
export class ArtEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null;

  private particles: Particle[] = [];
  private prevData: Uint8ClampedArray | null = null;
  private animationId: number = 0;
  private settings: ArtSettings;

  private width = 0;
  private height = 0;
  private readonly DW = 120;
  private readonly DH = 90;

  // magnet-shatter
  private shards: Shard[] = [];
  private shardCols = 0;
  private shardRows = 0;

  // neural-ascii / neural
  private hotspots: Hotspot[] = [];
  private packets: Packet[] = [];
  private asciiAnimTime = 0;

  // ascii-shatter
  private asciiCells: AsciiCell[] = [];
  private asciiCellW = 11;
  private asciiCellH = 17;

  // magnet-neural
  private fieldParticles: FieldParticle[] = [];
  private orbitAngles: number[] = [];

  // neural-burst
  private burstParticles: { x: number; y: number; vx: number; vy: number; life: number; decay: number; color: string; size: number; nodeIdx: number }[] = [];
  private nodeLastStrength: number[] = [];

  // neural-flow: flowing ASCII chars along connection paths
  private flowChars: { nodeA: number; nodeB: number; t: number; speed: number; char: string; color: string }[] = [];

  // demo
  private demoTime = 0;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement | null, initialSettings: ArtSettings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.video = video;
    this.settings = initialSettings;

    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.DW;
    this.offCanvas.height = this.DH;
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true })!;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  public updateSettings(s: ArtSettings) {
    const modeChanged = s.mode !== this.settings.mode;
    this.settings = s;
    if (modeChanged) {
      this.particles = []; this.shards = []; this.hotspots = []; this.packets = [];
      this.asciiCells = []; this.fieldParticles = []; this.orbitAngles = [];
      this.burstParticles = []; this.nodeLastStrength = []; this.flowChars = [];
    }
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.shards = []; this.asciiCells = [];
  };

  private getColor(i = 0) { return PALETTES[this.settings.palette][i % PALETTES[this.settings.palette].length]; }
  private getRandomColor() { const c = PALETTES[this.settings.palette]; return c[Math.floor(Math.random() * c.length)]; }

  // ------------------------------------------------------------------
  // Demo synthetic motion
  // ------------------------------------------------------------------
  private getDemoData(): { data: Uint8ClampedArray; hits: { x: number; y: number; diff: number }[] } {
    const data = new Uint8ClampedArray(this.DW * this.DH * 4);
    const t = this.demoTime;
    const hits: { x: number; y: number; diff: number }[] = [];

    const blobs = [
      { cx: 0.3 + 0.25 * Math.sin(t * 0.7),    cy: 0.4 + 0.2  * Math.cos(t * 0.5),  r: 0.15 },
      { cx: 0.7 + 0.2  * Math.cos(t * 0.9),    cy: 0.6 + 0.25 * Math.sin(t * 0.6),  r: 0.12 },
      { cx: 0.5 + 0.3  * Math.sin(t * 0.4 + 1), cy: 0.5 + 0.15 * Math.sin(t * 1.1), r: 0.1  },
    ];

    for (let y = 0; y < this.DH; y++) {
      for (let x = 0; x < this.DW; x++) {
        const nx = x / this.DW, ny = y / this.DH;
        let brightness = 20; let isMotion = false;
        for (const b of blobs) {
          const dist = Math.hypot(nx - b.cx, ny - b.cy);
          if (dist < b.r) { brightness = Math.max(brightness, Math.floor((1 - dist / b.r) * 200)); isMotion = true; }
        }
        const noise = Math.sin(x * 0.3 + t) * Math.cos(y * 0.4 + t * 0.7) * 30 + 30;
        brightness = Math.min(255, brightness + noise);
        const i = (y * this.DW + x) * 4;
        data[i] = Math.floor(brightness * 0.5); data[i+1] = Math.floor(brightness * 0.9);
        data[i+2] = Math.floor(brightness); data[i+3] = 255;
        if (isMotion) hits.push({ x: (x / this.DW) * this.width, y: (y / this.DH) * this.height, diff: brightness });
      }
    }
    this.demoTime += 0.025;
    return { data, hits };
  }

  private captureCameraData(): Uint8ClampedArray | null {
    if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return null;
    this.offCtx.save(); this.offCtx.translate(this.DW, 0); this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(this.video, 0, 0, this.DW, this.DH); this.offCtx.restore();
    return this.offCtx.getImageData(0, 0, this.DW, this.DH).data;
  }

  private detectMotion(data: Uint8ClampedArray): { x: number; y: number; diff: number }[] {
    const hits: { x: number; y: number; diff: number }[] = [];
    if (!this.prevData) { this.prevData = new Uint8ClampedArray(data); return hits; }
    const threshold = 255 - this.settings.sensitivity * 2.2;
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    for (let y = 0; y < this.DH; y += 2) {
      for (let x = 0; x < this.DW; x += 2) {
        const i = (y * this.DW + x) * 4;
        const diff = Math.abs(data[i] - this.prevData[i]) + Math.abs(data[i+1] - this.prevData[i+1]) + Math.abs(data[i+2] - this.prevData[i+2]);
        if (diff > threshold) hits.push({ x: x * scaleX, y: y * scaleY, diff });
      }
    }
    this.prevData.set(data);
    return hits;
  }

  // ==================================================================
  // ASCII renderer
  // ==================================================================
  private renderASCII(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    const charW = 10, charH = 16;
    const cols = Math.floor(this.width / charW), rows = Math.floor(this.height / charH);
    const colors = PALETTES[this.settings.palette];
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = `bold ${charH - 2}px "Share Tech Mono", monospace`; ctx.textBaseline = 'top';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW), dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        const brightness = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length))];
        const isMotion = motionHits.has(dy * this.DW + dx);
        if (isMotion) {
          const ci = Math.floor(this.asciiAnimTime * 3 + col * 0.1 + row * 0.05) % colors.length;
          ctx.fillStyle = colors[ci]; ctx.shadowBlur = 12; ctx.shadowColor = colors[ci];
        } else {
          ctx.fillStyle = `rgba(0,${Math.floor(brightness * 120 + 40)},${Math.floor(brightness * 60)},${0.3 + brightness * 0.5})`; ctx.shadowBlur = 0;
        }
        ctx.fillText(char, col * charW, row * charH);
      }
    }
    ctx.shadowBlur = 0; this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // Contour renderer
  // ==================================================================
  private renderContour(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, this.width, this.height);
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    const colors = PALETTES[this.settings.palette];
    const bri = (v: number) => data[v] * 0.299 + data[v+1] * 0.587 + data[v+2] * 0.114;
    for (let y = 1; y < this.DH - 1; y++) {
      for (let x = 1; x < this.DW - 1; x++) {
        const tl = bri(((y-1)*this.DW+(x-1))*4), t = bri(((y-1)*this.DW+x)*4), tr = bri(((y-1)*this.DW+(x+1))*4);
        const l = bri((y*this.DW+(x-1))*4), r = bri((y*this.DW+(x+1))*4);
        const bl = bri(((y+1)*this.DW+(x-1))*4), b = bri(((y+1)*this.DW+x)*4), br = bri(((y+1)*this.DW+(x+1))*4);
        const gx = -tl - 2*l - bl + tr + 2*r + br, gy = -tl - 2*t - tr + bl + 2*b + br;
        const mag = Math.sqrt(gx*gx + gy*gy);
        if (mag < 30) continue;
        const sx = x * scaleX, sy = y * scaleY;
        const intensity = Math.min(1, mag / 300);
        const isMotion = motionHits.has(y * this.DW + x);
        let color: string, glowSize: number;
        if (isMotion) { const ci = Math.floor(this.asciiAnimTime * 4 + x * 0.05) % colors.length; color = colors[ci]; glowSize = 20; }
        else { color = `rgba(0,${Math.floor(200 * intensity)},${Math.floor(255 * intensity)},${0.2 + intensity * 0.5})`; glowSize = 5; }
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, intensity * 2.5), 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.shadowBlur = glowSize; ctx.shadowColor = color; ctx.fill();
      }
    }
    const scanY = ((Date.now() * 0.0003) % 1) * this.height;
    const grad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    grad.addColorStop(0, 'rgba(0,255,255,0)'); grad.addColorStop(0.5, 'rgba(0,255,255,0.08)'); grad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = grad; ctx.shadowBlur = 0; ctx.fillRect(0, scanY - 40, this.width, 80);
    this.asciiAnimTime += 0.04;
  }

  // ==================================================================
  // Magnet-shatter
  // ==================================================================
  private initShards(data: Uint8ClampedArray) {
    const bW = 8, bH = 8;
    this.shardCols = Math.floor(this.width / bW); this.shardRows = Math.floor(this.height / bH);
    this.shards = [];
    for (let row = 0; row < this.shardRows; row++) {
      for (let col = 0; col < this.shardCols; col++) {
        const dx = Math.floor((col / this.shardCols) * this.DW), dy = Math.floor((row / this.shardRows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        this.shards.push({ srcX: col * bW, srcY: row * bH, x: col * bW, y: row * bH, vx: 0, vy: 0, life: 0, r: data[di], g: data[di+1], b: data[di+2] });
      }
    }
  }

  private renderMagnetShatter(data: Uint8ClampedArray, motionMap: Map<string, number>) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,16,0.4)'; ctx.fillRect(0, 0, this.width, this.height);
    const bW = 8;
    if (this.shards.length === 0) this.initShards(data);
    const colors = PALETTES[this.settings.palette];
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    const attractors: { x: number; y: number; force: number }[] = [];
    for (const [key, diff] of motionMap) { const [gx, gy] = key.split(',').map(Number); attractors.push({ x: gx * scaleX, y: gy * scaleY, force: diff / 255 }); }
    for (let i = 0; i < this.shards.length; i += 3) {
      const s = this.shards[i];
      const col = Math.floor(s.srcX / bW), row = Math.floor(s.srcY / bW);
      const dx2 = Math.floor((col / this.shardCols) * this.DW), dy2 = Math.floor((row / this.shardRows) * this.DH);
      const di = (dy2 * this.DW + dx2) * 4; s.r = data[di]; s.g = data[di+1]; s.b = data[di+2];
    }
    for (const s of this.shards) {
      let fx = 0, fy = 0;
      for (const att of attractors) {
        const ddx = att.x - s.x, ddy = att.y - s.y;
        const dist = Math.hypot(ddx, ddy) + 1;
        if (dist < 200) {
          const repel = dist < 40 ? -1 : 1;
          const str = (att.force * 800) / (dist * dist) * repel;
          fx += (ddx / dist) * str; fy += (ddy / dist) * str; s.life = Math.min(1, s.life + 0.05);
        }
      }
      fx += (s.srcX - s.x) * 0.05; fy += (s.srcY - s.y) * 0.05;
      s.vx = (s.vx + fx) * 0.85; s.vy = (s.vy + fy) * 0.85;
      s.x += s.vx; s.y += s.vy; s.life = Math.max(0, s.life - 0.01);
      const displaced = Math.abs(s.x - s.srcX) + Math.abs(s.y - s.srcY);
      if (displaced > 4 && s.life > 0) {
        const ci = Math.floor(s.life * colors.length) % colors.length;
        ctx.fillStyle = colors[ci]; ctx.shadowBlur = 8; ctx.shadowColor = colors[ci]; ctx.fillRect(s.x, s.y, 10, 10);
      } else {
        const bright = (s.r * 0.299 + s.g * 0.587 + s.b * 0.114) / 255;
        ctx.fillStyle = `rgba(${Math.floor(s.r * 0.3)},${Math.floor(bright * 180 + 40)},${Math.floor(s.b * 0.5 + bright * 120)},0.7)`;
        ctx.shadowBlur = 0; ctx.fillRect(s.x, s.y, 8, 8);
      }
    }
    ctx.shadowBlur = 0;
  }

  // ==================================================================
  // Neural-ASCII
  // ==================================================================
  private updateHotspots(motionList: { x: number; y: number; diff: number }[]) {
    if (motionList.length > 0) {
      const zW = this.width / 6, zH = this.height / 4;
      const zones = new Map<string, { sumX: number; sumY: number; count: number }>();
      for (const h of motionList) {
        const key = `${Math.floor(h.x / zW)},${Math.floor(h.y / zH)}`;
        const z = zones.get(key) ?? { sumX: 0, sumY: 0, count: 0 };
        z.sumX += h.x; z.sumY += h.y; z.count++; zones.set(key, z);
      }
      const newHS: Hotspot[] = [];
      for (const z of zones.values()) {
        if (z.count > 3) newHS.push({ x: z.sumX / z.count, y: z.sumY / z.count, strength: Math.min(1, z.count / 20) });
      }
      if (newHS.length > 0) {
        this.hotspots = newHS.map(n => {
          const ex = this.hotspots.find(h => Math.hypot(h.x - n.x, h.y - n.y) < 200);
          return ex ? { x: ex.x * 0.6 + n.x * 0.4, y: ex.y * 0.6 + n.y * 0.4, strength: ex.strength * 0.5 + n.strength * 0.5 } : n;
        });
      } else {
        this.hotspots = this.hotspots.map(h => ({ ...h, strength: h.strength * 0.85 })).filter(h => h.strength > 0.05);
      }
    } else {
      this.hotspots = this.hotspots.map(h => ({ ...h, strength: h.strength * 0.9 })).filter(h => h.strength > 0.05);
    }
  }

  private drawNeuralConnections(colors: string[]) {
    const ctx = this.ctx;
    for (let a = 0; a < this.hotspots.length; a++) {
      for (let b = a + 1; b < this.hotspots.length; b++) {
        const ha = this.hotspots[a], hb = this.hotspots[b];
        if (Math.hypot(ha.x - hb.x, ha.y - hb.y) > 600) continue;
        const alpha = Math.min(ha.strength, hb.strength) * 0.8;
        const color = colors[(a + b) % colors.length];
        const cpx = (ha.x + hb.x) / 2 + (Math.random() - 0.5) * 80, cpy = (ha.y + hb.y) / 2 - 60;
        ctx.beginPath(); ctx.moveTo(ha.x, ha.y); ctx.quadraticCurveTo(cpx, cpy, hb.x, hb.y);
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
        ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }
    for (const h of this.hotspots) {
      const color = colors[Math.floor(this.asciiAnimTime) % colors.length];
      ctx.beginPath(); ctx.arc(h.x, h.y, 6 + h.strength * 12, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = h.strength;
      ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }
  }

  private renderNeuralAscii(data: Uint8ClampedArray, motionHits: Set<number>, motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const charW = 12, charH = 18;
    const cols = Math.floor(this.width / charW), rows = Math.floor(this.height / charH);
    const colors = PALETTES[this.settings.palette];
    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = `${charH - 3}px "Share Tech Mono", monospace`; ctx.textBaseline = 'top';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW), dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        const bright = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(bright * ASCII_CHARS.length))];
        const isM = motionHits.has(dy * this.DW + dx);
        if (isM) { const ci = Math.floor(this.asciiAnimTime * 2 + col * 0.07 + row * 0.03) % colors.length; ctx.fillStyle = colors[ci]; ctx.shadowBlur = 14; ctx.shadowColor = colors[ci]; }
        else { ctx.fillStyle = `rgba(0,${Math.floor(bright * 100 + 30)},${Math.floor(bright * 50)},${0.15 + bright * 0.4})`; ctx.shadowBlur = 0; }
        ctx.fillText(char, col * charW, row * charH);
      }
    }
    ctx.shadowBlur = 0;
    this.updateHotspots(motionList);
    this.drawNeuralConnections(colors);
    if (this.hotspots.length >= 2 && Math.random() < 0.3) {
      const a = Math.floor(Math.random() * this.hotspots.length);
      let b = Math.floor(Math.random() * this.hotspots.length);
      if (b === a) b = (a + 1) % this.hotspots.length;
      this.packets.push({ nodeA: a, nodeB: b, t: 0, speed: 0.01 + Math.random() * 0.02, color: this.getRandomColor() });
    }
    this.packets = this.packets.filter(p => {
      p.t += p.speed;
      if (p.t > 1 || p.nodeA >= this.hotspots.length || p.nodeB >= this.hotspots.length) return false;
      const ha = this.hotspots[p.nodeA], hb = this.hotspots[p.nodeB];
      const px = ha.x + (hb.x - ha.x) * p.t, py = ha.y + (hb.y - ha.y) * p.t;
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.shadowBlur = 15; ctx.shadowColor = p.color; ctx.fill(); ctx.shadowBlur = 0; return true;
    });
    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // NEW: ASCII-SHATTER — ASCII字符捕捉 + 像素碎裂
  // Characters from camera image; motion areas explode chars outward
  // ==================================================================
  private initAsciiCells() {
    this.asciiCells = [];
    const cols = Math.floor(this.width / this.asciiCellW);
    const rows = Math.floor(this.height / this.asciiCellH);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        this.asciiCells.push({
          homeX: col * this.asciiCellW,
          homeY: row * this.asciiCellH,
          x: col * this.asciiCellW,
          y: row * this.asciiCellH,
          vx: 0, vy: 0,
          char: ' ', brightness: 0,
          displaced: 0,
          colorIdx: Math.floor(Math.random() * PALETTES[this.settings.palette].length),
          angle: 0, spin: (Math.random() - 0.5) * 0.3,
        });
      }
    }
  }

  private renderAsciiShatter(data: Uint8ClampedArray, motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const colors = PALETTES[this.settings.palette];
    const cW = this.asciiCellW, cH = this.asciiCellH;
    const cols = Math.floor(this.width / cW);
    const rows = Math.floor(this.height / cH);

    // background with very slow fade so trails linger
    ctx.fillStyle = 'rgba(5,5,16,0.55)';
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.asciiCells.length === 0) this.initAsciiCells();

    // Update each cell's char from camera data
    const colCount = Math.floor(this.width / cW);
    for (let i = 0; i < this.asciiCells.length; i++) {
      const cell = this.asciiCells[i];
      const col = i % colCount;
      const row = Math.floor(i / colCount);
      const dx = Math.floor((col / cols) * this.DW);
      const dy = Math.floor((row / rows) * this.DH);
      const di = (Math.min(this.DH - 1, dy) * this.DW + Math.min(this.DW - 1, dx)) * 4;
      const brightness = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
      cell.brightness = brightness;
      cell.char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length))];
    }

    // Apply motion: shatter cells near motion points
    const shatterRadius = 120;
    for (const m of motionList) {
      const force = (m.diff / 255) * 18;
      for (const cell of this.asciiCells) {
        const dist = Math.hypot(cell.homeX - m.x, cell.homeY - m.y);
        if (dist < shatterRadius && dist > 0) {
          const nx = (cell.homeX - m.x) / dist;
          const ny = (cell.homeY - m.y) / dist;
          const str = (1 - dist / shatterRadius) * force;
          cell.vx += nx * str + (Math.random() - 0.5) * str * 0.5;
          cell.vy += ny * str + (Math.random() - 0.5) * str * 0.5;
          cell.displaced = Math.min(1, cell.displaced + 0.4);
          cell.char = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
          cell.colorIdx = Math.floor(Math.random() * colors.length);
        }
      }
    }

    ctx.font = `bold ${cH - 2}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';

    for (const cell of this.asciiCells) {
      // Spring back to home
      const springX = (cell.homeX - cell.x) * 0.08;
      const springY = (cell.homeY - cell.y) * 0.08;
      cell.vx = (cell.vx + springX) * 0.82;
      cell.vy = (cell.vy + springY) * 0.82;
      cell.x += cell.vx;
      cell.y += cell.vy;
      cell.displaced = Math.max(0, cell.displaced - 0.03);
      if (cell.displaced > 0.01) cell.angle += cell.spin;

      const dist = Math.hypot(cell.x - cell.homeX, cell.y - cell.homeY);

      if (cell.displaced > 0.05 || dist > 2) {
        // Displaced: draw in palette color with rotation + glow
        const color = colors[cell.colorIdx % colors.length];
        ctx.save();
        ctx.translate(cell.x + cW / 2, cell.y + cH / 2);
        ctx.rotate(cell.angle);
        ctx.globalAlpha = Math.min(1, 0.6 + cell.displaced * 0.4);
        ctx.fillStyle = color;
        ctx.shadowBlur = 16 * cell.displaced;
        ctx.shadowColor = color;
        ctx.fillText(cell.char, -cW / 2, -cH / 2);
        ctx.restore();
        ctx.shadowBlur = 0;
      } else {
        // Settled: draw as dim ASCII
        ctx.globalAlpha = 0.25 + cell.brightness * 0.55;
        ctx.fillStyle = `rgba(30,${Math.floor(cell.brightness * 150 + 50)},${Math.floor(cell.brightness * 80)},1)`;
        ctx.shadowBlur = 0;
        ctx.fillText(cell.char, cell.x, cell.y);
      }
    }

    ctx.globalAlpha = 1;

    // Horizontal glitch scanlines on motion zones
    for (const m of motionList) {
      if (Math.random() > 0.95) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.06;
        ctx.fillRect(0, m.y - 2, this.width, 4);
        ctx.globalAlpha = 1;
      }
    }

    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // NEW: MAGNET-NEURAL — 磁场力场粒子 + 神经网络图谱
  // Neural hotspot nodes with magnetic field lines; particles flow between nodes
  // ==================================================================
  private bezierPoint(t: number, p0: number, p1: number, p2: number): number {
    return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
  }

  private renderMagnetNeural(motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const colors = PALETTES[this.settings.palette];

    // Subtle background - keep trail
    ctx.fillStyle = 'rgba(5,5,16,0.35)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw faint hex grid
    const gridSize = 60;
    ctx.strokeStyle = 'rgba(0,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < this.height + gridSize; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.width, y); ctx.stroke();
    }
    for (let x = 0; x < this.width + gridSize; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
    }

    // Update neural hotspots
    this.updateHotspots(motionList);

    // Ensure orbit angle array matches hotspot count
    while (this.orbitAngles.length < this.hotspots.length) this.orbitAngles.push(Math.random() * Math.PI * 2);

    const N = this.hotspots.length;

    // Draw magnetic field lines between nodes (static per-frame curved lines)
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const ha = this.hotspots[a], hb = this.hotspots[b];
        const dist = Math.hypot(ha.x - hb.x, ha.y - hb.y);
        if (dist > 700) continue;
        const alpha = Math.min(ha.strength, hb.strength) * 0.5 * (1 - dist / 700);
        const color = colors[(a + b) % colors.length];
        const lineCount = 3;

        for (let l = 0; l < lineCount; l++) {
          const offset = (l - 1) * 30;
          const cpx = (ha.x + hb.x) / 2 + offset * Math.cos(this.asciiAnimTime * 0.4 + a);
          const cpy = (ha.y + hb.y) / 2 + offset * Math.sin(this.asciiAnimTime * 0.3 + b) - 40;

          ctx.beginPath(); ctx.moveTo(ha.x, ha.y);
          ctx.quadraticCurveTo(cpx, cpy, hb.x, hb.y);
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha * (l === 1 ? 0.5 : 0.2);
          ctx.lineWidth = l === 1 ? 1.5 : 0.8;
          ctx.shadowBlur = l === 1 ? 12 : 4;
          ctx.shadowColor = color;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.globalAlpha = 1;
      }
    }

    // Spawn field particles between existing nodes
    if (N >= 2 && this.fieldParticles.length < 80) {
      for (let i = 0; i < 3; i++) {
        const a = Math.floor(Math.random() * N);
        let b = Math.floor(Math.random() * N);
        if (b === a) b = (a + 1) % N;
        this.fieldParticles.push({
          nodeA: a, nodeB: b,
          t: 0,
          speed: 0.004 + Math.random() * 0.01,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: Math.random() * 2.5 + 1,
          trail: [],
        });
      }
    }

    // Update and draw field particles
    this.fieldParticles = this.fieldParticles.filter(fp => {
      if (fp.nodeA >= N || fp.nodeB >= N) return false;
      fp.t += fp.speed;
      if (fp.t > 1) return false;

      const ha = this.hotspots[fp.nodeA], hb = this.hotspots[fp.nodeB];
      const cpx = (ha.x + hb.x) / 2 + Math.sin(this.asciiAnimTime * 0.4 + fp.nodeA) * 30;
      const cpy = (ha.y + hb.y) / 2 + Math.cos(this.asciiAnimTime * 0.3 + fp.nodeB) * 30 - 40;

      const px = this.bezierPoint(fp.t, ha.x, cpx, hb.x);
      const py = this.bezierPoint(fp.t, ha.y, cpy, hb.y);

      fp.trail.push({ x: px, y: py });
      if (fp.trail.length > 10) fp.trail.shift();

      // Draw trail
      for (let i = 1; i < fp.trail.length; i++) {
        const alpha = (i / fp.trail.length) * 0.7;
        ctx.beginPath();
        ctx.moveTo(fp.trail[i-1].x, fp.trail[i-1].y);
        ctx.lineTo(fp.trail[i].x, fp.trail[i].y);
        ctx.strokeStyle = fp.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = fp.size * (i / fp.trail.length);
        ctx.shadowBlur = 8; ctx.shadowColor = fp.color;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;

      // Draw particle head
      ctx.beginPath(); ctx.arc(px, py, fp.size, 0, Math.PI * 2);
      ctx.fillStyle = fp.color;
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 16; ctx.shadowColor = fp.color;
      ctx.fill(); ctx.shadowBlur = 0;

      return true;
    });

    // Draw hotspot nodes with orbiting particles and pulsing rings
    for (let i = 0; i < N; i++) {
      const h = this.hotspots[i];
      const color = colors[i % colors.length];
      const t = this.asciiAnimTime;

      // Outer pulsing ring
      const pulse = 1 + 0.3 * Math.sin(t * 2 + i);
      ctx.beginPath(); ctx.arc(h.x, h.y, (20 + h.strength * 30) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = h.strength * 0.6;
      ctx.shadowBlur = 25; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;

      // Second ring (counter pulse)
      ctx.beginPath(); ctx.arc(h.x, h.y, (12 + h.strength * 18) * (2 - pulse), 0, Math.PI * 2);
      ctx.strokeStyle = colors[(i + 1) % colors.length]; ctx.lineWidth = 0.8; ctx.globalAlpha = h.strength * 0.35;
      ctx.stroke();

      // Core dot
      ctx.beginPath(); ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.globalAlpha = h.strength;
      ctx.shadowBlur = 30; ctx.shadowColor = color; ctx.fill(); ctx.shadowBlur = 0;

      // Orbiting particles
      this.orbitAngles[i] = (this.orbitAngles[i] ?? 0) + 0.04 * (1 + h.strength);
      const orbitR = 35 + h.strength * 20;
      const numOrbiters = 3;
      for (let o = 0; o < numOrbiters; o++) {
        const angle = this.orbitAngles[i] + (o * Math.PI * 2) / numOrbiters;
        const ox = h.x + Math.cos(angle) * orbitR;
        const oy = h.y + Math.sin(angle) * orbitR * 0.5;
        const oc = colors[(i + o + 1) % colors.length];
        ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = oc; ctx.globalAlpha = h.strength * 0.9;
        ctx.shadowBlur = 10; ctx.shadowColor = oc; ctx.fill(); ctx.shadowBlur = 0;
      }

      // Node label
      ctx.globalAlpha = h.strength * 0.7;
      ctx.fillStyle = color;
      ctx.font = '9px "Share Tech Mono", monospace';
      ctx.textBaseline = 'top';
      ctx.fillText(`NODE_${String(i).padStart(2, '0')}`, h.x + 10, h.y - 8);
    }

    ctx.globalAlpha = 1;
    this.asciiAnimTime += 0.04;
  }

  // ==================================================================
  // NEW: NEURAL-BURST — 神经网络图谱 + 粒子爆裂
  // Hotspot nodes emit explosive particle bursts; neural connections visible
  // ==================================================================
  private renderNeuralBurst(motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const colors = PALETTES[this.settings.palette];

    // Slow background fade for trail effect
    ctx.fillStyle = 'rgba(5,5,16,0.3)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Update hotspots
    this.updateHotspots(motionList);
    const N = this.hotspots.length;
    while (this.nodeLastStrength.length < N) this.nodeLastStrength.push(0);

    // Detect newly energized nodes and fire bursts
    for (let i = 0; i < N; i++) {
      const h = this.hotspots[i];
      const prev = this.nodeLastStrength[i] ?? 0;
      const delta = h.strength - prev;

      // Fire a burst when node strength rises significantly
      if (delta > 0.12 && h.strength > 0.3) {
        const burstCount = Math.floor(30 + h.strength * 60);
        const color = colors[i % colors.length];
        for (let b = 0; b < burstCount; b++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 2 + Math.random() * 8;
          this.burstParticles.push({
            x: h.x, y: h.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - Math.random() * 2,
            life: 1.0,
            decay: 0.008 + Math.random() * 0.018,
            color,
            size: Math.random() * 4 + 1.5,
            nodeIdx: i,
          });
        }
      }
      this.nodeLastStrength[i] = h.strength;
    }

    // Draw neural connections between nodes (glowing arcs)
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const ha = this.hotspots[a], hb = this.hotspots[b];
        const dist = Math.hypot(ha.x - hb.x, ha.y - hb.y);
        if (dist > 600) continue;
        const alpha = Math.min(ha.strength, hb.strength) * 0.65;
        const color = colors[(a + b) % colors.length];
        const cpx = (ha.x + hb.x) / 2 + Math.sin(this.asciiAnimTime * 0.5 + a) * 40;
        const cpy = (ha.y + hb.y) / 2 + Math.cos(this.asciiAnimTime * 0.4 + b) * 40 - 50;
        ctx.beginPath(); ctx.moveTo(ha.x, ha.y);
        ctx.quadraticCurveTo(cpx, cpy, hb.x, hb.y);
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1.2;
        ctx.shadowBlur = 12; ctx.shadowColor = color; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;

        // Occasional lightning fork along connection
        if (Math.random() > 0.97) {
          const forkT = 0.3 + Math.random() * 0.4;
          const fx = this.bezierPoint(forkT, ha.x, cpx, hb.x);
          const fy = this.bezierPoint(forkT, ha.y, cpy, hb.y);
          ctx.beginPath(); ctx.moveTo(fx, fy);
          ctx.lineTo(fx + (Math.random() - 0.5) * 80, fy + (Math.random() - 0.5) * 80);
          ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.8;
          ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.stroke();
          ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        }
      }
    }

    // Draw node rings and pulsing halos
    for (let i = 0; i < N; i++) {
      const h = this.hotspots[i];
      const color = colors[i % colors.length];
      const pulse = 1 + 0.4 * Math.sin(this.asciiAnimTime * 2.5 + i * 1.3);

      // Halo
      ctx.beginPath(); ctx.arc(h.x, h.y, (18 + h.strength * 28) * pulse, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = h.strength * 0.7;
      ctx.shadowBlur = 30; ctx.shadowColor = color; ctx.stroke(); ctx.shadowBlur = 0;

      // Core
      ctx.beginPath(); ctx.arc(h.x, h.y, 5 + h.strength * 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.globalAlpha = 1;
      ctx.shadowBlur = 25; ctx.shadowColor = color; ctx.fill(); ctx.shadowBlur = 0;

      // Node label
      ctx.globalAlpha = h.strength * 0.8;
      ctx.fillStyle = color;
      ctx.font = '8px "Share Tech Mono", monospace'; ctx.textBaseline = 'top';
      ctx.fillText(`N${i}`, h.x + 12, h.y - 6);
      ctx.globalAlpha = 1;
    }

    // Update and draw burst particles
    if (this.burstParticles.length > 4000) this.burstParticles.splice(0, this.burstParticles.length - 4000);
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const p = this.burstParticles[i];
      p.vy += 0.06; // gravity
      p.vx *= 0.97; p.vy *= 0.97; // drag
      p.x += p.vx; p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { this.burstParticles.splice(i, 1); continue; }

      // Core dot
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
      ctx.shadowBlur = 10; ctx.shadowColor = p.color; ctx.fill();

      // Glow halo
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
      ctx.globalAlpha = p.life * 0.2; ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // NEW: NEURAL-FLOW — 神经网络图谱 + ASCII字符化捕捉
  // ASCII char grid from camera; neural connections rendered as streaming
  // ASCII characters flowing along bezier paths between hotspot nodes
  // ==================================================================
  private renderNeuralFlow(data: Uint8ClampedArray, motionHits: Set<number>, motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const colors = PALETTES[this.settings.palette];
    const charW = 10, charH = 15;
    const cols = Math.floor(this.width / charW), rows = Math.floor(this.height / charH);
    const FLOW_CHARS = ['-', '=', '~', '>', '<', '|', '+', '*', '#', '@'];
    const NODE_CHARS = ['*', 'O', '#', '@', '0'];

    // Background
    ctx.fillStyle = 'rgba(5,5,16,0.5)';
    ctx.fillRect(0, 0, this.width, this.height);

    // Layer 1: ASCII character grid from camera data
    ctx.font = `${charH - 2}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW);
        const dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        const brightness = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length))];
        const isMotion = motionHits.has(dy * this.DW + dx);

        if (isMotion) {
          const ci = Math.floor(this.asciiAnimTime * 2 + col * 0.08 + row * 0.04) % colors.length;
          ctx.fillStyle = colors[ci]; ctx.shadowBlur = 10; ctx.shadowColor = colors[ci];
          ctx.globalAlpha = 0.9;
        } else {
          ctx.fillStyle = `rgba(0,${Math.floor(brightness * 100 + 25)},${Math.floor(brightness * 50)},1)`;
          ctx.globalAlpha = 0.2 + brightness * 0.4; ctx.shadowBlur = 0;
        }
        ctx.fillText(char, col * charW, row * charH);
      }
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    // Update neural hotspots
    this.updateHotspots(motionList);
    const N = this.hotspots.length;

    // Layer 2: ASCII chars flowing along neural connection paths
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const ha = this.hotspots[a], hb = this.hotspots[b];
        const dist = Math.hypot(ha.x - hb.x, ha.y - hb.y);
        if (dist > 550) continue;
        const color = colors[(a + b) % colors.length];
        const alpha = Math.min(ha.strength, hb.strength) * 0.85;

        const cpx = (ha.x + hb.x) / 2 + Math.sin(this.asciiAnimTime * 0.5 + a + b) * 50;
        const cpy = (ha.y + hb.y) / 2 + Math.cos(this.asciiAnimTime * 0.35 + a) * 50 - 60;

        // Draw static ASCII chars evenly spaced along the bezier path
        const steps = Math.floor(dist / 14);
        ctx.font = `bold 11px "Share Tech Mono", monospace`;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = this.bezierPoint(t, ha.x, cpx, hb.x);
          const py = this.bezierPoint(t, ha.y, cpy, hb.y);
          const charIdx = Math.floor((this.asciiAnimTime * 4 + s) % FLOW_CHARS.length);
          const c = FLOW_CHARS[charIdx];
          ctx.fillStyle = color; ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(this.asciiAnimTime * 3 + s * 0.4));
          ctx.shadowBlur = 12; ctx.shadowColor = color;
          ctx.fillText(c, px - 5, py - 6);
        }
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    // Spawn flow chars streaming A→B
    if (N >= 2 && this.flowChars.length < 120) {
      const a = Math.floor(Math.random() * N);
      let b = Math.floor(Math.random() * N);
      if (b === a) b = (a + 1) % N;
      this.flowChars.push({
        nodeA: a, nodeB: b, t: 0,
        speed: 0.008 + Math.random() * 0.015,
        char: FLOW_CHARS[Math.floor(Math.random() * FLOW_CHARS.length)],
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    // Draw and advance streaming flow chars
    ctx.font = `bold 13px "Share Tech Mono", monospace`;
    this.flowChars = this.flowChars.filter(fc => {
      if (fc.nodeA >= N || fc.nodeB >= N) return false;
      fc.t += fc.speed;
      if (fc.t > 1) return false;
      const ha = this.hotspots[fc.nodeA], hb = this.hotspots[fc.nodeB];
      const cpx = (ha.x + hb.x) / 2 + Math.sin(this.asciiAnimTime * 0.5 + fc.nodeA + fc.nodeB) * 50;
      const cpy = (ha.y + hb.y) / 2 + Math.cos(this.asciiAnimTime * 0.35 + fc.nodeA) * 50 - 60;
      const px = this.bezierPoint(fc.t, ha.x, cpx, hb.x);
      const py = this.bezierPoint(fc.t, ha.y, cpy, hb.y);
      ctx.fillStyle = fc.color; ctx.globalAlpha = 1;
      ctx.shadowBlur = 18; ctx.shadowColor = fc.color;
      ctx.fillText(fc.char, px - 6, py - 7);
      ctx.shadowBlur = 0;
      return true;
    });
    ctx.globalAlpha = 1;

    // Layer 3: Hotspot nodes rendered as ASCII art circles
    ctx.font = `bold 14px "Share Tech Mono", monospace`;
    for (let i = 0; i < N; i++) {
      const h = this.hotspots[i];
      const color = colors[i % colors.length];
      const r = 20 + h.strength * 25;

      // Ring of ASCII chars
      const ringCount = Math.floor(r * 0.6);
      const nc = NODE_CHARS[i % NODE_CHARS.length];
      for (let k = 0; k < ringCount; k++) {
        const angle = (k / ringCount) * Math.PI * 2 + this.asciiAnimTime * 0.5;
        const rx = h.x + Math.cos(angle) * r;
        const ry = h.y + Math.sin(angle) * r * 0.6;
        ctx.fillStyle = color; ctx.globalAlpha = h.strength * (0.5 + 0.5 * Math.sin(this.asciiAnimTime * 2 + k));
        ctx.shadowBlur = 14; ctx.shadowColor = color;
        ctx.fillText(nc, rx - 6, ry - 7);
      }

      // Core symbol
      ctx.fillStyle = color; ctx.globalAlpha = 1;
      ctx.shadowBlur = 25; ctx.shadowColor = color;
      ctx.fillText('@', h.x - 7, h.y - 8);
      ctx.shadowBlur = 0;

      // Label
      ctx.font = '8px "Share Tech Mono", monospace';
      ctx.fillStyle = color; ctx.globalAlpha = h.strength * 0.7;
      ctx.fillText(`SYN_${i.toString().padStart(2, '0')}`, h.x + 18, h.y - 4);
      ctx.font = `bold 14px "Share Tech Mono", monospace`;
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;

    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // Main loop
  // ==================================================================
  public start() {
    const loop = () => {
      const mode = this.settings.mode;
      const isDemo = this.settings.demoMode;

      let data: Uint8ClampedArray | null;
      let motionList: { x: number; y: number; diff: number }[];

      if (isDemo) {
        const demo = this.getDemoData();
        data = demo.data;
        motionList = demo.hits;
      } else {
        data = this.captureCameraData();
        if (!data) { this.animationId = requestAnimationFrame(loop); return; }
        motionList = this.detectMotion(data);
      }

      const motionHits = new Set<number>();
      const motionMap = new Map<string, number>();
      for (const m of motionList) {
        const dx = Math.floor((m.x / this.width) * this.DW);
        const dy = Math.floor((m.y / this.height) * this.DH);
        motionHits.add(dy * this.DW + dx);
        motionMap.set(`${dx},${dy}`, m.diff);
      }

      if (mode === 'ascii')          { this.renderASCII(data!, motionHits);                          this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'contour')        { this.renderContour(data!, motionHits);                        this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'magnet-shatter') { this.renderMagnetShatter(data!, motionMap);                   this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'neural-ascii')   { this.renderNeuralAscii(data!, motionHits, motionList);        this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'ascii-shatter')  { this.renderAsciiShatter(data!, motionList);                        this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'magnet-neural')  { this.renderMagnetNeural(motionList);                               this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'neural-burst')   { this.renderNeuralBurst(motionList);                                this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'neural-flow')    { this.renderNeuralFlow(data!, motionHits, motionList);              this.animationId = requestAnimationFrame(loop); return; }

      // Particle modes
      if (this.settings.showCamera && !isDemo) {
        if (mode === 'trails') { this.ctx.fillStyle = 'rgba(10,10,26,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height); }
        else { this.ctx.clearRect(0, 0, this.width, this.height); }
      } else {
        if (mode === 'trails') { this.ctx.fillStyle = 'rgba(5,5,16,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height); }
        else { this.ctx.fillStyle = '#050510'; this.ctx.fillRect(0, 0, this.width, this.height); }
      }

      const maxSpawns = Math.floor(this.settings.particleCount / 2);
      let spawned = 0;
      for (const m of motionList) {
        if (spawned >= maxSpawns) break;
        if (Math.random() > 0.4) { this.particles.push(new Particle(m.x, m.y, this.getRandomColor(), mode)); spawned++; }
      }
      if (this.particles.length > 2500) this.particles.splice(0, this.particles.length - 2500);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.update();
        if (p.life <= 0) this.particles.splice(i, 1);
        else p.draw(this.ctx, this.width);
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
