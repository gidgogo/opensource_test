// 두 사람이 같은 보드에 들어와 쓰는 상황을 브라우저 두 개로 자동 확인한다
// 사용법 (서버 3개를 켠 상태에서):
//   node e2e.mjs 보드이름 build   → 카드/실시간/트리/이미지/Studio 수집까지 만들며 확인
//   (자료 서버, 동기화 서버를 껐다 켠 뒤)
//   node e2e.mjs 보드이름 check   → 다 남아있는지 확인
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = 'http://localhost:5173/?board=' + (process.argv[2] ?? 'test');
const phase = process.argv[3] ?? 'build'; // build | check
const shot = (p, n) => p.screenshot({ path: `${n}.png` }); // 결과 화면을 e2e/ 에 png로 남긴다
const ok = (cond, msg) => { if (!cond) throw new Error('FAIL: ' + msg); console.log('  ✓', msg); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`[${name} pageerror]`, e.message));
  p.on('console', (m) => m.type() === 'error' && console.log(`[${name} console]`, m.text()));
  p.answers = [];
  p.on('dialog', (d) => d.accept(p.answers.shift() ?? ''));
  await p.goto(URL);
  await p.locator('.topbar input').fill(name);
  await p.waitForSelector('.status.ok >> text=연결됨');
  return p;
}

const A = await user('성수');
const B = await user('민수');

if (phase === 'build') {
  console.log('1. 웹 ↔ 서버');
  await A.waitForSelector('[data-testid=health] >> text=ok');
  ok(true, '자료 서버 ok 표시');
  ok(await A.locator('.peer').count() === 2, '접속자 2명 표시');

  console.log('2-3. 기능 카드 만들기 + 실시간');
  await A.click('text=+ 기능 카드');
  await A.locator('.feature .title').fill('보스 2페이즈');
  await B.waitForFunction(() => document.querySelector('.feature .title')?.value === '보스 2페이즈');
  ok(true, 'B 화면에 A가 만든 기능 카드 + 제목');
  await A.locator('input[placeholder^="예: 2페이즈"]').fill('돌진 공격 추가');
  await A.locator('input[placeholder^="예: 2페이즈"]').press('Enter');
  // 동시에: A는 체크리스트, B는 변경점
  await Promise.all([
    (async () => { await A.locator('input[placeholder^="합의할 것"]').fill('보스 체력 5000'); await A.locator('input[placeholder^="합의할 것"]').press('Enter'); })(),
    (async () => { await B.locator('input[placeholder^="예: 2페이즈"]').fill('돌진 전에 바닥 경고 표시'); await B.locator('input[placeholder^="예: 2페이즈"]').press('Enter'); })(),
  ]);
  await A.waitForSelector('text=돌진 전에 바닥 경고 표시');
  await B.waitForSelector('text=보스 체력 5000');
  ok(true, '동시에 고친 변경점/체크리스트 둘 다 남음');
  await B.click('.check >> text=동의');
  await A.waitForSelector('.check >> text=민수');
  await A.click('.check >> text=동의');
  await B.waitForSelector('.check.done');
  ok(true, '두 사람 다 동의하면 합의 완료 표시');

  console.log('4. 기능 트리 → 보드');
  A.answers.push('보스 전투');
  await A.click('text=+ 폴더');
  await B.waitForSelector('.folder >> text=보스 전투');
  ok(true, 'B 트리에도 새 폴더 보임');
  await A.click('.folder >> text=보스 전투');
  await A.click('text=+ 코드');
  await A.fill('input[placeholder^="자료 이름"]', 'BossPhase2');
  await A.fill('textarea[placeholder^="코드를"]', 'local hp = 5000\nprint("phase2", hp)');
  await A.click('.form >> text=저장');
  await A.waitForSelector('.item >> text=BossPhase2');
  await A.click('.item >> text=보드로');
  await B.waitForSelector('.material pre >> text=phase2');
  ok(true, '폴더 자료를 보드로 꺼내기 → B 화면에 코드 카드');

  console.log('5. 이미지 + 댓글');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  writeFileSync('dot.png', png);
  await A.locator('.feature input[placeholder="댓글"]').fill('이 패턴 너무 어렵지 않을까?');
  await A.locator('.feature input[placeholder="댓글"]').press('Enter');
  await A.locator('.feature input[type=file]').setInputFiles('dot.png');
  await B.waitForSelector('.comment >> text=이 패턴 너무 어렵지 않을까?');
  await B.waitForSelector('.comment img');
  ok(true, '댓글 + 이미지 첨부가 B에게 보임');
  await A.locator('.folder-body input[type=file]').setInputFiles('dot.png');
  await B.click('.folder >> text=보스 전투');
  await B.waitForSelector('.folder-body >> text=dot.png');
  ok(true, '폴더 이미지 업로드가 B 트리에 보임');

  console.log('6. Studio 수집 → 받은 자료 → 기능에 연결');
  const send = (src) => fetch('http://localhost:8000/studio/collect', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [
      { title: 'BossAttack', kind: 'code', content: src, path: 'ServerScriptService.BossAttack', class_name: 'Script' },
      { title: 'BossArena', kind: 'object', path: 'Workspace.BossArena', class_name: 'Part',
        content: JSON.stringify({ ClassName: 'Part', Position: '0, 5, 0', Size: '50, 1, 50', Anchored: true, Color: '163, 162, 165' }) },
    ] }),
  }).then((r) => r.json());
  await send('-- R1\nlocal dmg = 10');
  await send('-- R2\nlocal dmg = 25');
  await A.waitForSelector('.inbox-item >> text=BossAttack R2');
  ok(await A.locator('.inbox-item >> text=BossAttack R1').count() === 1, '받은 자료에 R1, R2 따로 보임');
  const r2 = A.locator('.inbox-item', { hasText: 'BossAttack R2' });
  await r2.locator('select').first().selectOption({ label: '보스 2페이즈' });
  await B.waitForSelector('.chip >> text=BossAttack R2');
  ok(true, '기능에 연결 → B 화면 기능 카드에 코드 칩');
  const obj = A.locator('.inbox-item', { hasText: 'BossArena' }).last();
  await obj.locator('select').first().selectOption({ label: '보스 2페이즈' });
  await A.waitForSelector('.chip >> text=BossArena');
  await A.click('.chip-main >> text=BossArena');
  await B.waitForSelector('.material.object >> text=Anchored');
  ok(true, '오브젝트 칩 → 보드에 속성 카드');
  await A.click('.chip-main >> text=BossAttack R2');
  await A.waitForSelector('.material pre >> text=dmg = 25');
  const card = A.locator('.material', { hasText: 'BossAttack' });
  await card.locator('select').selectOption({ index: 0 });
  await B.waitForSelector('.material pre >> text=dmg = 10');
  await B.waitForSelector('text=최신 R2 있음');
  ok(true, 'R1로 바꾸면 모두 R1로 보이고 "최신 R2" 안내');

  console.log('메모 + 이동 + 삭제');
  await B.click('text=+ 메모');
  await B.locator('.memo textarea').fill('다음 회의: 보스 체력 다시 보기');
  await A.waitForFunction(() => document.querySelector('.memo textarea')?.value === '다음 회의: 보스 체력 다시 보기');
  ok(true, '메모 실시간');
  const memoNode = B.locator('.react-flow__node-memo');
  const before = await A.locator('.react-flow__node-memo').evaluate((e) => e.style.transform);
  await B.waitForTimeout(400);
  const box2 = await memoNode.locator('.kind').boundingBox();
  await B.mouse.move(box2.x + 10, box2.y + 5);
  await B.mouse.down();
  await B.mouse.move(box2.x + 130, box2.y + 108, { steps: 8 });
  await B.mouse.up();
  await A.waitForFunction((b) => document.querySelector('.react-flow__node-memo').style.transform !== b, before);
  ok(true, 'B가 옮긴 메모 위치가 A 화면에서도 바뀜');
  await A.mouse.move(700, 500);
  await B.waitForSelector('.cursor >> text=성수');
  ok(true, 'A 마우스 커서가 B 화면에 보임');
  await shot(A, 'A-board'); await shot(B, 'B-board');
} else {
  console.log('재시작 후 확인');
  await A.waitForSelector('.feature');
  ok(await A.locator('.feature .title').inputValue() === '보스 2페이즈', '기능 카드 남아있음');
  await A.waitForSelector('text=돌진 전에 바닥 경고 표시');
  await A.waitForSelector('.check >> text=/(민수, 성수|성수, 민수)/');
  await A.waitForSelector('.chip >> text=BossAttack R2');
  await A.waitForSelector('.comment img');
  await A.waitForSelector('.material pre >> text=dmg = 10');
  await A.waitForFunction(() => document.querySelector('.memo textarea')?.value === '다음 회의: 보스 체력 다시 보기');
  ok(true, '변경점, 합의, 칩, 댓글 이미지, 자료 카드, 메모 다 남아있음');
  await A.click('.folder >> text=보스 전투');
  await A.waitForSelector('.folder-body >> text=BossPhase2');
  ok(true, '폴더와 자료 남아있음');
  await shot(A, 'A-after-restart');
  // 삭제
  const n = await A.locator('.react-flow__node').count();
  await A.locator('.react-flow__node-memo .kind').click();
  await A.keyboard.press('Delete');
  await B.waitForFunction((n) => document.querySelectorAll('.react-flow__node').length === n - 1, n);
  ok(true, '카드 삭제가 B에게도 반영');
}
await browser.close();
console.log('끝');
