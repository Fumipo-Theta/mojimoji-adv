export * from './types.js';
export { RecognizerRegistry } from './registry.js';
export { blankCell, inkedCell, type RecognizerContractHarness } from './contract.js';
export {
  DummyRecognizer,
  dummyRecognizerFactory,
  type DummyRecognizerOptions,
} from './recognizers/dummy.js';

import { RecognizerRegistry } from './registry.js';
import { dummyRecognizerFactory } from './recognizers/dummy.js';

/**
 * 既定のレジストリ。
 * 新しい認識器を実装したらここに register を足すだけで保護者設定に現れる。
 */
export function createDefaultRegistry(): RecognizerRegistry {
  return new RecognizerRegistry().register(dummyRecognizerFactory);
}
