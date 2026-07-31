import { describe, expect, it } from 'vitest';
import { blankCell, inkedCell, type RecognizerContractHarness } from './contract.js';
import { DummyRecognizer, dummyRecognizerFactory } from './recognizers/dummy.js';
import type { CharRecognizer } from './types.js';

/**
 * CharRecognizer の契約テスト。
 *
 * これが CharRecognizer IF の実質的な仕様書。新しい認識器（TemplateRecognizer,
 * TfjsCnnRecognizer, ...）を追加したら、必ずここに harness を足して緑にすること。
 * 実装を差し替えてもゲーム側が壊れないことは、この一群のテストが担保する。
 */
export function describeRecognizerContract(harness: RecognizerContractHarness): void {
  const { factory } = harness;

  describe(`CharRecognizer 契約: ${factory.id}`, () => {
    async function withRecognizer<T>(fn: (r: CharRecognizer) => Promise<T>): Promise<T> {
      const recognizer = factory.create();
      await recognizer.init();
      try {
        return await fn(recognizer);
      } finally {
        await recognizer.dispose();
      }
    }

    it('factory の id と capabilities がインスタンスと一致する', async () => {
      await withRecognizer(async (r) => {
        expect(r.id).toBe(factory.id);
        expect(r.capabilities).toEqual(factory.capabilities);
      });
    });

    it('capabilities が自己矛盾していない', () => {
      const c = factory.capabilities;
      expect(c.supportedScripts.length).toBeGreaterThan(0);
      expect(c.maxCellsPerCall).toBeGreaterThan(0);
      expect(c.typicalLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('init() の進捗コールバックが最後に 1 を報告する', async () => {
      const recognizer = factory.create();
      const progress: number[] = [];
      await recognizer.init((r) => progress.push(r));
      await recognizer.dispose();
      expect(progress.at(-1)).toBe(1);
      expect(progress.every((p) => p >= 0 && p <= 1)).toBe(true);
    });

    it('入力マスと同数・同じ index の結果を返す', async () => {
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ', 'い']);
        const results = await r.recognize(cells);
        expect(results).toHaveLength(cells.length);
        expect(results.map((x) => x.index)).toEqual(cells.map((c) => c.index));
      });
    });

    it('未記入マスには候補を返さない', async () => {
      await withRecognizer(async (r) => {
        const results = await r.recognize([blankCell(0), blankCell(1)]);
        expect(results.every((x) => x.candidates.length === 0)).toBe(true);
      });
    });

    it('候補は confidence の降順で、値は 0..1 に収まる', async () => {
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ', 'か', 'さ']);
        const results = await r.recognize(cells, { topK: 3 });
        for (const result of results) {
          const values = result.candidates.map((c) => c.confidence);
          expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
          expect([...values].sort((a, b) => b - a)).toEqual(values);
        }
      });
    });

    it('候補は必ず 1 文字である', async () => {
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ']);
        const results = await r.recognize(cells);
        for (const result of results) {
          for (const candidate of result.candidates) {
            expect([...candidate.char]).toHaveLength(1);
          }
        }
      });
    });

    it('topK を超える候補を返さない', async () => {
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ']);
        const results = await r.recognize(cells, { topK: 2 });
        expect(results.every((x) => x.candidates.length <= 2)).toBe(true);
      });
    });

    it('charset を指定したら必ずその集合内の文字だけを返す（ハード制約）', async () => {
      await withRecognizer(async (r) => {
        const charset = ['か', 'き', 'く', 'け', 'こ'];
        // 集合外の文字を「書いた」場合でも、集合外の候補が漏れてはいけない
        const cells = await harness.prepare(r, ['あ']);
        const results = await r.recognize(cells, { charset, topK: 3 });
        for (const result of results) {
          for (const candidate of result.candidates) {
            expect(charset).toContain(candidate.char);
          }
        }
      });
    });

    it('supportsQualityScore が true なら認識できたマスに quality が付く', async () => {
      if (!factory.capabilities.supportsQualityScore) return;
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ']);
        const results = await r.recognize(cells);
        for (const result of results) {
          if (result.candidates.length === 0) continue;
          expect(result.quality).toBeTypeOf('number');
          expect(result.quality).toBeGreaterThanOrEqual(0);
          expect(result.quality).toBeLessThanOrEqual(1);
        }
      });
    });

    it('maxCellsPerCall を超えたら例外を投げる', async () => {
      await withRecognizer(async (r) => {
        const tooMany = Array.from({ length: r.capabilities.maxCellsPerCall + 1 }, (_, i) =>
          inkedCell(i),
        );
        await expect(r.recognize(tooMany)).rejects.toThrow();
      });
    });

    it('中断済みの AbortSignal を渡したら例外を投げる', async () => {
      await withRecognizer(async (r) => {
        const cells = await harness.prepare(r, ['あ']);
        await expect(r.recognize(cells, { signal: AbortSignal.abort() })).rejects.toThrow();
      });
    });

    it('dispose() 後に再度 init() できる', async () => {
      const recognizer = factory.create();
      await recognizer.init();
      await recognizer.dispose();
      await expect(recognizer.init()).resolves.toBeUndefined();
      await recognizer.dispose();
    });

    it.runIf(harness.expectsAccuracy)('サンプル文字を Top-1 で当てられる', async () => {
      await withRecognizer(async (r) => {
        const chars = harness.sampleChars ?? ['あ', 'い', 'う'];
        const cells = await harness.prepare(r, chars);
        const results = await r.recognize(cells);
        const recognized = results
          .filter((x) => x.candidates.length > 0)
          .map((x) => x.candidates[0]?.char);
        expect(recognized).toEqual([...chars]);
      });
    });
  });
}

// --- 実装ごとのハーネス登録 ---

describeRecognizerContract({
  factory: dummyRecognizerFactory,
  expectsAccuracy: true,
  sampleChars: ['あ', 'ん', 'ぱ'],
  async prepare(recognizer, chars) {
    // ダミーは画面パレットからの入力を模すので、setPendingInput で「書いた文字」を渡す
    (recognizer as DummyRecognizer).setPendingInput(chars);
    return chars.map((_, i) => inkedCell(i));
  },
});
