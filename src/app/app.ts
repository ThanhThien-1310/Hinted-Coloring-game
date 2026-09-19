import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ColorItem {
  id: string;
  nameVi: string;
  nameEn: string;
  hexCode: string;
}

const COLOR_DICTIONARY: ColorItem[] = [
  { id: 'red', nameVi: 'Màu Đỏ', nameEn: 'Red', hexCode: '#ff0000' },
  { id: 'green', nameVi: 'Màu Xanh Lá', nameEn: 'Green', hexCode: '#00ff00' },
  { id: 'blue', nameVi: 'Màu Xanh Dương', nameEn: 'Blue', hexCode: '#0000ff' },
  { id: 'yellow', nameVi: 'Màu Vàng', nameEn: 'Yellow', hexCode: '#ffff00' },
  { id: 'orange', nameVi: 'Màu Cam', nameEn: 'Orange', hexCode: '#ffa500' },
  { id: 'purple', nameVi: 'Màu Tím', nameEn: 'Purple', hexCode: '#800080' },
  { id: 'pink', nameVi: 'Màu Hồng', nameEn: 'Pink', hexCode: '#ffc0cb' },
  { id: 'brown', nameVi: 'Màu Nâu', nameEn: 'Brown', hexCode: '#8b4513' },
  { id: 'black', nameVi: 'Màu Đen', nameEn: 'Black', hexCode: '#000000' },
  { id: 'white', nameVi: 'Màu Trắng', nameEn: 'White', hexCode: '#ffffff' },
  { id: 'gray', nameVi: 'Màu Xám', nameEn: 'Gray', hexCode: '#808080' },
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

  protected readonly title = signal('Học Màu Sắc');
  public currentLanguage = signal<'vi' | 'en'>('vi');

  public colors: ColorItem[] = [];
  public selectedColor = signal<ColorItem | null>(null);

  public hasCanvasImage = signal<boolean>(false);
  public sampleImageUrl = signal<string | null>(null);
  public isCompleted = signal<boolean>(false);

  // Lịch sử tô màu (Undo)
  public history = signal<ImageData[]>([]);
  private originalImageData: ImageData | null = null;

  // Bàn tay gợi ý - chỉ hiện sau 5s khi chọn màu mà chưa tô
  public hintActive = signal<boolean>(false);
  public hintX = signal<number>(50);
  public hintY = signal<number>(50);
  private hintTimer: any = null;
  private pendingHintColor: ColorItem | null = null;

  ngOnInit() {
  }

  ngOnDestroy() {
    if (this.hintTimer) clearTimeout(this.hintTimer);
  }

  public toggleLanguage() {
    this.currentLanguage.update(lang => lang === 'vi' ? 'en' : 'vi');
  }

  public selectColor(color: ColorItem) {
    this.selectedColor.set(color);
    this.speakColor(color);

    // Ẩn bàn tay cũ, lưu màu đang chờ, đặt timer 5s
    this.hintActive.set(false);
    this.pendingHintColor = color;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      // Sau 5s nếu user chưa tô thì hiện bàn tay
      if (this.pendingHintColor === color) {
        this.showHintForColor(color);
      }
    }, 5000);
  }

  private showHintForColor(color: ColorItem) {
    if (!this.originalImageData) return;

    const data = this.originalImageData.data;
    const width = this.originalImageData.width;
    const height = this.originalImageData.height;
    
    const targetRgb = this.hexToRgb(color.id);
    if (!targetRgb) return;

    // Đọc canvas HIỆN TẠI để biết vùng nào ĐÃ TÔ rồi
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let currentPixels: Uint8ClampedArray | null = null;
    if (ctx && canvas.width === width && canvas.height === height) {
      currentPixels = ctx.getImageData(0, 0, width, height).data;
    }

    // Thu thập RGB của TẤT CẢ các màu KHÁC đã trích xuất
    const otherColors: {r: number, g: number, b: number}[] = [];
    for (const c of this.colors) {
      if (c.id === color.id) continue;
      const rgb = this.hexToRgb(c.id);
      if (rgb) otherColors.push(rgb);
    }

    // ============ BƯỚC 1: Tạo 3 mask (downscale 4x) ============
    // rawTargetMask: thuần theo ảnh gốc (KHÔNG lọc canvas) → dùng cho CC Labeling ổn định
    // unfilledMask: rawTargetMask AND còn trắng trên canvas → dùng cho tính vị trí hint
    // otherMask: pixel thuộc màu khác → dùng cho Distance Transform
    const scale = 4;
    const sw = Math.ceil(width / scale);
    const sh = Math.ceil(height / scale);
    const rawTargetMask = new Uint8Array(sw * sh);
    const unfilledMask = new Uint8Array(sw * sh);
    const otherMask = new Uint8Array(sw * sh);

    // Lấy trước RGB của TOÀN BỘ palette để so sánh
    const palette = this.colors.map(c => ({ id: c.id, rgb: this.hexToRgb(c.id)! }));

    for (let sy = 0; sy < sh; sy++) {
      for (let sx = 0; sx < sw; sx++) {
        const ox = Math.min(sx * scale, width - 1);
        const oy = Math.min(sy * scale, height - 1);
        const idx = (oy * width + ox) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (a < 128) continue; // Bỏ qua pixel trong suốt
        
        // Bỏ qua màu trắng/nền (sử dụng logic đồng nhất với lúc trích xuất màu)
        const colorName = this.getColorName(r, g, b);
        if (colorName.id === 'white') continue;

        // Tìm màu GẦN NHẤT trong toàn bộ bảng màu (palette)
        // Đảm bảo 1 pixel CHỈ thuộc về đúng 1 màu duy nhất → Không bị trùng hint
        let closestColorId = '';
        let minDist = Infinity;
        
        for (const pc of palette) {
          const dist = (r - pc.rgb.r) ** 2 + (g - pc.rgb.g) ** 2 + (b - pc.rgb.b) ** 2;
          if (dist < minDist) {
            minDist = dist;
            closestColorId = pc.id;
          }
        }

        // Ngưỡng khoảng cách chặt hơn (4000) để loại bỏ hoàn toàn bóng đổ và pixel rác
        // bị lem màu từ viền anti-aliasing.
        if (minDist > 4000) continue;

        if (closestColorId === color.id) {
          // Pixel này thuộc màu mục tiêu
          rawTargetMask[sy * sw + sx] = 1;
          
          // Kiểm tra chưa tô trên canvas (chỉ cho unfilledMask)
          let unfilled = true;
          if (currentPixels) {
            const cr = currentPixels[idx];
            const cg = currentPixels[idx + 1];
            const cb = currentPixels[idx + 2];
            // Canvas chưa tô = 254. Màu trắng đã tô = 255.
            unfilled = (cr === 254 && cg === 254 && cb === 254);
          }
          if (unfilled) {
            unfilledMask[sy * sw + sx] = 1;
          }
        } else {
          // Pixel này thuộc về 1 màu KHÁC trong palette
          otherMask[sy * sw + sx] = 1;
        }
      }
    }

    // ============ BƯỚC 2: CC Labeling trên rawTargetMask (ẢNH GỐC) ============
    // Dùng rawTargetMask (không bị ảnh hưởng bởi viền dày) → CC ổn định
    const labels = new Int32Array(sw * sh);
    let nextLabel = 1;
    let largestLabel = 0;
    let largestSize = 0;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const startIdx = y * sw + x;
        if (rawTargetMask[startIdx] !== 1 || labels[startIdx] !== 0) continue;

        const label = nextLabel++;
        let size = 0;
        const queue: number[] = [startIdx];
        let qHead = 0;
        labels[startIdx] = label;

        while (qHead < queue.length) {
          const ci = queue[qHead++];
          size++;
          const cy = Math.floor(ci / sw);
          const cx = ci % sw;

          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              const ny = cy + dy;
              const nx = cx + dx;
              if (ny < 0 || ny >= sh || nx < 0 || nx >= sw) continue;
              const ni = ny * sw + nx;
              if (rawTargetMask[ni] === 1 && labels[ni] === 0) {
                labels[ni] = label;
                queue.push(ni);
              }
            }
          }
        }

        if (size > largestSize) {
          largestSize = size;
          largestLabel = label;
        }
      }
    }

    // Nếu mảng màu lớn nhất cũng quá bé (dưới 10 pixel downscale ~ 160 pixel thật), 
    // thì coi như màu này chỉ là nhiễu rác, không cần chỉ.
    if (largestSize < 10) return;

    // Nếu largest component không còn pixel nào unfilled → tìm component unfilled lớn nhất
    let hasUnfilled = false;
    for (let i = 0; i < sw * sh; i++) {
      if (labels[i] === largestLabel && unfilledMask[i] === 1) {
        hasUnfilled = true;
        break;
      }
    }

    if (!hasUnfilled) {
      // Largest component đã tô hết → tìm component khác còn unfilled lớn nhất
      const componentUnfilledCounts = new Map<number, number>();
      for (let i = 0; i < sw * sh; i++) {
        if (labels[i] > 0 && unfilledMask[i] === 1) {
          componentUnfilledCounts.set(labels[i], (componentUnfilledCounts.get(labels[i]) || 0) + 1);
        }
      }
      
      let bestLabel = 0, bestCount = 0;
      for (const [label, count] of componentUnfilledCounts) {
        if (count > bestCount) {
          bestCount = count;
          bestLabel = label;
        }
      }

      // Nếu số pixel chưa tô của vùng tốt nhất quá bé (< 10), 
      // nghĩa là các vùng chính ĐÃ TÔ XONG, chỉ còn sót lại pixel rác/nhiễu → tắt hint.
      if (bestCount < 10) {
        // Tất cả vùng chính đã tô xong → không hiện hint
        return;
      }
      largestLabel = bestLabel;
    }

    // ============ BƯỚC 3: Distance Transform từ otherMask ============
    const INF = sw + sh;
    const distFromOther = new Int32Array(sw * sh);

    // Forward pass
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x;
        if (otherMask[i] === 1) {
          distFromOther[i] = 0;
        } else {
          distFromOther[i] = INF;
          if (y > 0) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y - 1) * sw + x] + 1);
          if (x > 0) distFromOther[i] = Math.min(distFromOther[i], distFromOther[y * sw + (x - 1)] + 1);
          if (y > 0 && x > 0) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y - 1) * sw + (x - 1)] + 1);
          if (y > 0 && x < sw - 1) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y - 1) * sw + (x + 1)] + 1);
        }
      }
    }

    // Backward pass
    for (let y = sh - 1; y >= 0; y--) {
      for (let x = sw - 1; x >= 0; x--) {
        const i = y * sw + x;
        if (y < sh - 1) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y + 1) * sw + x] + 1);
        if (x < sw - 1) distFromOther[i] = Math.min(distFromOther[i], distFromOther[y * sw + (x + 1)] + 1);
        if (y < sh - 1 && x < sw - 1) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y + 1) * sw + (x + 1)] + 1);
        if (y < sh - 1 && x > 0) distFromOther[i] = Math.min(distFromOther[i], distFromOther[(y + 1) * sw + (x - 1)] + 1);
      }
    }

    // ============ BƯỚC 4: Tính hint position ============
    // Chỉ xét pixel: thuộc selected component + CÒN UNFILLED + xa màu khác nhất

    let maxDist = 0;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = y * sw + x;
        if (labels[i] === largestLabel && unfilledMask[i] === 1) {
          if (distFromOther[i] > maxDist) maxDist = distFromOther[i];
        }
      }
    }

    let bestX: number, bestY: number;

    if (maxDist > 0 && maxDist < INF) {
      const threshold = Math.max(1, Math.floor(maxDist * 0.7));
      let sumX = 0, sumY = 0, count = 0;

      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          if (labels[i] === largestLabel && unfilledMask[i] === 1 && distFromOther[i] >= threshold) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }

      bestX = count > 0 ? sumX / count : sw / 2;
      bestY = count > 0 ? sumY / count : sh / 2;

      // Xác minh centroid nằm trong largest component
      // (Phòng trường hợp vùng hình vành khuyên → centroid rơi vào lỗ trống)
      const ci = Math.round(bestY) * sw + Math.round(bestX);
      if (ci < 0 || ci >= labels.length || labels[ci] !== largestLabel || unfilledMask[ci] !== 1) {
        // Snap tới pixel thỏa mãn gần centroid nhất
        let minDistSq = Infinity;
        const targetX = bestX;
        const targetY = bestY;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const i = y * sw + x;
            if (labels[i] === largestLabel && distFromOther[i] >= threshold && unfilledMask[i] === 1) {
              const dx = x - targetX;
              const dy = y - targetY;
              const dSq = dx * dx + dy * dy;
              if (dSq < minDistSq) {
                minDistSq = dSq;
                bestX = x;
                bestY = y;
              }
            }
          }
        }
      }
    } else {
      // Fallback: Không có màu khác (chỉ 1 màu) hoặc distance = INF
      // → Centroid đơn giản của largest component
      let sumX = 0, sumY = 0, count = 0;
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const i = y * sw + x;
          if (labels[i] === largestLabel && unfilledMask[i] === 1) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }
      bestX = count > 0 ? sumX / count : sw / 2;
      bestY = count > 0 ? sumY / count : sh / 2;

      // Snap nếu cần
      const ci = Math.round(bestY) * sw + Math.round(bestX);
      if (ci < 0 || ci >= labels.length || labels[ci] !== largestLabel || unfilledMask[ci] !== 1) {
        let minDistSq = Infinity;
        const targetX = bestX;
        const targetY = bestY;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const i = y * sw + x;
            if (labels[i] === largestLabel && unfilledMask[i] === 1) {
              const dx = x - targetX;
              const dy = y - targetY;
              const dSq = dx * dx + dy * dy;
              if (dSq < minDistSq) {
                minDistSq = dSq;
                bestX = x;
                bestY = y;
              }
            }
          }
        }
      }
    }

    const realX = bestX * scale + scale / 2;
    const realY = bestY * scale + scale / 2;
    this.hintX.set((realX / width) * 100);
    this.hintY.set((realY / height) * 100);
    this.hintActive.set(true);
  }

  // --- Xử lý Upload Ảnh ---

  public triggerUpload() {
    if (this.fileInputRef && this.fileInputRef.nativeElement) {
      // Reset value để cho phép chọn lại cùng 1 file
      this.fileInputRef.nativeElement.value = '';
      this.fileInputRef.nativeElement.click();
    }
  }

  public onSingleUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        this.sampleImageUrl.set(src);
        this.isCompleted.set(false); // Reset trạng thái khi tải ảnh mới

        const img = new Image();
        img.onload = () => {
          this.processImage(img);
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    }
    // Reset input để cho phép chọn lại cùng file
    input.value = '';
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

    const lineArtData = this.generateLineArt(imageData, canvas.width, canvas.height);
    this.extractAndSetColors(imageData, lineArtData);

    const mainCanvas = this.canvasRef.nativeElement;
    mainCanvas.width = canvas.width;
    mainCanvas.height = canvas.height;
    const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
    mainCtx?.putImageData(lineArtData, 0, 0);

    this.history.set([]);
    this.hasCanvasImage.set(true);
    this.selectedColor.set(null);
    this.hintActive.set(false);
    this.pendingHintColor = null;
    if (this.hintTimer) clearTimeout(this.hintTimer);
  }


  // ========== NHẬN DIỆN MÀU (HSL-based) ==========

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

    // Xử lý màu trung tính trước (Đen / Trắng / Xám)
    // Kiểm tra trực tiếp RGB để bắt chắc chắn các nền trắng đục (chống lỗi s = 1.0)
    if (r > 240 && g > 240 && b > 240) return COLOR_DICTIONARY.find(c => c.id === 'white')!;
    if (l < 0.2) return COLOR_DICTIONARY.find(c => c.id === 'black')!;
    if (l > 0.9 && s < 0.2) return COLOR_DICTIONARY.find(c => c.id === 'white')!;
    if (s < 0.12) return COLOR_DICTIONARY.find(c => c.id === 'gray')!;

    // Phân loại theo Hue (góc trên vòng tròn màu)
    // Đỏ: 0-10, 350-360
    if (h < 10 || h >= 350) return COLOR_DICTIONARY.find(c => c.id === 'red')!;
    // Cam: 10-35 (sáng), Nâu: 10-35 (tối)
    if (h >= 10 && h < 35) {
      if (l < 0.4) return COLOR_DICTIONARY.find(c => c.id === 'brown')!;
      return COLOR_DICTIONARY.find(c => c.id === 'orange')!;
    }
    // Vàng: 35-70 (bao gồm beige, kem, vàng nhạt)
    if (h >= 35 && h < 70) {
      if (l < 0.35 && s < 0.4) return COLOR_DICTIONARY.find(c => c.id === 'brown')!;
      return COLOR_DICTIONARY.find(c => c.id === 'yellow')!;
    }
    // Xanh lá: 70-165
    if (h >= 70 && h < 165) return COLOR_DICTIONARY.find(c => c.id === 'green')!;
    // Xanh dương: 165-260
    if (h >= 165 && h < 260) return COLOR_DICTIONARY.find(c => c.id === 'blue')!;
    // Tím: 260-310
    if (h >= 260 && h < 310) return COLOR_DICTIONARY.find(c => c.id === 'purple')!;
    // Hồng: 310-350
    if (h >= 310 && h < 350) return COLOR_DICTIONARY.find(c => c.id === 'pink')!;

    return COLOR_DICTIONARY[0];
  }

  // ========== TRÍCH XUẤT MÀU TỪ ẢNH ==========

  private extractAndSetColors(imageData: ImageData, lineArtData: ImageData) {
    const data = imageData.data;
    const laData = lineArtData.data;
    const width = imageData.width;
    const height = imageData.height;

    // CHIẾN LƯỢC: Đếm pixel VÀ kiểm tra VÙNG LÂN CẬN
    // Pixel "vùng tô" → xung quanh cùng màu → ĐẾM
    // Pixel "viền" → xung quanh khác màu → BỎ QUA
    const colorNameCounts = new Map<string, { count: number; totalR: number; totalG: number; totalB: number; name: ColorItem }>();
    let totalSampled = 0;

    // Helper: so sánh 2 pixel có "gần giống" nhau không
    const isSimilar = (idx1: number, idx2: number) => {
      const dr = data[idx1] - data[idx2];
      const dg = data[idx1 + 1] - data[idx2 + 1];
      const db = data[idx1 + 2] - data[idx2 + 2];
      return (dr * dr + dg * dg + db * db) < 2500; // Tolerance ~50 per channel
    };

    const step = 4 * 3;
    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < 128) continue;
      if (r > 235 && g > 235 && b > 235) continue; // Bỏ qua màu trắng

      // CHỈ trích xuất màu từ các pixel có thể tô được trên Line Art!
      // (Những pixel đã bị biến thành viền đen (0,0,0) sẽ KHÔNG được tính)
      if (laData[i] !== 254 || laData[i + 1] !== 254 || laData[i + 2] !== 254) continue;

      // Tính toạ độ pixel
      const px = (i / 4) % width;
      const py = Math.floor((i / 4) / width);

      // Bỏ rìa ảnh (cần khoảng cách cho neighbor check)
      if (px < 3 || py < 3 || px >= width - 3 || py >= height - 3) continue;

      // KIỂM TRA VÙNG LÂN CẬN: pixel cách 3px ở 4 hướng có cùng tông không?
      const neighborOffsets = [
        ((py - 3) * width + px) * 4,  // Trên
        ((py + 3) * width + px) * 4,  // Dưới  
        (py * width + (px - 3)) * 4,  // Trái
        (py * width + (px + 3)) * 4,  // Phải
      ];

      let similarCount = 0;
      for (const nIdx of neighborOffsets) {
        if (isSimilar(i, nIdx)) similarCount++;
      }

      // Cần ít nhất 3/4 neighbors cùng màu → đây là vùng tô, KHÔNG phải viền
      if (similarCount < 3) continue;

      totalSampled++;

      const colorName = this.getColorName(r, g, b);
      if (colorName.id === 'white') continue; // Bỏ qua màu trắng

      const existing = colorNameCounts.get(colorName.id);
      if (existing) {
        existing.count++;
        existing.totalR += r;
        existing.totalG += g;
        existing.totalB += b;
      } else {
        colorNameCounts.set(colorName.id, { count: 1, totalR: r, totalG: g, totalB: b, name: colorName });
      }
    }

    // Ngưỡng diện tích: Hạ xuống 0.5% vì ta đã lọc thành công các nét viền.
    // Những vùng nhỏ như mắt, mũi chó (chỉ vài trăm pixel) giờ sẽ được đưa vào bảng màu!
    const minCount = Math.max(10, totalSampled * 0.005);

    // Sắp xếp theo tần suất, lọc theo ngưỡng, lấy tối đa 6
    const sorted = Array.from(colorNameCounts.entries())
      .filter(([_, val]) => val.count >= minCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 6);

    const extractedColors: ColorItem[] = sorted.map(([_key, val]) => {
      // Tính màu trung bình thực tế
      let avgR = Math.round(val.totalR / val.count);
      let avgG = Math.round(val.totalG / val.count);
      let avgB = Math.round(val.totalB / val.count);
      // Đảm bảo không trùng với màu 254,254,254 (canvas background chưa tô)
      if (avgR === 254 && avgG === 254 && avgB === 254) {
        avgR = 255; avgG = 255; avgB = 255;
      }
      const avgHex = `#${this.toHex(avgR)}${this.toHex(avgG)}${this.toHex(avgB)}`;

      return {
        id: avgHex,
        nameVi: val.name.nameVi,
        nameEn: val.name.nameEn,
        hexCode: avgHex
      };
    });

    if (extractedColors.length === 0) {
      extractedColors.push(COLOR_DICTIONARY[0], COLOR_DICTIONARY[1], COLOR_DICTIONARY[2]);
    }

    this.colors = extractedColors;
  }

  // ========== TẠO HÌNH NÉT (EDGE DETECTION CẢI TIẾN) ==========

  private generateLineArt(imageData: ImageData, width: number, height: number): ImageData {
    const data = imageData.data;
    const output = new ImageData(width, height);
    const outData = output.data;

    // Bước 1: Chuyển sang grayscale VỚI PADDING 1px trắng (255) xung quanh
    // Padding giúp Sobel detect được cạnh tại mép ảnh (ví dụ viền cờ)
    const padW = width + 2;
    const padH = height + 2;
    const gray = new Float32Array(padW * padH);
    gray.fill(255); // Padding = trắng
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (y * width + x) * 4;
        const r = data[srcIdx], g = data[srcIdx + 1], b = data[srcIdx + 2], a = data[srcIdx + 3];
        if (a < 128) {
          gray[(y + 1) * padW + (x + 1)] = 255;
        } else {
          gray[(y + 1) * padW + (x + 1)] = 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }
    }

    // Bước 2: Gaussian blur 3x3 trên ảnh padded
    const blurred = new Float32Array(padW * padH);
    blurred.set(gray); // Copy border values
    const gKernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        let sum = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            sum += gray[(y + j) * padW + (x + i)] * gKernel[(j + 1) * 3 + (i + 1)];
          }
        }
        blurred[y * padW + x] = sum / 16;
      }
    }

    // Bước 3: Sobel edge detection
    const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    const magnitude = new Float32Array(padW * padH);

    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        let gx = 0, gy = 0;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const val = blurred[(y + j) * padW + (x + i)];
            const ki = (j + 1) * 3 + (i + 1);
            gx += val * kernelX[ki];
            gy += val * kernelY[ki];
          }
        }
        magnitude[y * padW + x] = Math.sqrt(gx * gx + gy * gy);
      }
    }

    // Bước 4: Hysteresis threshold
    const highThreshold = 50;
    const lowThreshold = 25;

    const edgeMap = new Uint8Array(padW * padH);
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        const mag = magnitude[y * padW + x];
        if (mag > highThreshold) edgeMap[y * padW + x] = 2;
        else if (mag > lowThreshold) edgeMap[y * padW + x] = 1;
      }
    }

    // Kết nối edge yếu với edge mạnh
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        if (edgeMap[y * padW + x] === 1) {
          let hasStrong = false;
          for (let j = -1; j <= 1 && !hasStrong; j++) {
            for (let i = -1; i <= 1 && !hasStrong; i++) {
              if (edgeMap[(y + j) * padW + (x + i)] === 2) hasStrong = true;
            }
          }
          if (hasStrong) edgeMap[y * padW + x] = 2;
        }
      }
    }

    // Bước 4.5: Xử lý thông minh bằng Hình thái học (Morphology)
    
    const blackMask = new Uint8Array(padW * padH);
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        // Lấy màu thật từ ảnh gốc để tránh nhầm lẫn bóng đổ (shading)
        const srcIdx = ((y - 1) * width + (x - 1)) * 4;
        const r = data[srcIdx];
        const g = data[srcIdx + 1];
        const b = data[srcIdx + 2];
        const a = data[srcIdx + 3];
        
        // CHỈ chọn màu đen/xám thật sự (loại bỏ đỏ/xanh thẫm như cờ VN)
        if (a > 128 && r < 60 && g < 60 && b < 60) {
          blackMask[y * padW + x] = 1;
        }
      }
    }

    // 1. Erosion (Bán kính 5 -> loại bỏ nét vẽ dày và góc giao nhau <= 10px)
    const erodedMask = new Uint8Array(padW * padH);
    for (let y = 5; y < padH - 5; y++) {
      for (let x = 5; x < padW - 5; x++) {
        if (blackMask[y * padW + x] === 1) {
          let allBlack = true;
          for (let dy = -5; dy <= 5 && allBlack; dy++) {
            for (let dx = -5; dx <= 5 && allBlack; dx++) {
              if (blackMask[(y + dy) * padW + (x + dx)] === 0) allBlack = false;
            }
          }
          if (allBlack) erodedMask[y * padW + x] = 1;
        }
      }
    }

    // 2. Dilation (Bán kính 6 -> khôi phục mảng đen lớn như cờ Đức)
    const largeBlackMask = new Uint8Array(padW * padH);
    for (let y = 6; y < padH - 6; y++) {
      for (let x = 6; x < padW - 6; x++) {
        if (erodedMask[y * padW + x] === 1) {
          for (let dy = -6; dy <= 6; dy++) {
            for (let dx = -6; dx <= 6; dx++) {
              const ny = y + dy; const nx = x + dx;
              if (ny >= 0 && ny < padH && nx >= 0 && nx < padW) {
                largeBlackMask[ny * padW + nx] = 1;
              }
            }
          }
        }
      }
    }

    // 3. Kết hợp cạnh và nét viền đen
    const rawEdge = new Uint8Array(padW * padH);
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        if (edgeMap[y * padW + x] === 2) {
          rawEdge[y * padW + x] = 1;
        } else if (blackMask[y * padW + x] === 1 && largeBlackMask[y * padW + x] === 0) {
          // Pixel thuộc nét vẽ viền đen (đã bị xóa bởi erosion) -> Đổ đen đặc!
          rawEdge[y * padW + x] = 1;
        }
      }
    }

    // 4. Dilation toàn bộ viền lên 2px để viền mượt và đồng đều độ dày
    const finalEdge = new Uint8Array(padW * padH);
    for (let y = 1; y < padH - 1; y++) {
      for (let x = 1; x < padW - 1; x++) {
        if (rawEdge[y * padW + x] === 1) {
          finalEdge[y * padW + x] = 1;
          finalEdge[y * padW + x + 1] = 1;
          finalEdge[(y + 1) * padW + x] = 1;
          finalEdge[(y + 1) * padW + x + 1] = 1;
        }
      }
    }

    // Bước 5: Render output
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const outIdx = (y * width + x) * 4;
        const padIdx = (y + 1) * padW + (x + 1);
        if (finalEdge[padIdx] === 1) {
          outData[outIdx] = 0;
          outData[outIdx + 1] = 0;
          outData[outIdx + 2] = 0;
        } else {
          outData[outIdx] = 254;
          outData[outIdx + 1] = 254;
          outData[outIdx + 2] = 254;
        }
        outData[outIdx + 3] = 255;
      }
    }

    return output;
  }

  private toHex(c: number) {
    const hex = Math.min(255, Math.max(0, c)).toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }

  // ========== TÔ MÀU (FLOOD FILL) ==========

  public onCanvasClick(event: MouseEvent) {
    const color = this.selectedColor();
    if (!color || !this.hasCanvasImage()) return;

    const canvas = this.canvasRef.nativeElement;
    const rect = canvas.getBoundingClientRect();

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((event.clientX - rect.left) * scaleX);
    const y = Math.floor((event.clientY - rect.top) * scaleY);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
      this.history.update(h => {
        const newHistory = [...h, currentState];
        if (newHistory.length > 20) newHistory.shift();
        return newHistory;
      });

      this.floodFill(ctx, x, y, color.hexCode);

      // Ẩn bàn tay hiện tại, restart timer 5s để chỉ tới vùng CHƯA TÔ tiếp theo
      this.hintActive.set(false);
      this.pendingHintColor = color;
      if (this.hintTimer) clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => {
        if (this.pendingHintColor === color && this.selectedColor() === color) {
          this.showHintForColor(color);
        }
      }, 3000); // 3s sau khi tô → chỉ tiếp vùng kế
    }
  }

  public undo() {
    this.isCompleted.set(false); // Reset trạng thái nếu đang hoàn thành mà ấn undo
    const currentHistory = this.history();
    if (currentHistory.length > 0) {
      const previousState = currentHistory[currentHistory.length - 1];
      const ctx = this.canvasRef.nativeElement.getContext('2d');
      if (ctx && previousState) {
        ctx.putImageData(previousState, 0, 0);
        this.history.update(h => h.slice(0, -1));
      }
    }
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

  private floodFill(ctx: CanvasRenderingContext2D, x: number, y: number, fillColorHex: string) {
    const canvas = ctx.canvas;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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

    const matchStartColor = (pos: number) => {
      if (isTargetColor(pos)) return false; // NGĂN LẶP VÔ HẠN nếu targetColor nằm trong khoảng tolerance

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
      let currentX = px;
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
          const or = origData[currentPos];
          const og = origData[currentPos + 1];
          const ob = origData[currentPos + 2];
          let minDist = Infinity;
          let bestHex = '';
          for (const pc of palette) {
            const dist = (or - pc.rgb.r) ** 2 + (og - pc.rgb.g) ** 2 + (ob - pc.rgb.b) ** 2;
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

    ctx.putImageData(imageData, 0, 0);

    if (trueTargetHex !== '' && trueTargetHex !== fillColorHex) {
      // Sai màu!
      setTimeout(() => {
        alert(this.currentLanguage() === 'vi' ? 'Bạn tô sai màu rồi! Hãy chọn đúng màu để tô nhé.' : 'Wrong color! Please pick the correct color.');
        this.undo();
      }, 50);
      return;
    }

    // Kiểm tra xem hình đã được tô xong (tất cả các màu có trong palette đều đã tô)
    let unfilledTargetPixels = 0;
    const paletteCheck = this.colors.map(c => ({
      id: c.id,
      rgb: this.hexToRgb(c.hexCode)!
    }));

    if (origData) {
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 254 && data[i + 1] === 254 && data[i + 2] === 254 && data[i + 3] === 255) {
          // Pixel trên canvas chưa được tô, kiểm tra xem ở ảnh gốc nó màu gì
          if (origData[i + 3] < 128) continue; // Bỏ qua trong suốt
          const r = origData[i], g = origData[i + 1], b = origData[i + 2];
          const colorName = this.getColorName(r, g, b);
          
          if (colorName.id === 'white') continue;
          
          let minDist = Infinity;
          for (const pc of palette) {
            const dist = (r - pc.rgb.r) ** 2 + (g - pc.rgb.g) ** 2 + (b - pc.rgb.b) ** 2;
            if (dist < minDist) minDist = dist;
          }
          
          if (minDist <= 4000) unfilledTargetPixels++;
        }
      }
    }

    // Nếu chỉ còn sót vài pixel rác < 50 pixel, coi như bức tranh đã hoàn thành!
    if (unfilledTargetPixels < 50) {
      this.isCompleted.set(true);
      this.hintActive.set(false);
      if (this.hintTimer) clearTimeout(this.hintTimer);
    }
  }

  // ========== ÂM THANH ==========

  public async speakColor(color: ColorItem) {
    window.speechSynthesis.cancel();
    const lang = this.currentLanguage();

    if (lang === 'en') {
      const utteranceEn = new SpeechSynthesisUtterance(color.nameEn);
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
            input: color.nameVi,
            speaker_id: '1',
            speed: '0.8'
          })
        });

        const data = await response.json();
        if (data && data.error_code === 0 && data.data?.url) {
          const audioUrl = data.data.url;
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
            }
            await new Promise(resolve => setTimeout(resolve, 500));
            retries--;
          }
          throw new Error("Timeout");
        }
        throw new Error("API Response is not valid");
      } catch (error) {
        console.error('Lỗi khi gọi API giọng đọc Zalo AI:', error);
        const utteranceVi = new SpeechSynthesisUtterance(color.nameVi);
        utteranceVi.lang = 'vi-VN';
        window.speechSynthesis.speak(utteranceVi);
      }
    }
  }
}
