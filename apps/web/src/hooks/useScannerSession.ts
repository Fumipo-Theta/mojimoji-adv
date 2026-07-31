import { createDefaultRegistry, DummyRecognizer, type CharRecognizer } from '@mojimoji/recognition';
import type { EventBus } from '@mojimoji/protocol';
import { DummySheetDetector, type SheetDetector } from '@mojimoji/vision';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ScannerPrompt {
  readonly kind: 'element' | 'exact' | 'word';
  readonly requiredElement: string | null;
  readonly requiredChars: readonly string[];
  readonly sealedChars: readonly string[];
  readonly cellCount: number;
  readonly hintText: string;
  readonly timeLimitMs: number | null;
}

export interface ScannerFeedback {
  readonly accepted: boolean;
  readonly kind: string;
  readonly message: string;
}

export interface ScannerSession {
  readonly prompt: ScannerPrompt | null;
  readonly feedback: ScannerFeedback | null;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly recognizerId: string;
  /** ダミー入力（画面の五十音パレットから選んだ文字）を「紙に書いた」ものとして送る */
  readonly submit: (chars: readonly string[]) => Promise<void>;
}

/**
 * scanner 側の入力処理。
 *
 * ここが「紙 → 文字」の変換を担う唯一の場所で、カメラ画像はこの関数の外に出ない。
 * bus へ送るのは認識結果だけ。
 *
 * 検出器と認識器は IF 越しにしか触らないので、ダミーを実物（OpenCV 検出 + CNN）に
 * 差し替えても、この hook も UI も変更なしで動く。
 */
export function useScannerSession(bus: EventBus, recognizerId = 'dummy'): ScannerSession {
  const [prompt, setPrompt] = useState<ScannerPrompt | null>(null);
  const [feedback, setFeedback] = useState<ScannerFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const detectorRef = useRef<SheetDetector | null>(null);
  const recognizerRef = useRef<CharRecognizer | null>(null);

  // --- パイプラインの初期化 ---
  useEffect(() => {
    let disposed = false;
    const detector = new DummySheetDetector();
    const recognizer = createDefaultRegistry().create(recognizerId);

    void (async () => {
      await detector.init();
      await recognizer.init();
      if (disposed) {
        void detector.dispose();
        void recognizer.dispose();
        return;
      }
      detectorRef.current = detector;
      recognizerRef.current = recognizer;
      setReady(true);
    })();

    return () => {
      disposed = true;
      setReady(false);
      void detectorRef.current?.dispose();
      void recognizerRef.current?.dispose();
      detectorRef.current = null;
      recognizerRef.current = null;
    };
  }, [recognizerId]);

  // --- display からの指示を受け取る ---
  useEffect(() => {
    return bus.subscribe((message) => {
      if (message.type !== 'relay') return;
      const payload = message.payload;
      if (payload.type === 'prompt.set') {
        setPrompt({
          kind: payload.kind,
          requiredElement: payload.requiredElement,
          requiredChars: payload.requiredChars,
          sealedChars: payload.sealedChars,
          cellCount: payload.cellCount,
          hintText: payload.hintText,
          timeLimitMs: payload.timeLimitMs,
        });
        setFeedback(null);
      } else if (payload.type === 'feedback') {
        setFeedback({
          accepted: payload.accepted,
          kind: payload.kind,
          message: payload.message,
        });
        // 手元でも当たり外れが分かるように振動させる（対応端末のみ）
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate?.(payload.accepted ? 40 : [30, 60, 30]);
        }
      }
    });
  }, [bus]);

  const submit = useCallback(
    async (chars: readonly string[]) => {
      const detector = detectorRef.current;
      const recognizer = recognizerRef.current;
      if (!detector || !recognizer || chars.length === 0) return;

      setBusy(true);
      try {
        // ダミーモードでは「紙に何が書かれているか」を画面の入力で代用する。
        // 実装を差し替えたときは、この 2 行がカメラフレームの取得に置き換わる。
        if (detector instanceof DummySheetDetector) detector.setCellCount(chars.length);
        if (recognizer instanceof DummyRecognizer) recognizer.setPendingInput(chars);

        const detection = await detector.detect({ width: 0, height: 0, data: new Uint8ClampedArray() });
        if (!detection.ok) {
          bus.send({ type: 'scan.preview', ok: false, hint: detection.hint, confidence: 0 });
          return;
        }

        const results = await recognizer.recognize(detection.sheet.cells, { topK: 3 });
        bus.send({
          type: 'scan.result',
          sheetId: detection.sheet.sheetId,
          // 画像は含めない。ここを通るのは文字とスコアだけ
          cells: results.map((r) => ({
            index: r.index,
            candidates: r.candidates.map((c) => ({ char: c.char, confidence: c.confidence })),
            ...(r.quality === undefined ? {} : { quality: r.quality }),
          })),
          capturedAt: Date.now(),
        });
      } finally {
        setBusy(false);
      }
    },
    [bus],
  );

  return { prompt, feedback, busy, ready, recognizerId, submit };
}
