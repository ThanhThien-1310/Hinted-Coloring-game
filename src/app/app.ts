import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MathEngineService, BottleProblem, GradeLevel, MathProblem } from './services/math-engine.service';

interface ColorItem {
  id: string;
  nameVi: string;
  nameEn: string;
  hexCode: string;
}

export interface CanvasRegion {
  id: number;
  colorId: string;
  targetNumber: number;
  centerX: number;
  centerY: number;
  badgeRadius: number;
  pixelCount: number;
  isFilled: boolean;
}

const COLOR_DICTIONARY: ColorItem[] = [
  { id: 'red', nameVi: 'M\u00e0u \u0110\u1ecf', nameEn: 'Red', hexCode: '#ff0000' },
  { id: 'green', nameVi: 'M\u00e0u Xanh L\u00e1', nameEn: 'Green', hexCode: '#00ff00' },
  { id: 'blue', nameVi: 'M\u00e0u Xanh D\u01b0\u01a1ng', nameEn: 'Blue', hexCode: '#0000ff' },
  { id: 'yellow', nameVi: 'M\u00e0u V\u00e0ng', nameEn: 'Yellow', hexCode: '#ffff00' },
  { id: 'orange', nameVi: 'M\u00e0u Cam', nameEn: 'Orange', hexCode: '#ffa500' },
  { id: 'purple', nameVi: 'M\u00e0u T\u00edm', nameEn: 'Purple', hexCode: '#800080' },
  { id: 'pink', nameVi: 'M\u00e0u H\u1ed3ng', nameEn: 'Pink', hexCode: '#ffc0cb' },
  { id: 'brown', nameVi: 'M\u00e0u N\u00e2u', nameEn: 'Brown', hexCode: '#8b4513' },
  { id: 'black', nameVi: 'M\u00e0u \u0110en', nameEn: 'Black', hexCode: '#000000' },
  { id: 'white', nameVi: 'M\u00e0u Tr\u1eafng', nameEn: 'White', hexCode: '#ffffff' },
  { id: 'gray', nameVi: 'M\u00e0u X\u00e1m', nameEn: 'Gray', hexCode: '#808080' },
];

@Component({
  imports: [CommonModule],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App implements OnInit, OnDestroy {
  @ViewChild('coloringCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  public readonly mathEngine = inject(MathEngineService);

  protected readonly title = signal('S\u1eafc M\u00e0u To\u00e1n H\u1ecdc');
  public currentLanguage = signal<'vi' | 'en'>('vi');
  public audioEnabled = signal<boolean>(true);
  public currentGrade = signal<'1-2' | '3-5'>('1-2');
  public aiMessageVi = signal<string>('Bức tranh đang bị mất màu, bé hãy giải toán để tô lại sắc màu nhé!');
  public aiMessageEn = signal<string>('The picture lost its colors, solve math to paint it back!');

  public colors: ColorItem[] = [];
  public selectedColor = signal<ColorItem | null>(null);

  public bottles = signal<BottleProblem[]>([]);
  public selectedBottle = signal<BottleProblem | null>(null);
  public regions = signal<CanvasRegion[]>([]);

  public hasCanvasImage = signal<boolean>(false);
  public sampleImageUrl = signal<string | null>(null);
  public isCompleted = signal<boolean>(false);
  private backgroundMask: Uint8Array | null = null;

  public history = signal<ImageData[]>([]);
  private originalImageData: ImageData | null = null;
  public cleanCanvasData: ImageData | null = null;

  private hoverTimer: any = null;
  private lastHoveredTarget: number | null = null;

  ngOnInit() {
  }

  ngOnDestroy() {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
  }

  public toggleLanguage() {
    this.currentLanguage.update(lang => lang === 'vi' ? 'en' : 'vi');
  }

  public toggleAudio() {
    this.audioEnabled.update(v => !v);
  }

  public setGrade(grade: '1-2' | '3-5') {
    this.currentGrade.set(grade);
    const gl = grade === '1-2' ? '1-2' : '3-5';
    this.mathEngine.setGradeLevel(gl as any);
    if (this.colors.length > 0) {
      const generatedBottles = this.mathEngine.generateColorProblems(this.colors);
      this.bottles.set(generatedBottles);
      
      const updatedRegions = this.regions().map(r => {
        const bottle = generatedBottles.find(b => b.colorId === r.colorId);
        if (bottle) {
          return { ...r, targetNumber: bottle.targetNumber };
        }
        return r;
      });
      this.regions.set(updatedRegions);
      
      if (this.cleanCanvasData) {
        this.renderCanvas();
      }
    }
  }

  public selectColor(color: ColorItem) {
    this.selectedColor.set(color);
    const bottle = this.bottles().find(b => b.colorId === color.id);
    if (bottle) {
      this.selectedBottle.set(bottle);
      this.speakMath(bottle);
    }
  }

  // ========== HOVER HINT ==========

  public onCanvasMouseMove(event: MouseEvent) {
    if (!this.hasCanvasImage() || this.isCompleted()) return;

    if (this.hoverTimer) clearTimeout(this.hoverTimer);

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);

    const targetNumber = this.getHoveredTargetNumber(x, y);

    if (targetNumber !== null) {
      this.lastHoveredTarget = targetNumber;
      this.hoverTimer = setTimeout(() => {
        if (this.lastHoveredTarget === targetNumber) {
          this.triggerHoverHint(targetNumber);
        }
      }, 8000); // 8 seconds
    } else {
      this.lastHoveredTarget = null;
    }
  }

  public onCanvasMouseLeave() {
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.lastHoveredTarget = null;
  }

  private triggerHoverHint(targetNumber: number) {
    const msgVi = `M\u1ea3ng tranh n\u00e0y mang s\u1ed1 ${targetNumber}. B\u00e9 h\u00e3y t\u00ednh nh\u1ea9m xem l\u1ecd m\u00e0u n\u00e0o c\u00f3 k\u1ebft qu\u1ea3 b\u1eb1ng ${targetNumber} nh\u00e9!`;
    const msgEn = `This section has number ${targetNumber}. Check the paint bottles to find which calculation equals ${targetNumber}!`;
    this.aiMessageVi.set(msgVi);
    this.aiMessageEn.set(msgEn);
    this.speakText(msgVi, msgEn);
  }

  private speakText(vi: string, en: string) {
    if (!this.audioEnabled()) return;
    window.speechSynthesis.cancel();
    const lang = this.currentLanguage();
    const text = lang === 'vi' ? vi : en;
    const voiceLang = lang === 'vi' ? 'vi-VN' : 'en-US';

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceLang;
    utterance.rate = 1.0;

    // Attempt to find a suitable voice
    const voices = window.speechSynthesis.getVoices();
    const suitableVoice = voices.find(v => v.lang.includes(voiceLang));
    if (suitableVoice) {
      utterance.voice = suitableVoice;
    }

    window.speechSynthesis.speak(utterance);
  }

  private getHoveredTargetNumber(x: number, y: number): number | null {
    if (!this.cleanCanvasData || !this.originalImageData) return null;
    const w = this.cleanCanvasData.width;
    const h = this.cleanCanvasData.height;
    if (x < 0 || x >= w || y < 0 || y >= h) return null;

    const idx = (y * w + x) * 4;

    const cr = this.cleanCanvasData.data[idx];
    const cg = this.cleanCanvasData.data[idx + 1];
    const cb = this.cleanCanvasData.data[idx + 2];

    // Must be unpainted (254, 254, 254 in my line art)
    if (cr !== 254 || cg !== 254 || cb !== 254) return null;

    const or = this.originalImageData.data[idx];
    const og = this.originalImageData.data[idx + 1];
    const ob = this.originalImageData.data[idx + 2];
    const oa = this.originalImageData.data[idx + 3];

    if (oa < 128) return null;

    const colorName = this.getColorName(or, og, ob);
    if (colorName.id === 'white') return null;

    const palette = this.colors.map(c => ({
      id: c.id,
      rgb: this.hexToRgb(c.hexCode)!
    }));

    let minDist = Infinity;
    let closestColorId = '';
    for (const pc of palette) {
      const dist = (or - pc.rgb.r) ** 2 + (og - pc.rgb.g) ** 2 + (ob - pc.rgb.b) ** 2;
      if (dist < minDist) {
        minDist = dist;
        closestColorId = pc.id;
      }
    }

    if (minDist <= 4000) {
      const bottle = this.bottles().find(b => b.colorId === closestColorId);
      if (bottle) return bottle.targetNumber;
    }
    return null;
  }

  // ========== UPLOAD ==========

  public onSingleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        this.sampleImageUrl.set(src);
        this.isCompleted.set(false);

        const img = new Image();
        img.onload = () => {
          this.processImage(img);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
    input.value = '';
  }

  public exportProgress() {
    if (!this.hasCanvasImage()) return;

    const fileName = prompt(
      this.currentLanguage() === 'vi' ? 'Nh\u1eadp t\u00ean file \u0111\u1ec3 l\u01b0u ti\u1ebfn \u0111\u1ed9:' : 'Enter file name to save progress:',
      'tien-do-to-mau'
    );
    if (!fileName) return;

    const canvas = this.canvasRef.nativeElement;
    const currentCanvasUrl = canvas.toDataURL('image/png');

    const progressData = {
      originalImage: this.sampleImageUrl(),
      currentCanvas: currentCanvasUrl
    };

    const jsonString = JSON.stringify(progressData);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public onImportProgress(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          if (!data.originalImage || !data.currentCanvas) {
            alert(this.currentLanguage() === 'vi' ? 'File ti\u1ebfn \u0111\u1ed9 kh\u00f4ng h\u1ee3p l\u1ec7!' : 'Invalid progress file!');
            return;
          }

          this.sampleImageUrl.set(data.originalImage);
          this.isCompleted.set(false);

          const img = new Image();
          img.onload = () => {
            this.processImage(img);

            setTimeout(() => {
              const progressImg = new Image();
              progressImg.onload = () => {
                const canvas = this.canvasRef.nativeElement;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  ctx.drawImage(progressImg, 0, 0);
                  this.cleanCanvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                  const updated = this.regions().map(r => {
                    const idx = (r.centerY * canvas.width + r.centerX) * 4;
                    const cr = this.cleanCanvasData!.data[idx];
                    const cg = this.cleanCanvasData!.data[idx + 1];
                    const cb = this.cleanCanvasData!.data[idx + 2];
                    const isNowFilled = !(cr === 254 && cg === 254 && cb === 254);
                    return { ...r, isFilled: isNowFilled };
                  });
                  this.regions.set(updated);
                  this.renderCanvas();
                  this.history.set([]);
                }
              };
              progressImg.src = data.currentCanvas;
            }, 0);
          };
          img.src = data.originalImage;
        } catch (error) {
          alert(this.currentLanguage() === 'vi' ? 'L\u1ed7i khi \u0111\u1ecdc file ti\u1ebfn \u0111\u1ed9!' : 'Error reading progress file!');
        }
      };
      reader.readAsText(file);
    }
    input.value = '';
  }

  private getBackgroundMask(imageData: ImageData): Uint8Array {
    const w = imageData.width;
    const h = imageData.height;
    const data = imageData.data;
    const mask = new Uint8Array(w * h);
    
    const queue: number[] = [];
    const pushIfValid = (x: number, y: number) => {
      const idx = y * w + x;
      if (mask[idx] === 0) {
        const i = idx * 4;
        const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
        if (a < 128 || (r > 240 && g > 240 && b > 240)) {
          mask[idx] = 1;
          queue.push(idx);
        }
      }
    };
    
    for (let x = 0; x < w; x++) { pushIfValid(x, 0); pushIfValid(x, h - 1); }
    for (let y = 0; y < h; y++) { pushIfValid(0, y); pushIfValid(w - 1, y); }
    
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const cy = Math.floor(idx / w);
      const cx = idx % w;
      if (cx > 0) pushIfValid(cx - 1, cy);
      if (cx < w - 1) pushIfValid(cx + 1, cy);
      if (cy > 0) pushIfValid(cx, cy - 1);
      if (cy < h - 1) pushIfValid(cx, cy + 1);
    }
    return mask;
  }

  private processImage(img: HTMLImageElement) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    this.originalImageData = imageData;
    this.backgroundMask = this.getBackgroundMask(imageData);

    const lineArtData = this.generateLineArt(imageData, canvas.width, canvas.height);
    this.extractAndSetColors(imageData, lineArtData);

    const generatedBottles = this.mathEngine.generateColorProblems(this.colors);
    this.bottles.set(generatedBottles);

    const detectedRegions = this.analyzeAndSegmentRegions(imageData, lineArtData, generatedBottles);
    this.regions.set(detectedRegions);

    this.cleanCanvasData = new ImageData(
      new Uint8ClampedArray(lineArtData.data),
      canvas.width,
      canvas.height
    );

    const mainCanvas = this.canvasRef.nativeElement;
    mainCanvas.width = canvas.width;
    mainCanvas.height = canvas.height;

    this.renderCanvas();

    this.history.set([]);
    this.hasCanvasImage.set(true);
    this.selectedColor.set(null);
    this.selectedBottle.set(null);
    this.lastHoveredTarget = null;
    if (this.hoverTimer) clearTimeout(this.hoverTimer);
    this.aiMessageVi.set('Bức tranh đang bị mất màu, bé hãy giải toán để tô lại sắc màu nhé!');
    this.aiMessageEn.set('The picture lost its colors, solve math to paint it back!');
  }

  // ========== RENDER CANVAS WITH LABELS ==========

  public renderCanvas() {
    if (!this.canvasRef || !this.cleanCanvasData) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.putImageData(this.cleanCanvasData, 0, 0);

    const unfilled = this.regions().filter(r => !r.isFilled);
    const baseScale = Math.max(0.7, Math.min(1.5, canvas.width / 500));

    for (const region of unfilled) {
      const radius = Math.round(region.badgeRadius * baseScale);
      const fontSize = Math.round(14 * baseScale);

      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 2;

      ctx.beginPath();
      ctx.arc(region.centerX, region.centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#475569';
      ctx.stroke();

      ctx.font = `bold ${fontSize}px 'Nunito', sans-serif`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(region.targetNumber.toString(), region.centerX, region.centerY + 0.5);

      ctx.restore();
    }
  }

  // ========== SPARKLE EFFECT ==========

  private renderSparkleEffect(cx: number, cy: number) {
    if (!this.canvasRef || !this.cleanCanvasData) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const sparkles: { x: number; y: number; size: number; alpha: number; angle: number }[] = [];
    const numSparkles = 12;
    const spread = Math.max(30, Math.min(80, canvas.width / 10));

    for (let i = 0; i < numSparkles; i++) {
      const angle = (Math.PI * 2 / numSparkles) * i + Math.random() * 0.5;
      const dist = spread * (0.3 + Math.random() * 0.7);
      sparkles.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        size: 3 + Math.random() * 5,
        alpha: 0.7 + Math.random() * 0.3,
        angle: Math.random() * Math.PI * 2
      });
    }

    let frame = 0;
    const maxFrames = 20;

    const animate = () => {
      frame++;
      if (frame > maxFrames) return;

      this.renderCanvas();

      const progress = frame / maxFrames;
      const fadeAlpha = 1 - progress;

      for (const sp of sparkles) {
        ctx.save();
        ctx.globalAlpha = sp.alpha * fadeAlpha;
        ctx.translate(sp.x, sp.y);
        ctx.rotate(sp.angle + progress * Math.PI);

        const scaleFactor = 1 + progress * 0.5;
        const size = sp.size * scaleFactor;

        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = (Math.PI / 2) * i;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - 0.15) * size * 0.3, Math.sin(a - 0.15) * size * 0.3);
          ctx.lineTo(Math.cos(a) * size, Math.sin(a) * size);
          ctx.lineTo(Math.cos(a + 0.15) * size * 0.3, Math.sin(a + 0.15) * size * 0.3);
        }
        ctx.closePath();
        ctx.fill();

        ctx.shadowColor = '#FFD700';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FFF';
        ctx.fill();

        ctx.restore();
      }

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }

  // ========== REGION ANALYSIS (CONNECTED COMPONENTS) ==========

  private analyzeAndSegmentRegions(
    imageData: ImageData,
    lineArtData: ImageData,
    bottles: BottleProblem[]
  ): CanvasRegion[] {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const scale = 2;
    const sw = Math.ceil(width / scale);
    const sh = Math.ceil(height / scale);

    const palette = bottles.map(b => ({
      colorId: b.colorId,
      targetNumber: b.targetNumber,
      rgb: this.hexToRgb(b.hexCode)!
    }));

    const colorMap = new Int16Array(sw * sh);
    colorMap.fill(-1);

    for (let sy = 0; sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) {
        const ox = Math.min(sx * scale, width - 1);
        const oy = Math.min(sy * scale, height - 1);
        const idx = (oy * width + ox) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (a < 128) continue;
        if (this.backgroundMask && this.backgroundMask[oy * width + ox] === 1) continue;
        if (lineArtData.data[idx] < 128) continue;
        const colorName = this.getColorName(r, g, b);
        if (colorName.id === 'white') continue;

        let minDist = Infinity;
        let bestPaletteIdx = -1;
        for (let pi = 0; pi < palette.length; pi++) {
          const pc = palette[pi];
          const dist = (r - pc.rgb.r) ** 2 + (g - pc.rgb.g) ** 2 + (b - pc.rgb.b) ** 2;
          if (dist < minDist) {
            minDist = dist;
            bestPaletteIdx = pi;
          }
        }

        if (minDist <= 4000) {
          colorMap[sy * sw + sx] = bestPaletteIdx;
        }
      }
    }

    const regions: CanvasRegion[] = [];
    let regionIdCounter = 1;

    for (let pi = 0; pi < palette.length; pi++) {
      const targetP = palette[pi];

      const mask = new Uint8Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) {
        if (colorMap[i] === pi) mask[i] = 1;
      }

      const labels = new Int32Array(sw * sh);
      let nextLabel = 1;
      const componentPixels = new Map<number, number[]>();

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const idx = y * sw + x;
          if (mask[idx] !== 1 || labels[idx] !== 0) continue;

          const label = nextLabel++;
          const pixels: number[] = [];
          const queue: number[] = [idx];
          let qHead = 0;
          labels[idx] = label;

          while (qHead < queue.length) {
            const ci = queue[qHead++];
            pixels.push(ci);
            const cy = Math.floor(ci / sw);
            const cx2 = ci % sw;

            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dy === 0 && dx === 0) continue;
                const ny = cy + dy;
                const nx = cx2 + dx;
                if (ny < 0 || ny >= sh || nx < 0 || nx >= sw) continue;
                const ni = ny * sw + nx;
                if (mask[ni] === 1 && labels[ni] === 0) {
                  labels[ni] = label;
                  queue.push(ni);
                }
              }
            }
          }

          componentPixels.set(label, pixels);
        }
      }

      const minComponentSize = 25;

      for (const [label, compPixels] of componentPixels) {
        if (compPixels.length < minComponentSize) continue;

        // Distance transform for safe centroid
        const dist = new Int32Array(sw * sh);
        for (let i = 0; i < sw * sh; i++) {
          if (labels[i] === label) {
            let d = 999;
            const cy = Math.floor(i / sw);
            const cx2 = i % sw;
            for (let ddy = -1; ddy <= 1; ddy++) {
              for (let ddx = -1; ddx <= 1; ddx++) {
                if (ddy === 0 && ddx === 0) continue;
                const ny = cy + ddy;
                const nx = cx2 + ddx;
                if (ny < 0 || ny >= sh || nx < 0 || nx >= sw) { d = 0; break; }
                if (labels[ny * sw + nx] !== label) { d = 0; break; }
              }
              if (d === 0) break;
            }
            dist[i] = d;
          }
        }

        for (let pass = 0; pass < 3; pass++) {
          for (let y = 0; y < sh; y++) {
            for (let x = 0; x < sw; x++) {
              const i = y * sw + x;
              if (labels[i] !== label || dist[i] === 0) continue;
              let d = 999;
              if (y > 0 && labels[(y - 1) * sw + x] === label) d = Math.min(d, dist[(y - 1) * sw + x] + 1);
              if (x > 0 && labels[y * sw + (x - 1)] === label) d = Math.min(d, dist[y * sw + (x - 1)] + 1);
              if (y > 0 && x > 0 && labels[(y - 1) * sw + (x - 1)] === label) d = Math.min(d, dist[(y - 1) * sw + (x - 1)] + 1);
              if (y > 0 && x < sw - 1 && labels[(y - 1) * sw + (x + 1)] === label) d = Math.min(d, dist[(y - 1) * sw + (x + 1)] + 1);
              if (d < dist[i]) dist[i] = d;
            }
          }
          for (let y = sh - 1; y >= 0; y--) {
            for (let x = sw - 1; x >= 0; x--) {
              const i = y * sw + x;
              if (labels[i] !== label || dist[i] === 0) continue;
              let d = dist[i];
              if (y < sh - 1 && labels[(y + 1) * sw + x] === label) d = Math.min(d, dist[(y + 1) * sw + x] + 1);
              if (x < sw - 1 && labels[y * sw + (x + 1)] === label) d = Math.min(d, dist[y * sw + (x + 1)] + 1);
              if (y < sh - 1 && x < sw - 1 && labels[(y + 1) * sw + (x + 1)] === label) d = Math.min(d, dist[(y + 1) * sw + (x + 1)] + 1);
              if (y < sh - 1 && x > 0 && labels[(y + 1) * sw + (x - 1)] === label) d = Math.min(d, dist[(y + 1) * sw + (x - 1)] + 1);
              if (d < dist[i]) dist[i] = d;
            }
          }
        }

        let maxD = 0;
        let bX = 0;
        let bY = 0;
        for (const p of compPixels) {
          if (dist[p] > maxD) {
            maxD = dist[p];
            bX = p % sw;
            bY = Math.floor(p / sw);
          }
        }

        if (maxD > 0) {
          const realX = Math.round(bX * scale + scale / 2);
          const realY = Math.round(bY * scale + scale / 2);
          const badgeRadius = Math.max(10, Math.min(16, Math.round(maxD * scale * 0.45)));

          regions.push({
            id: regionIdCounter++,
            colorId: targetP.colorId,
            targetNumber: targetP.targetNumber,
            centerX: realX,
            centerY: realY,
            badgeRadius,
            pixelCount: compPixels.length * scale * scale,
            isFilled: false
          });
        }
      }
    }

    return regions;
  }

  // ========== COLOR RECOGNITION (HSL) ==========

  private rgbToHsl(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return { h: h * 360, s, l };
  }

  private getColorName(r: number, g: number, b: number): ColorItem {
    const { h, s, l } = this.rgbToHsl(r, g, b);

    if (r >= 250 && g >= 250 && b >= 250) return COLOR_DICTIONARY.find(c => c.id === 'white')!;
    if (l < 0.2) return COLOR_DICTIONARY.find(c => c.id === 'black')!;
    if (l > 0.96 && s < 0.1) return COLOR_DICTIONARY.find(c => c.id === 'white')!;
    if (s < 0.12) return COLOR_DICTIONARY.find(c => c.id === 'gray')!;

    if (h < 10 || h >= 350) return COLOR_DICTIONARY.find(c => c.id === 'red')!;
    if (h >= 10 && h < 35) {
      if (l < 0.4) return COLOR_DICTIONARY.find(c => c.id === 'brown')!;
      return COLOR_DICTIONARY.find(c => c.id === 'orange')!;
    }
    if (h >= 35 && h < 70) {
      if (l < 0.35 && s < 0.4) return COLOR_DICTIONARY.find(c => c.id === 'brown')!;
      return COLOR_DICTIONARY.find(c => c.id === 'yellow')!;
    }
    if (h >= 70 && h < 165) return COLOR_DICTIONARY.find(c => c.id === 'green')!;
    if (h >= 165 && h < 260) return COLOR_DICTIONARY.find(c => c.id === 'blue')!;
    if (h >= 260 && h < 310) return COLOR_DICTIONARY.find(c => c.id === 'purple')!;
    if (h >= 310 && h < 350) return COLOR_DICTIONARY.find(c => c.id === 'pink')!;

    return COLOR_DICTIONARY[0];
  }

  // ========== COLOR EXTRACTION ==========

  private extractAndSetColors(imageData: ImageData, lineArtData: ImageData) {
    const data = imageData.data;
    const laData = lineArtData.data;
    const width = imageData.width;
    const height = imageData.height;

    const clusters: { count: number; totalR: number; totalG: number; totalB: number; r: number; g: number; b: number }[] = [];
    let totalSampled = 0;

    const isSimilar = (idx1: number, idx2: number) => {
      const dr = data[idx1] - data[idx2];
      const dg = data[idx1 + 1] - data[idx2 + 1];
      const db = data[idx1 + 2] - data[idx2 + 2];
      return (dr * dr + dg * dg + db * db) < 2500;
    };

    const step = 4 * 3;
    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) continue;
      if (r > 235 && g > 235 && b > 235) continue;

      if (laData[i] !== 254 || laData[i + 1] !== 254 || laData[i + 2] !== 254) continue;

      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);

      if (px < 3 || py < 3 || px >= width - 3 || py >= height - 3) continue;

      const neighborOffsets = [
        ((py - 3) * width + px) * 4,
        ((py + 3) * width + px) * 4,
        (py * width + (px - 3)) * 4,
        (py * width + (px + 3)) * 4,
      ];

      let similarCount = 0;
      for (const nIdx of neighborOffsets) {
        if (isSimilar(i, nIdx)) similarCount++;
      }

      if (similarCount < 3) continue;

      totalSampled++;

      if (this.backgroundMask && this.backgroundMask[py * width + px] === 1) continue;

      let foundCluster = false;
      for (const cluster of clusters) {
        const dr = cluster.r - r;
        const dg = cluster.g - g;
        const db = cluster.b - b;
        if (dr * dr + dg * dg + db * db < 2500) {
          cluster.count++;
          cluster.totalR += r;
          cluster.totalG += g;
          cluster.totalB += b;
          foundCluster = true;
          break;
        }
      }
      if (!foundCluster) {
        clusters.push({ count: 1, totalR: r, totalG: g, totalB: b, r, g, b });
      }
    }

    const minCount = Math.max(10, totalSampled * 0.005);

    const sorted = clusters
      .filter(c => c.count >= minCount)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const extractedColors: ColorItem[] = sorted.map(val => {
      let avgR = Math.round(val.totalR / val.count);
      let avgG = Math.round(val.totalG / val.count);
      let avgB = Math.round(val.totalB / val.count);
      if (avgR === 254 && avgG === 254 && avgB === 254) {
        avgR = 255; avgG = 255; avgB = 255;
      }
      const avgHex = `#${this.toHex(avgR)}${this.toHex(avgG)}${this.toHex(avgB)}`;
      const colorName = this.getColorName(avgR, avgG, avgB);

      return {
        id: avgHex,
        nameVi: colorName.nameVi,
        nameEn: colorName.nameEn,
        hexCode: avgHex
      };
    });
    
    const filteredColors = extractedColors.filter(c => this.getColorName(
      parseInt(c.hexCode.substring(1,3), 16),
      parseInt(c.hexCode.substring(3,5), 16),
      parseInt(c.hexCode.substring(5,7), 16)
    ).id !== 'white');

    if (filteredColors.length === 0) {
      filteredColors.push(COLOR_DICTIONARY[0], COLOR_DICTIONARY[1], COLOR_DICTIONARY[2]);
    }

    this.colors = filteredColors;
  }

  // ========== LINE ART GENERATION (EDGE DETECTION) ==========

  private generateLineArt(imageData: ImageData, width: number, height: number): ImageData {
    const data = imageData.data;
    const output = new ImageData(width, height);
    const outData = output.data;

    // 1. Convert to grayscale
    const gray = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      if (data[idx + 3] < 128) {
        gray[i] = 255;
      } else {
        gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      }
    }

    // 2. Apply 3x3 Gaussian Blur to remove noise (chấm chấm)
    const blurred = new Float32Array(width * height);
    const kernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += gray[(y + dy) * width + (x + dx)] * kernel[(dy + 1) * 3 + (dx + 1)];
          }
        }
        blurred[y * width + x] = sum / 16;
      }
    }

    const edgeMap = new Uint8Array(width * height);
    const darkMap = new Uint8Array(width * height);
    const darkInside = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      if (blurred[i] < 85) darkMap[i] = 1;
    }

    // Find inside of large black regions (erosion with radius 3 = 7x7)
    // We use radius 3 to ensure outlines up to 6px remain solid, and only very large black areas become paintable.
    for (let y = 3; y < height - 3; y++) {
      for (let x = 3; x < width - 3; x++) {
        if (darkMap[y * width + x] === 1) {
          let allDark = true;
          for (let dy = -3; dy <= 3 && allDark; dy++) {
            for (let dx = -3; dx <= 3 && allDark; dx++) {
              if (darkMap[(y + dy) * width + (x + dx)] === 0) allDark = false;
            }
          }
          if (allDark) darkInside[y * width + x] = 1;
        }
      }
    }

    // 3. Edge Detection (Dark Outlines + Sobel Gradients)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Outline of dark regions
        if (darkMap[y * width + x] === 1 && darkInside[y * width + x] === 0) {
          edgeMap[y * width + x] = 1;
          continue;
        }

        // Skip Sobel if we are safely inside a dark region
        if (darkInside[y * width + x] === 1) {
          continue;
        }

        // Sobel edge detection for color boundaries
        const gx = blurred[(y - 1) * width + (x + 1)] - blurred[(y - 1) * width + (x - 1)]
                 + 2 * blurred[y * width + (x + 1)] - 2 * blurred[y * width + (x - 1)]
                 + blurred[(y + 1) * width + (x + 1)] - blurred[(y + 1) * width + (x - 1)];

        const gy = blurred[(y + 1) * width + (x - 1)] - blurred[(y - 1) * width + (x - 1)]
                 + 2 * blurred[(y + 1) * width + x] - 2 * blurred[(y - 1) * width + x]
                 + blurred[(y + 1) * width + (x + 1)] - blurred[(y - 1) * width + (x + 1)];

        const mag = Math.sqrt(gx * gx + gy * gy);

        if (mag > 90) {
          edgeMap[y * width + x] = 1;
        }
      }
    }

    // 4. Clean up noise (remove isolated dots and fill tiny gaps)
    const smoothEdge = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (edgeMap[y * width + x] === 1) {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              if (edgeMap[(y + dy) * width + (x + dx)] === 1) neighbors++;
            }
          }
          if (neighbors >= 2) {
            smoothEdge[y * width + x] = 1;
          }
        } else {
          let neighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (edgeMap[(y + dy) * width + (x + dx)] === 1) neighbors++;
            }
          }
          if (neighbors >= 4) {
            smoothEdge[y * width + x] = 1;
          }
        }
      }
    }

    // 5. Generate output
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const outIdx = (y * width + x) * 4;
        if (smoothEdge[y * width + x] === 1) {
          outData[outIdx] = 0;
          outData[outIdx + 1] = 0;
          outData[outIdx + 2] = 0;
          outData[outIdx + 3] = 255;
        } else {
          outData[outIdx] = 254;
          outData[outIdx + 1] = 254;
          outData[outIdx + 2] = 254;
          outData[outIdx + 3] = 255;
        }
      }
    }

    return output;
  }

  // ========== CANVAS CLICK ==========

  public onCanvasClick(event: MouseEvent) {
    if (this.isCompleted()) return;
    const color = this.selectedColor();
    if (!color || !this.hasCanvasImage() || !this.cleanCanvasData) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const elementWidth = rect.width;
    const elementHeight = rect.height;

    const scaleX = elementWidth / canvasWidth;
    const scaleY = elementHeight / canvasHeight;
    const scl = Math.min(scaleX, scaleY);

    const renderedWidth = canvasWidth * scl;
    const renderedHeight = canvasHeight * scl;

    const offsetX = (elementWidth - renderedWidth) / 2;
    const offsetY = (elementHeight - renderedHeight) / 2;

    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    if (mouseX < offsetX || mouseX > offsetX + renderedWidth ||
      mouseY < offsetY || mouseY > offsetY + renderedHeight) {
      return;
    }

    let x = Math.floor((mouseX - offsetX) / scl);
    let y = Math.floor((mouseY - offsetY) / scl);

    for (const r of this.regions()) {
      if (r.isFilled) continue;
      const dx = x - r.centerX;
      const dy = y - r.centerY;
      if (dx * dx + dy * dy <= 400) { // 20px hit radius for clicking the number
        x = r.centerX;
        y = r.centerY;
        break;
      }
    }

    if (this.backgroundMask && this.backgroundMask[y * canvasWidth + x] === 1) {
      return;
    }
    
    if (this.originalImageData) {
      const idx = (y * canvasWidth + x) * 4;
      const r = this.originalImageData.data[idx];
      const g = this.originalImageData.data[idx + 1];
      const b = this.originalImageData.data[idx + 2];
      const colorName = this.getColorName(r, g, b);
      if (colorName.id === 'white') return;
    }

    const backupData = new ImageData(
      new Uint8ClampedArray(this.cleanCanvasData.data),
      this.cleanCanvasData.width,
      this.cleanCanvasData.height
    );
    this.history.update(h => {
      const newHistory = [...h, backupData];
      if (newHistory.length > 20) newHistory.shift();
      return newHistory;
    });

    this.floodFill(x, y, color.hexCode);

    if (this.hoverTimer) clearTimeout(this.hoverTimer);
  }

  public undo() {
    this.isCompleted.set(false);
    const currentHistory = this.history();
    if (currentHistory.length > 0) {
      const previousState = currentHistory[currentHistory.length - 1];
      if (previousState && this.canvasRef) {
        this.cleanCanvasData = new ImageData(
          new Uint8ClampedArray(previousState.data),
          previousState.width,
          previousState.height
        );
        this.history.update(h => h.slice(0, -1));

        const updated = this.regions().map(r => {
          const idx = (r.centerY * previousState.width + r.centerX) * 4;
          const cr = this.cleanCanvasData!.data[idx];
          const cg = this.cleanCanvasData!.data[idx + 1];
          const cb = this.cleanCanvasData!.data[idx + 2];
          const isNowFilled = !(cr === 254 && cg === 254 && cb === 254);
          return { ...r, isFilled: isNowFilled };
        });
        this.regions.set(updated);
        this.renderCanvas();
      }
    }
  }

  // ========== UTILITIES ==========

  private toHex(n: number): string {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }

  private hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
      a: 255
    } : null;
  }

  // ========== FLOOD FILL ==========

  private floodFill(x: number, y: number, fillColorHex: string) {
    if (!this.cleanCanvasData || !this.canvasRef) return;
    const canvas = this.canvasRef.nativeElement;
    const imageData = this.cleanCanvasData;
    const data = imageData.data;

    const targetColor = this.hexToRgb(fillColorHex);
    if (!targetColor) return;

    const startPos = (y * canvas.width + x) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];

    const tolerance = 50;

    const isTargetColor = (pos: number) => {
      return data[pos] === targetColor.r &&
        data[pos + 1] === targetColor.g &&
        data[pos + 2] === targetColor.b;
    };

    if (isTargetColor(startPos)) return;

    const matchStartColor = (pos: number): boolean => {
      if (isTargetColor(pos)) return false;

      const r = data[pos];
      const g = data[pos + 1];
      const b = data[pos + 2];

      if (r < 100 && g < 100 && b < 100) return false;

      return Math.abs(r - startR) <= tolerance &&
        Math.abs(g - startG) <= tolerance &&
        Math.abs(b - startB) <= tolerance;
    };

    const pixelStack = [[x, y]];
    const colorTally = new Map<string, number>();
    const palette = this.colors.map(c => ({ id: c.id, hex: c.hexCode, rgb: this.hexToRgb(c.hexCode)! }));
    const origData = this.originalImageData?.data;

    while (pixelStack.length > 0) {
      const newPos = pixelStack.pop();
      if (!newPos) continue;
      const [px, py] = newPos;

      let currentY = py;
      const currentX = px;
      let currentPos = (currentY * canvas.width + currentX) * 4;

      while (currentY >= 0 && matchStartColor(currentPos)) {
        currentY -= 1;
        currentPos -= canvas.width * 4;
      }

      currentPos += canvas.width * 4;
      currentY += 1;

      let reachLeft = false;
      let reachRight = false;

      while (currentY < canvas.height && matchStartColor(currentPos)) {
        data[currentPos] = targetColor.r;
        data[currentPos + 1] = targetColor.g;
        data[currentPos + 2] = targetColor.b;
        data[currentPos + 3] = 255;

        if (origData && origData[currentPos + 3] >= 128) {
          const or2 = origData[currentPos];
          const og = origData[currentPos + 1];
          const ob = origData[currentPos + 2];
          let minDist = Infinity;
          let bestHex = '';
          for (const pc of palette) {
            const dist = (or2 - pc.rgb.r) ** 2 + (og - pc.rgb.g) ** 2 + (ob - pc.rgb.b) ** 2;
            if (dist < minDist) { minDist = dist; bestHex = pc.hex; }
          }
          if (minDist <= 4000) {
            colorTally.set(bestHex, (colorTally.get(bestHex) || 0) + 1);
          }
        }

        if (currentX > 0) {
          if (matchStartColor(currentPos - 4)) {
            if (!reachLeft) {
              pixelStack.push([currentX - 1, currentY]);
              reachLeft = true;
            }
          } else if (reachLeft) {
            reachLeft = false;
          }
        }

        if (currentX < canvas.width - 1) {
          if (matchStartColor(currentPos + 4)) {
            if (!reachRight) {
              pixelStack.push([currentX + 1, currentY]);
              reachRight = true;
            }
          } else if (reachRight) {
            reachRight = false;
          }
        }

        currentY += 1;
        currentPos += canvas.width * 4;
      }
    }

    let maxTally = 0;
    let trueTargetHex = '';
    for (const [hex, count] of colorTally) {
      if (count > maxTally) { maxTally = count; trueTargetHex = hex; }
    }

    if (trueTargetHex === '') {
      this.playWrongSound();
      this.aiMessageVi.set('Vùng này không có số, bé hãy chọn các mảng tranh có số để tô nhé!');
      this.aiMessageEn.set('This area has no number, please color the numbered sections!');
      setTimeout(() => {
        this.undo();
      }, 50);
      return;
    }

    if (trueTargetHex !== fillColorHex) {
      this.playWrongSound();
      this.mathEngine.recordAnswer(false);
      this.aiMessageVi.set('Ch\u01b0a ch\u00ednh x\u00e1c r\u1ed3i, b\u00e9 th\u1eed t\u00ednh nh\u1ea9m l\u1ea1i ph\u00e9p t\u00ednh tr\u00ean l\u1ecd m\u00e0u nh\u00e9!');
      this.aiMessageEn.set('Not quite right, try calculating the equation on the bottle again!');
      setTimeout(() => {
        this.undo();
      }, 50);
      return;
    }

    this.playCorrectSound();
    this.mathEngine.recordAnswer(true);
    this.aiMessageVi.set('Tuy\u1ec7t \u0111\u1ec9nh! B\u00e9 t\u00ednh nhanh nh\u01b0 ch\u1edbp!');
    this.aiMessageEn.set('Awesome! You calculated lightning fast!');

    // Update isFilled for regions
    const filledBefore = this.regions().filter(r => r.isFilled).length;
    const updated = this.regions().map(r => {
      if (r.isFilled) return r;
      const idx = (r.centerY * canvas.width + r.centerX) * 4;
      const cr = data[idx];
      const cg = data[idx + 1];
      const cb = data[idx + 2];
      const isNowFilled = !(cr === 254 && cg === 254 && cb === 254);
      return isNowFilled ? { ...r, isFilled: true } : r;
    });
    this.regions.set(updated);

    // Sparkle effect when a region is newly filled
    const filledAfter = updated.filter(r => r.isFilled).length;
    if (filledAfter > filledBefore) {
      this.renderSparkleEffect(x, y);
    } else {
      this.renderCanvas();
    }

    // Check completion
    let unfilledTargetPixels = 0;
    const paletteCheck = this.colors.map(c => ({
      id: c.id,
      rgb: this.hexToRgb(c.hexCode)!
    }));

    if (origData) {
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 254 && data[i + 1] === 254 && data[i + 2] === 254 && data[i + 3] === 255) {
          if (origData[i + 3] < 128) continue;
          const width = this.cleanCanvasData!.width;
          const px = (i / 4) % width;
          const py = Math.floor((i / 4) / width);
          if (this.backgroundMask && this.backgroundMask[py * width + px] === 1) continue;
          
          const r = origData[i], g = origData[i + 1], b = origData[i + 2];
          const colorName = this.getColorName(r, g, b);
          if (colorName.id === 'white') continue;

          let minDist = Infinity;
          for (const pc of paletteCheck) {
            const dist = (r - pc.rgb.r) ** 2 + (g - pc.rgb.g) ** 2 + (b - pc.rgb.b) ** 2;
            if (dist < minDist) minDist = dist;
          }

          if (minDist <= 4000) unfilledTargetPixels++;
        }
      }
    }

    const allRegionsFilled = this.regions().length > 0 && this.regions().every(r => r.isFilled);
    if (allRegionsFilled || unfilledTargetPixels < 50) {
      this.isCompleted.set(true);
      if (this.hoverTimer) clearTimeout(this.hoverTimer);
      this.aiMessageVi.set('Tuyệt vời! Bé đã hoàn thành bức tranh siêu đẹp!');
      this.aiMessageEn.set('Awesome! You have completed a beautiful painting!');
    }
  }

  // ========== SOUND EFFECTS ==========

  private playCorrectSound() {
    if (!this.audioEnabled()) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Play a nice magic chime (C major arpeggio)
    const playNote = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

      gain.gain.setValueAtTime(0, ctx.currentTime + startTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + startTime);
      osc.stop(ctx.currentTime + startTime + duration);
    };

    playNote(523.25, 0, 0.3); // C5
    playNote(659.25, 0.1, 0.3); // E5
    playNote(783.99, 0.2, 0.4); // G5
    playNote(1046.50, 0.3, 0.6); // C6
  }

  private playWrongSound() {
    if (!this.audioEnabled()) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Play a short soft beep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);

    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.2);
  }

  // ========== TEXT-TO-SPEECH ==========

  public async speakMath(bottle: BottleProblem) {
    if (!this.audioEnabled()) return;
    window.speechSynthesis.cancel();
    const lang = this.currentLanguage();

    let textVi = `Phép tính: ${bottle.mathProblem.expression.replace(/\+/g, ' cộng ').replace(/-/g, ' trừ ').replace(/×/g, ' nhân ').replace(/:/g, ' chia ').replace(/\(/g, ' mở ngoặc ').replace(/\)/g, ' đóng ngoặc ')}`;
    let textEn = `Calculation: ${bottle.mathProblem.expression.replace(/×/g, ' times ').replace(/:/g, ' divided by ').replace(/\+/g, ' plus ').replace(/-/g, ' minus ')}`;

    if (lang === 'en') {
      const utteranceEn = new SpeechSynthesisUtterance(textEn);
      utteranceEn.lang = 'en-US';
      window.speechSynthesis.speak(utteranceEn);
    } else {
      try {
        const response = await fetch('https://api.zalo.ai/v1/tts/synthesize', {
          method: 'POST',
          headers: {
            'apikey': '9MaHwmKB4b6BhSziuBCBA7VLlaVWoGUE',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            input: textVi,
            speaker_id: '1',
            speed: '0.8'
          })
        });

        const resData = await response.json();
        if (resData && resData.error_code === 0 && resData.data?.url) {
          const audioUrl = resData.data.url;
          let retries = 10;
          while (retries > 0) {
            try {
              const checkResponse = await fetch(audioUrl, { method: 'HEAD' });
              if (checkResponse.ok) {
                const audio = new Audio(audioUrl);
                audio.play().catch(e => console.error("Audio play failed", e));
                return;
              }
            } catch (e) {
              // retry
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            retries--;
          }
          throw new Error("Timeout");
        }
        throw new Error("API Response is not valid");
      } catch (error) {
        console.error('Error calling Zalo AI TTS:', error);
        const utteranceVi = new SpeechSynthesisUtterance(textVi);
        utteranceVi.lang = 'vi-VN';
        window.speechSynthesis.speak(utteranceVi);
      }
    }
  }
}
