import { Injectable, signal } from '@angular/core';

export type GradeLevel = '1-2' | '3-5';
export type DifficultyLevel = 1 | 2 | 3; // 1: Cơ bản, 2: Vừa, 3: Thử thách

export interface MathProblem {
  expression: string;       // Ví dụ: "5 + 3", "7 × 6", "72 : 8"
  result: number;           // 8, 42, 9
  gradeLevel: GradeLevel;
  difficulty: DifficultyLevel;
  hintTextVi: string;       // Lời gợi ý cho bé bằng tiếng Việt
  hintTextEn: string;
}

export interface BottleProblem {
  colorId: string;
  hexCode: string;
  nameVi: string;
  nameEn: string;
  targetNumber: number;     // Số in trên mảng tranh tương ứng
  mathProblem: MathProblem; // Phép tính in trên thân lọ màu
}

export interface AdaptiveResult {
  difficultyChanged: boolean;
  newDifficulty: DifficultyLevel;
  messageVi: string;
  messageEn: string;
}

@Injectable({
  providedIn: 'root'
})
export class MathEngineService {
  // Trạng thái hiện tại của động cơ AI
  public readonly currentGrade = signal<GradeLevel>('1-2');
  public readonly currentDifficulty = signal<DifficultyLevel>(1);
  public readonly consecutiveCorrect = signal<number>(0);
  public readonly consecutiveWrong = signal<number>(0);

  /**
   * Đặt khối lớp và reset các chuỗi tính toán
   */
  public setGradeLevel(grade: GradeLevel) {
    this.currentGrade.set(grade);
    this.currentDifficulty.set(1);
    this.consecutiveCorrect.set(0);
    this.consecutiveWrong.set(0);
  }

  /**
   * Đặt trực tiếp độ khó nếu cần
   */
  public setDifficulty(level: DifficultyLevel) {
    this.currentDifficulty.set(level);
  }

  /**
   * Ghi nhận kết quả trả lời để AI tự động cân chỉnh độ khó thời gian thực
   */
  public recordAnswer(isCorrect: boolean, timeTakenSeconds?: number): AdaptiveResult {
    let difficultyChanged = false;
    let newDifficulty = this.currentDifficulty();
    let messageVi = '';
    let messageEn = '';

    if (isCorrect) {
      this.consecutiveWrong.set(0);
      const newStreak = this.consecutiveCorrect() + 1;
      this.consecutiveCorrect.set(newStreak);

      // Thưởng tăng độ khó: Nếu giải đúng liên tiếp >= 3 lần (hoặc giải cực nhanh < 5s)
      const isQuick = timeTakenSeconds !== undefined && timeTakenSeconds <= 5;
      if ((newStreak >= 3 || (newStreak >= 2 && isQuick)) && this.currentDifficulty() < 3) {
        newDifficulty = (this.currentDifficulty() + 1) as DifficultyLevel;
        this.currentDifficulty.set(newDifficulty);
        this.consecutiveCorrect.set(0);
        difficultyChanged = true;
        messageVi = '🌟 Tuyệt đỉnh! Bé tính nhanh như chớp! AI đã nâng cấp thử thách thú vị hơn!';
        messageEn = '🌟 Amazing! You solved it so fast! AI has leveled up the challenge!';
      }
    } else {
      this.consecutiveCorrect.set(0);
      const newWrong = this.consecutiveWrong() + 1;
      this.consecutiveWrong.set(newWrong);

      // Giảm độ khó để động viên nếu sai liên tiếp 2 lần
      if (newWrong >= 2 && this.currentDifficulty() > 1) {
        newDifficulty = (this.currentDifficulty() - 1) as DifficultyLevel;
        this.currentDifficulty.set(newDifficulty);
        this.consecutiveWrong.set(0);
        difficultyChanged = true;
        messageVi = '🌱 Đừng lo nhé! AI sẽ đổi các phép tính nhẹ nhàng hơn để bé học tốt hơn!';
        messageEn = '🌱 Don\'t worry! AI adjusted the math to be gentler for you!';
      }
    }

    return { difficultyChanged, newDifficulty, messageVi, messageEn };
  }

  /**
   * Phân bổ danh sách phép tính cho các lọ màu dựa trên số màu trích xuất được
   */
  /**
   * Phân bổ danh sách phép tính cho các lọ màu dựa trên số màu trích xuất được.
   * Sinh trực tiếp phép tính ngẫu nhiên tự nhiên theo chương trình học,
   * đáp án là kết quả thực tế của phép tính và độc nhất cho từng lọ màu.
   */
  public generateColorProblems(
    colors: { id: string; hexCode: string; nameVi: string; nameEn: string }[]
  ): BottleProblem[] {
    const grade = this.currentGrade();
    const difficulty = this.currentDifficulty();
    const usedResults = new Set<number>();

    return colors.map((c) => {
      let mathProblem: MathProblem;
      let attempts = 0;
      do {
        mathProblem = this.generateRandomProblem(grade, difficulty, usedResults);
        attempts++;
      } while (usedResults.has(mathProblem.result) && attempts < 100);

      // Dự phòng nếu hiếm hoi bị trùng sau 100 lần thử
      if (usedResults.has(mathProblem.result)) {
        let fallbackResult = mathProblem.result + 1;
        while (usedResults.has(fallbackResult)) {
          fallbackResult++;
        }
        mathProblem = this.generateProblemForTarget(fallbackResult, grade, difficulty);
      }

      usedResults.add(mathProblem.result);

      return {
        colorId: c.id,
        hexCode: c.hexCode,
        nameVi: c.nameVi,
        nameEn: c.nameEn,
        targetNumber: mathProblem.result,
        mathProblem
      };
    });
  }

  /**
   * Sinh lại phép tính mới cho một màu (khi AI tăng/giảm độ khó)
   */
  public regenerateProblemForBottle(bottle: BottleProblem): BottleProblem {
    const grade = this.currentGrade();
    const difficulty = this.currentDifficulty();
    const mathProblem = this.generateProblemForTarget(bottle.targetNumber, grade, difficulty);
    return {
      ...bottle,
      mathProblem
    };
  }

  /**
   * Sinh ngẫu nhiên một bài toán tự nhiên phù hợp với khối lớp và độ khó
   */
  public generateRandomProblem(grade: GradeLevel, difficulty: DifficultyLevel, usedResults?: Set<number>): MathProblem {
    if (grade === '1-2') {
      return this.generateRandomGrade12Problem(difficulty, usedResults);
    } else {
      return this.generateRandomGrade35Problem(difficulty, usedResults);
    }
  }

  /**
   * Sinh ngẫu nhiên bài toán tự nhiên cho Lớp 1 - 2
   */
  private generateRandomGrade12Problem(difficulty: DifficultyLevel, usedResults?: Set<number>): MathProblem {
    for (let attempt = 0; attempt < 50; attempt++) {
      const isAdd = Math.random() < 0.55;

      if (difficulty === 1) {
        // Cấp 1: Cộng trừ trong phạm vi 10
        if (isAdd) {
          const a = Math.floor(Math.random() * 8) + 1; // 1..8
          const b = Math.floor(Math.random() * (10 - a)) + 1;
          const result = a + b;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${a} + ${b}`,
              result,
              gradeLevel: '1-2',
              difficulty: 1,
              hintTextVi: `${a} cộng với ${b} bằng bao nhiêu nhỉ?`,
              hintTextEn: `What is ${a} plus ${b}?`
            };
          }
        } else {
          const result = Math.floor(Math.random() * 8) + 1;
          const b = Math.floor(Math.random() * (10 - result)) + 1;
          const a = result + b;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${a} - ${b}`,
              result,
              gradeLevel: '1-2',
              difficulty: 1,
              hintTextVi: `${a} trừ đi ${b} còn lại mấy bé ơi?`,
              hintTextEn: `What is ${a} minus ${b}?`
            };
          }
        }
      } else if (difficulty === 2) {
        // Cấp 2: Cộng trừ trong phạm vi 20
        if (isAdd) {
          const a = Math.floor(Math.random() * 12) + 2; // 2..13
          const b = Math.floor(Math.random() * (20 - a)) + 1;
          const result = a + b;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${a} + ${b}`,
              result,
              gradeLevel: '1-2',
              difficulty: 2,
              hintTextVi: `Bé tính xem ${a} + ${b} bằng mấy nhé!`,
              hintTextEn: `Calculate ${a} + ${b}!`
            };
          }
        } else {
          const result = Math.floor(Math.random() * 15) + 2;
          const b = Math.floor(Math.random() * 8) + 2;
          const a = result + b;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${a} - ${b}`,
              result,
              gradeLevel: '1-2',
              difficulty: 2,
              hintTextVi: `Lấy ${a} bớt đi ${b} thì được bao nhiêu nè?`,
              hintTextEn: `Take ${b} from ${a}, what do you get?`
            };
          }
        }
      } else {
        // Cấp 3: Tròn chục hoặc cộng trừ phạm vi 100
        const isTens = Math.random() < 0.5;
        if (isTens) {
          const aTens = (Math.floor(Math.random() * 7) + 1) * 10;
          const bTens = (Math.floor(Math.random() * ((90 - aTens) / 10)) + 1) * 10;
          const result = aTens + bTens;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${aTens} + ${bTens}`,
              result,
              gradeLevel: '1-2',
              difficulty: 3,
              hintTextVi: `Cộng tròn chục: ${aTens} + ${bTens} bằng bao nhiêu nào?`,
              hintTextEn: `Add tens: ${aTens} + ${bTens}?`
            };
          }
        } else {
          const a = Math.floor(Math.random() * 40) + 15;
          const b = Math.floor(Math.random() * 25) + 5;
          const result = a + b;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `${a} + ${b}`,
              result,
              gradeLevel: '1-2',
              difficulty: 3,
              hintTextVi: `Thử thách tính nhẩm: ${a} + ${b} bằng mấy?`,
              hintTextEn: `Math challenge: ${a} + ${b}?`
            };
          }
        }
      }
    }

    // Mặc định fallback
    return {
      expression: '3 + 4',
      result: 7,
      gradeLevel: '1-2',
      difficulty,
      hintTextVi: '3 cộng 4 bằng bao nhiêu nhỉ?',
      hintTextEn: 'What is 3 plus 4?'
    };
  }

  /**
   * Sinh ngẫu nhiên bài toán tự nhiên cho Lớp 3 - 5
   * Các số được sinh tự do, ngẫu nhiên theo chuẩn SGK Tiểu học,
   * không bị ép theo công thức rập khuôn hay số dư chia hết.
   */
  private generateRandomGrade35Problem(difficulty: DifficultyLevel, usedResults?: Set<number>): MathProblem {
    // Tùy theo độ khó, chọn tập dạng toán phong phú
    // Dạng:
    // 0: Bảng nhân 1 bước (a × b)
    // 1: Bảng chia 1 bước (a : b)
    // 2: Biểu thức 2 bước: Nhân + Cộng (a × b + c) với c ngẫu nhiên tự do
    // 3: Biểu thức 2 bước: Nhân - Trừ (a × b - c) với c ngẫu nhiên tự do
    // 4: Biểu thức 2 bước: Chia + Cộng (a : b + c)
    // 5: Biểu thức có dấu ngoặc tròn: (a + b) × c hoặc (a - b) × c
    // 6: Phân số của một số: 1/2, 1/3, 1/4 của một số

    for (let attempt = 0; attempt < 80; attempt++) {
      let problemType: number;
      if (difficulty === 1) {
        // Cấp 1: Chủ yếu bảng nhân, bảng chia và biểu thức nhân cộng/trừ nhỏ
        const choices = [0, 0, 1, 1, 2, 3];
        problemType = choices[Math.floor(Math.random() * choices.length)];
      } else if (difficulty === 2) {
        // Cấp 2: Đa dạng biểu thức 2 bước và dấu ngoặc
        const choices = [0, 1, 2, 3, 4, 5];
        problemType = choices[Math.floor(Math.random() * choices.length)];
      } else {
        // Cấp 3: Biểu thức 2 bước, dấu ngoặc và phân số
        const choices = [2, 3, 4, 5, 5, 6, 6];
        problemType = choices[Math.floor(Math.random() * choices.length)];
      }

      // 0: Phép nhân 1 bước trong bảng cửu chương
      if (problemType === 0) {
        const a = Math.floor(Math.random() * 8) + 2; // 2..9
        const b = Math.floor(Math.random() * 8) + 2; // 2..9
        const result = a * b;
        if (!usedResults || !usedResults.has(result)) {
          return {
            expression: `${a} × ${b}`,
            result,
            gradeLevel: '3-5',
            difficulty: 1,
            hintTextVi: `Bảng nhân: ${a} nhân ${b} bằng bao nhiêu?`,
            hintTextEn: `Multiplication: ${a} times ${b}?`
          };
        }
      }

      // 1: Phép chia 1 bước trong bảng chia
      if (problemType === 1) {
        const divisor = Math.floor(Math.random() * 8) + 2; // 2..9
        const quotient = Math.floor(Math.random() * 8) + 2; // 2..9
        const dividend = divisor * quotient;
        const result = quotient;
        if (!usedResults || !usedResults.has(result)) {
          return {
            expression: `${dividend} : ${divisor}`,
            result,
            gradeLevel: '3-5',
            difficulty: 1,
            hintTextVi: `Bảng chia: ${dividend} chia cho ${divisor} bằng mấy?`,
            hintTextEn: `Division: ${dividend} divided by ${divisor}?`
          };
        }
      }

      // 2: Biểu thức: a × b + c (c tự do hoàn toàn, từ 1..15)
      if (problemType === 2) {
        const a = Math.floor(Math.random() * 8) + 2; // 2..9
        const b = Math.floor(Math.random() * 8) + 2; // 2..9
        const c = Math.floor(Math.random() * 15) + 1; // 1..15 hoàn toàn ngẫu nhiên
        const result = a * b + c;
        if (!usedResults || !usedResults.has(result)) {
          return {
            expression: `${a} × ${b} + ${c}`,
            result,
            gradeLevel: '3-5',
            difficulty: 2,
            hintTextVi: `Biểu thức 2 bước: Tính ${a} × ${b} rồi cộng với ${c} nhé!`,
            hintTextEn: `Calculate: ${a} × ${b} + ${c}`
          };
        }
      }

      // 3: Biểu thức: a × b - c (c tự do hoàn toàn)
      if (problemType === 3) {
        const a = Math.floor(Math.random() * 7) + 3; // 3..9
        const b = Math.floor(Math.random() * 7) + 3; // 3..9
        const maxC = Math.min(15, a * b - 3);
        const c = Math.floor(Math.random() * maxC) + 1;
        const result = a * b - c;
        if (result > 0 && (!usedResults || !usedResults.has(result))) {
          return {
            expression: `${a} × ${b} - ${c}`,
            result,
            gradeLevel: '3-5',
            difficulty: 2,
            hintTextVi: `Biểu thức 2 bước: Lấy ${a} × ${b} rồi trừ đi ${c} nào!`,
            hintTextEn: `Calculate: ${a} × ${b} - ${c}`
          };
        }
      }

      // 4: Biểu thức: a : b + c
      if (problemType === 4) {
        const divisor = Math.floor(Math.random() * 8) + 2; // 2..9
        const k = Math.floor(Math.random() * 8) + 2; // 2..9
        const dividend = divisor * k;
        const c = Math.floor(Math.random() * 18) + 2; // 2..19
        const result = k + c;
        if (!usedResults || !usedResults.has(result)) {
          return {
            expression: `${dividend} : ${divisor} + ${c}`,
            result,
            gradeLevel: '3-5',
            difficulty: 2,
            hintTextVi: `Thực hiện phép tính: ${dividend} : ${divisor} + ${c} bằng mấy?`,
            hintTextEn: `Calculate: ${dividend} : ${divisor} + ${c}`
          };
        }
      }

      // 5: Biểu thức có dấu ngoặc: (a + b) × c hoặc (a - b) × c
      if (problemType === 5) {
        const isAdd = Math.random() < 0.6;
        if (isAdd) {
          const a = Math.floor(Math.random() * 6) + 1; // 1..6
          const b = Math.floor(Math.random() * 6) + 1; // 1..6
          const c = Math.floor(Math.random() * 5) + 2; // 2..6
          const result = (a + b) * c;
          if (result <= 85 && (!usedResults || !usedResults.has(result))) {
            return {
              expression: `(${a} + ${b}) × ${c}`,
              result,
              gradeLevel: '3-5',
              difficulty: 3,
              hintTextVi: `Thực hiện trong ngoặc trước: (${a} + ${b}) rồi nhân ${c} nhé!`,
              hintTextEn: `Calculate inside brackets first: (${a} + ${b}) × ${c}`
            };
          }
        } else {
          const diff = Math.floor(Math.random() * 6) + 2; // 2..7
          const b = Math.floor(Math.random() * 8) + 2;    // 2..9
          const a = b + diff;
          const c = Math.floor(Math.random() * 5) + 2;    // 2..6
          const result = diff * c;
          if (!usedResults || !usedResults.has(result)) {
            return {
              expression: `(${a} - ${b}) × ${c}`,
              result,
              gradeLevel: '3-5',
              difficulty: 3,
              hintTextVi: `Thực hiện trong ngoặc trước: (${a} - ${b}) rồi nhân ${c} nhé!`,
              hintTextEn: `Calculate inside brackets first: (${a} - ${b}) × ${c}`
            };
          }
        }
      }

      // 6: Tìm phân số của một số (Lớp 4)
      if (problemType === 6) {
        const fractions = [
          { denom: 2, labelVi: '1/2 của', labelEn: '1/2 of' },
          { denom: 3, labelVi: '1/3 của', labelEn: '1/3 of' },
          { denom: 4, labelVi: '1/4 của', labelEn: '1/4 of' },
          { denom: 5, labelVi: '1/5 của', labelEn: '1/5 of' }
        ];
        const frac = fractions[Math.floor(Math.random() * fractions.length)];
        const k = Math.floor(Math.random() * 15) + 3; // kết quả 3..17
        const total = frac.denom * k;
        const result = k;
        if (total <= 90 && (!usedResults || !usedResults.has(result))) {
          return {
            expression: `${frac.labelVi} ${total}`,
            result,
            gradeLevel: '3-5',
            difficulty: 3,
            hintTextVi: `Tìm phân số của một số: Lấy ${total} chia cho ${frac.denom} nhé!`,
            hintTextEn: `Find fraction of a number: ${frac.labelEn} ${total}!`
          };
        }
      }
    }

    // Fallback ngẫu nhiên đẹp
    const fallbackA = Math.floor(Math.random() * 6) + 3;
    const fallbackB = Math.floor(Math.random() * 6) + 3;
    return {
      expression: `${fallbackA} × ${fallbackB}`,
      result: fallbackA * fallbackB,
      gradeLevel: '3-5',
      difficulty,
      hintTextVi: `Bảng nhân: ${fallbackA} × ${fallbackB} bằng bao nhiêu?`,
      hintTextEn: `Multiplication: ${fallbackA} times ${fallbackB}?`
    };
  }

  /**
   * Sinh một phép tính khớp với số kết quả mục tiêu (target) nếu cần thiết
   */
  public generateProblemForTarget(target: number, grade: GradeLevel, difficulty: DifficultyLevel): MathProblem {
    if (grade === '1-2') {
      return this.generateGrade12Problem(target, difficulty);
    } else {
      return this.generateGrade35Problem(target, difficulty);
    }
  }

  /**
   * Sinh phép tính cho Lớp 1 - 2 theo số target cố định
   */
  private generateGrade12Problem(target: number, difficulty: DifficultyLevel): MathProblem {
    const isAddition = Math.random() < 0.6;

    if (difficulty === 1) {
      if (isAddition && target > 1) {
        const a = Math.floor(Math.random() * (target - 1)) + 1;
        const b = target - a;
        return {
          expression: `${a} + ${b}`,
          result: target,
          gradeLevel: '1-2',
          difficulty: 1,
          hintTextVi: `${a} cộng với ${b} bằng bao nhiêu nhỉ?`,
          hintTextEn: `What is ${a} plus ${b}?`
        };
      } else {
        const b = Math.floor(Math.random() * 4) + 1;
        const a = target + b;
        return {
          expression: `${a} - ${b}`,
          result: target,
          gradeLevel: '1-2',
          difficulty: 1,
          hintTextVi: `${a} trừ đi ${b} còn lại mấy bé ơi?`,
          hintTextEn: `What is ${a} minus ${b}?`
        };
      }
    } else if (difficulty === 2) {
      if (isAddition && target > 2) {
        const a = Math.floor(Math.random() * (target - 2)) + 1;
        const b = target - a;
        return {
          expression: `${a} + ${b}`,
          result: target,
          gradeLevel: '1-2',
          difficulty: 2,
          hintTextVi: `Bé tính xem ${a} + ${b} bằng mấy nhé!`,
          hintTextEn: `Calculate ${a} + ${b}!`
        };
      } else {
        const b = Math.floor(Math.random() * 8) + 2;
        const a = target + b;
        return {
          expression: `${a} - ${b}`,
          result: target,
          gradeLevel: '1-2',
          difficulty: 2,
          hintTextVi: `Lấy ${a} bớt đi ${b} thì được bao nhiêu nè?`,
          hintTextEn: `Take ${b} from ${a}, what do you get?`
        };
      }
    } else {
      if (isAddition) {
        if (target >= 20 && target % 10 === 0) {
          const aTens = (Math.floor(Math.random() * (target / 10 - 1)) + 1) * 10;
          const bTens = target - aTens;
          return {
            expression: `${aTens} + ${bTens}`,
            result: target,
            gradeLevel: '1-2',
            difficulty: 3,
            hintTextVi: `Cộng tròn chục: ${aTens} + ${bTens} bằng bao nhiêu nào?`,
            hintTextEn: `Add tens: ${aTens} + ${bTens}?`
          };
        } else {
          const a = Math.floor(Math.random() * (target - 5)) + 5;
          const b = target - a;
          return {
            expression: `${a} + ${b}`,
            result: target,
            gradeLevel: '1-2',
            difficulty: 3,
            hintTextVi: `Thử thách tính nhẩm: ${a} + ${b} bằng mấy?`,
            hintTextEn: `Math challenge: ${a} + ${b}?`
          };
        }
      } else {
        const maxB = Math.min(30, 99 - target);
        const b = Math.floor(Math.random() * (maxB - 9)) + 10;
        const a = target + b;
        return {
          expression: `${a} - ${b}`,
          result: target,
          gradeLevel: '1-2',
          difficulty: 3,
          hintTextVi: `Trừ số lớn: ${a} trừ đi ${b} còn lại mấy?`,
          hintTextEn: `Subtraction: ${a} - ${b}?`
        };
      }
    }
  }

  /**
   * Sinh phép tính tự nhiên cho Lớp 3 - 5 theo số target cố định
   */
  private generateGrade35Problem(target: number, difficulty: DifficultyLevel): MathProblem {
    // 1. Thử tìm phép nhân đẹp: a × b = target (a, b trong khoảng 2..9)
    const factors: number[] = [];
    for (let i = 2; i <= 9; i++) {
      if (target % i === 0 && (target / i) >= 2 && (target / i) <= 9) {
        factors.push(i);
      }
    }
    if (factors.length > 0 && Math.random() < 0.5) {
      const a = factors[Math.floor(Math.random() * factors.length)];
      const b = target / a;
      return {
        expression: `${a} × ${b}`,
        result: target,
        gradeLevel: '3-5',
        difficulty: 1,
        hintTextVi: `Bảng nhân: ${a} nhân ${b} bằng bao nhiêu?`,
        hintTextEn: `Multiplication: ${a} times ${b}?`
      };
    }

    // 2. Thử dạng biểu thức 2 bước tự nhiên: a × b + c hoặc a × b - c với c nhỏ (1..9)
    for (const c of [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)) {
      // Thử target - c = a * b
      const remPlus = target - c;
      if (remPlus >= 4) {
        for (let a = 2; a <= 9; a++) {
          if (remPlus % a === 0) {
            const b = remPlus / a;
            if (b >= 2 && b <= 9) {
              return {
                expression: `${a} × ${b} + ${c}`,
                result: target,
                gradeLevel: '3-5',
                difficulty: 2,
                hintTextVi: `Biểu thức 2 bước: ${a} × ${b} cộng ${c} bằng mấy nào?`,
                hintTextEn: `Two steps: ${a} × ${b} + ${c}?`
              };
            }
          }
        }
      }

      // Thử target + c = a * b
      const remMinus = target + c;
      if (remMinus <= 81) {
        for (let a = 2; a <= 9; a++) {
          if (remMinus % a === 0) {
            const b = remMinus / a;
            if (b >= 2 && b <= 9) {
              return {
                expression: `${a} × ${b} - ${c}`,
                result: target,
                gradeLevel: '3-5',
                difficulty: 2,
                hintTextVi: `Biểu thức 2 bước: ${a} × ${b} trừ ${c} bằng mấy nào?`,
                hintTextEn: `Two steps: ${a} × ${b} - ${c}?`
              };
            }
          }
        }
      }
    }

    // 3. Thử phép chia: a : b = target
    const possibleDivisors = [2, 3, 4, 5, 6, 7, 8, 9].filter(d => target * d <= 90);
    if (possibleDivisors.length > 0) {
      const divisor = possibleDivisors[Math.floor(Math.random() * possibleDivisors.length)];
      const dividend = target * divisor;
      return {
        expression: `${dividend} : ${divisor}`,
        result: target,
        gradeLevel: '3-5',
        difficulty: 1,
        hintTextVi: `Bảng chia: ${dividend} chia cho ${divisor} bằng mấy?`,
        hintTextEn: `Division: ${dividend} divided by ${divisor}?`
      };
    }

    // 4. Fallback cộng 2 số tự nhiên
    const half = Math.floor(target / 2);
    const rem = target - half;
    return {
      expression: `${half} + ${rem}`,
      result: target,
      gradeLevel: '3-5',
      difficulty: 1,
      hintTextVi: `Phép tính: ${half} + ${rem} bằng bao nhiêu?`,
      hintTextEn: `Addition: ${half} + ${rem}?`
    };
  }

  /**
   * Tạo câu thoại cổ vũ của Bạn AI dựa trên chuỗi thành tích
   */
  public getEncouragement(streak: number, lang: 'vi' | 'en' = 'vi'): string {
    if (lang === 'vi') {
      if (streak <= 1) return 'Chính xác rồi! Bé tính giỏi quá!';
      if (streak === 2) return 'Tiếp tục phát huy nào! 2 mảng màu liên tiếp rồi!';
      if (streak >= 3) return `🌟 Đỉnh chóp! Chuỗi ${streak} câu đúng liên tiếp! Bé siêu thông minh!`;
      return 'Bé làm tốt lắm!';
    } else {
      if (streak <= 1) return 'Correct! Great job calculating!';
      if (streak === 2) return 'Keep it up! 2 in a row!';
      if (streak >= 3) return `🌟 Fantastic! Streak of ${streak} correct answers!`;
      return 'Well done!';
    }
  }

  /**
   * Tạo câu gợi ý khi bé rê chuột tới mảng tranh hoặc đứng yên > 8s
   */
  public getHintForTargetNumber(targetNumber: number, lang: 'vi' | 'en' = 'vi'): string {
    if (lang === 'vi') {
      return `Mảng tranh này mang số ${targetNumber}. Bé hãy tính nhẩm trên các lọ màu xem lọ nào có kết quả bằng ${targetNumber} nhé!`;
    } else {
      return `This section has number ${targetNumber}. Check the paint bottles to find which calculation equals ${targetNumber}!`;
    }
  }
}
