import { expect, test, type Page } from '@playwright/test';

/**
 * M1 の完了条件: ダミー認識でバトル 1 本が最後まで通ること。
 *
 * 「さ」は みず属性 ＝ ほのお属性の敵（ヒケシ）の弱点。
 * パレットから選ぶ操作が、紙に書いてスキャンする操作の代わりになっている。
 */

async function startSolo(page: Page): Promise<void> {
  await page.goto('/?role=solo');
  await expect(page.getByRole('heading', { name: 'もじもじアドベンチャー' })).toBeVisible();
  // イントロが自動で明けて、出題が出るまで待つ
  await expect(page.locator('.prompt-text')).toContainText('にがて');
}

/** 五十音パレットから 1 文字選ぶ = 紙に 1 文字書いてスキャンする */
async function write(page: Page, char: string): Promise<void> {
  await page.locator('.kana', { hasText: new RegExp(`^${char}`) }).first().click();
}

function enemyHp(page: Page): Promise<number> {
  return page
    .locator('.stage-enemy .hpbar-label')
    .innerText()
    .then((text) => Number(text.split('/')[0]?.trim() ?? '0'));
}

test('弱点の文字でダメージが入り、勝利まで到達できる', async ({ page }) => {
  await startSolo(page);
  const before = await enemyHp(page);

  await write(page, 'さ');
  await expect(page.locator('.outcome-hit')).toBeVisible();
  expect(await enemyHp(page)).toBeLessThan(before);

  // 勝つまで弱点属性の文字を書き続ける
  for (let i = 0; i < 20; i++) {
    if (await page.locator('.prompt-text.win').isVisible()) break;
    const kana = page.locator('.kana', { hasText: /^さ/ }).first();
    if (await kana.isEnabled()) await kana.click();
    await page.waitForTimeout(400);
  }

  await expect(page.locator('.prompt-text.win')).toContainText('かった');
  expect(await enemyHp(page)).toBe(0);
});

test('属性ちがいの文字ではダメージが入らず、何を書いたか教えてくれる', async ({ page }) => {
  await startSolo(page);
  const before = await enemyHp(page);

  await write(page, 'か'); // ほのお属性。ほのおの敵には効かない
  await expect(page.locator('.outcome-wrong-char')).toContainText('か');
  expect(await enemyHp(page)).toBe(before);
});

test('失敗しても HP が減らない（失敗を罰しない）', async ({ page }) => {
  await startSolo(page);
  const playerHp = await page
    .locator('.stage-player .hpbar-label')
    .innerText()
    .then((t) => t.split('/')[0]?.trim());

  await write(page, 'か');
  await page.waitForTimeout(1200);

  await expect(page.locator('.stage-player .hpbar-label')).toContainText(`${playerHp} /`);
});

test('書いた文字が図鑑に登録され、リロード後も残る', async ({ page }) => {
  await startSolo(page);
  await write(page, 'さ');
  await expect(page.locator('.outcome-hit')).toBeVisible();

  await page.getByRole('button', { name: 'ずかん' }).click();
  const cell = page.locator('.zukan-cell.known', { hasText: 'さ' }).first();
  await expect(cell).toBeVisible();
  await expect(cell).toContainText('Lv.');

  // セーブが効いているか
  await page.reload();
  await page.getByRole('button', { name: 'ずかん' }).click();
  await expect(page.locator('.zukan-cell.known', { hasText: 'さ' }).first()).toBeVisible();
});

test('封印された文字は選べない', async ({ page }) => {
  await page.goto('/?role=solo');
  await page.getByRole('button', { name: /ツチケシ/ }).click();
  await expect(page.locator('.prompt-text')).not.toBeEmpty();

  // ツチケシは「な」を封印している
  await expect(page.locator('.kana-sealed', { hasText: /^な/ }).first()).toBeDisabled();
});

test('2 台モード: スマホ側の入力が PC 側のバトルに反映される', async ({ browser }) => {
  const room = '4321';
  const context = await browser.newContext();
  const display = await context.newPage();
  const scanner = await context.newPage();

  await display.goto(`/?role=display&room=${room}`);
  await expect(display.locator('.room-code')).toContainText(room);
  await expect(display.locator('.prompt-text')).toContainText('にがて');
  const before = await enemyHp(display);

  await scanner.goto(`/?role=scanner&room=${room}`);
  // display から出題が届くまで待つ
  await expect(scanner.locator('.palette')).toBeVisible({ timeout: 15_000 });

  await scanner.locator('.kana', { hasText: /^さ/ }).first().click();

  // スキャナ側の入力が表示端末のバトルを動かす
  await expect(display.locator('.outcome-hit')).toBeVisible({ timeout: 10_000 });
  expect(await enemyHp(display)).toBeLessThan(before);

  // 判定結果がスキャナ側にも返る
  await expect(scanner.locator('.scanner-feedback.ok')).toBeVisible();

  await context.close();
});
