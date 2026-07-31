import type { CharRecognizer, RecognizerFactory, Script } from './types.js';

/**
 * 認識器の登録・選択。
 *
 * ここを通すことで「実装を差し替える」がアプリ全体で 1 箇所の設定変更になる。
 * オフラインでない実装は allowOnline を明示しない限り選ばれない ―
 * 子供の筆跡が意図せず外部に出ることを型と実行時の両方で防ぐ。
 */
export class RecognizerRegistry {
  private readonly factories = new Map<string, RecognizerFactory>();

  register(factory: RecognizerFactory): this {
    if (this.factories.has(factory.id)) {
      throw new Error(`認識器 '${factory.id}' は既に登録されています`);
    }
    this.factories.set(factory.id, factory);
    return this;
  }

  list(): readonly RecognizerFactory[] {
    return [...this.factories.values()];
  }

  get(id: string): RecognizerFactory | undefined {
    return this.factories.get(id);
  }

  /**
   * 指定 ID の認識器を作る。
   * @throws 未登録、またはオフラインでない実装を許可なく選んだ場合
   */
  create(id: string, options: { allowOnline?: boolean } = {}): CharRecognizer {
    const factory = this.factories.get(id);
    if (!factory) {
      throw new Error(
        `認識器 '${id}' は未登録です（登録済み: ${[...this.factories.keys()].join(', ') || 'なし'}）`,
      );
    }
    if (!factory.capabilities.runsOffline && !options.allowOnline) {
      throw new Error(
        `認識器 '${id}' は画像を外部に送信します。保護者設定で明示的に許可してください`,
      );
    }
    return factory.create();
  }

  /**
   * 必要な文字種を扱える認識器のうち、優先順位が最も高いものを選ぶ。
   * 見つからなければ fallbackId を使う。
   */
  resolve(
    required: readonly Script[],
    preferredIds: readonly string[],
    fallbackId: string,
    options: { allowOnline?: boolean } = {},
  ): CharRecognizer {
    for (const id of preferredIds) {
      const factory = this.factories.get(id);
      if (!factory) continue;
      if (!factory.capabilities.runsOffline && !options.allowOnline) continue;
      const supportsAll = required.every((s) => factory.capabilities.supportedScripts.includes(s));
      if (supportsAll) return factory.create();
    }
    return this.create(fallbackId, options);
  }
}
