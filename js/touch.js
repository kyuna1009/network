// =====================================================
//  スマホ（タッチ操作）
//  ・左下の十字ボタン：押している間その方向に進む
//    （指をすべらせて向きを変えたり、斜めに押したりもできる）
//  ・右下の「しのび足」ボタン：押すたびにオン・オフ
//  ・右下の「閃光」ボタン：閃光を使う
// =====================================================
 
// タッチ操作の状態（logic.js の updatePlayer が読む）
const touch = {
  active: false, // 十字ボタンを押しているか
  x: 0,          // 向き（-1〜1）  左が-1、右が1
  y: 0,          //                上が-1、下が1
  sneak: false,  // しのび足がオンか
  id: null,      // 十字ボタンを押している指の番号（nullは「誰も押していない」）
};
 
const DPAD_DEAD = 0.25;  // 十字ボタンの中心付近（この割合より内側）は「止まる」
 
const dpad = document.getElementById('dpad');            // 十字ボタン全体をHTMLから取得
const dpadBtns = {                                       // 上下左右の4つのボタン（光らせる用）
  up: dpad.querySelector('[data-dir="up"]'),             // dpadの中から data-dir="up" の要素を探す
  down: dpad.querySelector('[data-dir="down"]'),         // 同じく下
  left: dpad.querySelector('[data-dir="left"]'),         // 同じく左
  right: dpad.querySelector('[data-dir="right"]'),       // 同じく右
};
const sneakBtn = document.getElementById('sneak-btn');   // しのび足ボタンを取得
const flashBtn = document.getElementById('flash-btn');   // 閃光ボタンを取得
 
// ※ iPhone(Safari)では指のリスト(TouchList)に for...of が使えないことがあるので、
//    番号で1つずつ取り出す
function findTouch(list, id) {                           // 指のリストから、番号がidの指を探す
  for (let i = 0; i < list.length; i++) {                // 1本ずつ見る
    if (list[i].identifier === id) return list[i];       // 番号が一致したらその指を返す
  }
  return null;                                           // 見つからなければnull
}
 
// 押している方向のボタンを光らせる
function showDpad() {
  dpadBtns.up.classList.toggle('on', touch.y < 0);       // 上向きならonを付ける、違えば外す（CSSで色が反転）
  dpadBtns.down.classList.toggle('on', touch.y > 0);     // 下向きなら下ボタンにon
  dpadBtns.left.classList.toggle('on', touch.x < 0);     // 左向きなら左ボタンにon
  dpadBtns.right.classList.toggle('on', touch.x > 0);    // 右向きなら右ボタンにon（斜めなら2つ光る）
}
 
// 指の位置（十字ボタンの中心からのずれ）で向きを決める
function setDirFromPoint(clientX, clientY) {             // clientX,Y＝指の画面上の位置
  const r = dpad.getBoundingClientRect();                // 十字ボタンの画面上の位置と大きさを取得
  const dx = clientX - (r.left + r.width / 2);           // 十字ボタンの中心から、指が横にどれだけずれているか
  const dy = clientY - (r.top + r.height / 2);           // 同じく縦のずれ
  const half = r.width / 2;                              // 十字ボタンの半分の幅（中心から端まで）
  const ax = Math.abs(dx);                               // 横のずれの大きさ（マイナスを外す）
  const ay = Math.abs(dy);                               // 縦のずれの大きさ
  if (Math.max(ax, ay) < half * DPAD_DEAD) {             // 中心のすぐ近くを押していたら
    touch.x = 0;                                         // 止まる
    touch.y = 0;
  } else if (ax > ay * 2) {        // ほぼ横 → 左右だけ
    touch.x = Math.sign(dx); touch.y = 0;                // Math.signはプラスなら1、マイナスなら-1
  } else if (ay > ax * 2) {        // ほぼ縦 → 上下だけ
    touch.x = 0; touch.y = Math.sign(dy);
  } else {                         // 斜め
    touch.x = Math.sign(dx); touch.y = Math.sign(dy);    // 横と縦の両方に進む
  }
  showDpad();                                            // 決まった向きのボタンを光らせる
}
 
// ゲーム開始時などにリセット（main.js から呼ぶ）
function resetStick() {
  touch.active = false;                                  // 押していない状態に
  touch.id = null;                                       // どの指も担当していない
  touch.x = 0;                                           // 向きをリセット
  touch.y = 0;
  touch.sneak = false;                                   // しのび足をオフ
  sneakBtn.classList.remove('on');                       // しのび足ボタンの光も消す
  showDpad();                                            // 十字ボタンの光も全部消える
}
 
// ---- 十字ボタン ----
dpad.addEventListener('touchstart', (ev) => {            // 十字ボタンに指が触れたとき
  ev.preventDefault();                                   // スクロールや拡大を防ぐ
  if (state !== 'playing') return;                       // ゲーム中でなければ何もしない
  if (touch.id !== null && findTouch(ev.touches, touch.id)) return; // すでに別の指で操作中
  const t = ev.changedTouches[0];                        // 今触れた指
  touch.id = t.identifier;                               // この指を十字ボタン担当として覚える
  touch.active = true;                                   // 押している状態に
  setDirFromPoint(t.clientX, t.clientY);                 // 触った位置から向きを決める
}, { passive: false });                                  // passive:false にしないと preventDefault が効かない
 
dpad.addEventListener('touchmove', (ev) => {             // 十字ボタンの上で指が動いたとき
  ev.preventDefault();                                   // スクロールを防ぐ
  if (touch.id === null) return;                         // 誰も押していなければ何もしない
  const t = findTouch(ev.changedTouches, touch.id);      // 動いた指の中から担当の指を探す
  if (t) setDirFromPoint(t.clientX, t.clientY); // 指をすべらせると向きが変わる
}, { passive: false });
 
function endDpad(ev) {                                   // 指が離れた／中断されたとき
  if (touch.id === null) return;                         // 誰も押していなければ何もしない
  if (findTouch(ev.changedTouches, touch.id)) {          // 離れた指が十字ボタン担当なら
    touch.active = false;                                // 押していない状態に
    touch.id = null;                                     // 担当なし
    touch.x = 0;                                         // 止まる
    touch.y = 0;
    showDpad();                                          // ボタンの光を消す
  }
}
dpad.addEventListener('touchend', endDpad);              // 指を離したとき
dpad.addEventListener('touchcancel', endDpad);           // 電話が来た等で操作が中断されたとき
 
// ---- しのび足ボタン（押すたびにオン・オフ）----
function toggleSneak() {
  if (state !== 'playing') return;                       // ゲーム中でなければ何もしない
  touch.sneak = !touch.sneak;                            // ! で反対にする（オン⇔オフ）
  sneakBtn.classList.toggle('on', touch.sneak);          // オンならボタンを光らせる
}
sneakBtn.addEventListener('touchstart', (ev) => {        // しのび足ボタンに触れたとき
  ev.preventDefault();                                   // このあと click が二重に起きるのを防ぐ
  toggleSneak();                                         // オン・オフを切り替える
}, { passive: false });
sneakBtn.addEventListener('click', toggleSneak);         // マウスでクリックしたとき（PCで試す用）
 
// ---- 閃光ボタン ----
flashBtn.addEventListener('touchstart', (ev) => {        // 閃光ボタンに触れたとき
  ev.preventDefault();                                   // click の二重発生やダブルタップ拡大を防ぐ
  if (state === 'playing') useFlash();                   // ゲーム中なら閃光を使う（useFlashはlogic.jsにある）
}, { passive: false });
flashBtn.addEventListener('click', () => {               // マウスでクリックしたとき（PCで試す用）
  if (state === 'playing') useFlash();
});
 
// 遊んでいる間、画面がスクロールしたり拡大したりしないようにする
document.addEventListener('touchmove', (ev) => {         // 画面のどこで指が動いても
  if (state === 'playing') ev.preventDefault();          // ゲーム中ならスクロールを止める
}, { passive: false });
 
