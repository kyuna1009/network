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
  x: 0,          // 向き（-1〜1）
  y: 0,
  sneak: false,  // しのび足がオンか
  id: null,      // 十字ボタンを押している指の番号
};

const DPAD_DEAD = 0.25;  // 十字ボタンの中心付近（この割合より内側）は「止まる」

const dpad = document.getElementById('dpad');
const dpadBtns = {
  up: dpad.querySelector('[data-dir="up"]'),
  down: dpad.querySelector('[data-dir="down"]'),
  left: dpad.querySelector('[data-dir="left"]'),
  right: dpad.querySelector('[data-dir="right"]'),
};
const sneakBtn = document.getElementById('sneak-btn');
const flashBtn = document.getElementById('flash-btn');

// ※ iPhone(Safari)では指のリスト(TouchList)に for...of が使えないことがあるので、
//    番号で1つずつ取り出す
function findTouch(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

// 押している方向のボタンを光らせる
function showDpad() {
  dpadBtns.up.classList.toggle('on', touch.y < 0);
  dpadBtns.down.classList.toggle('on', touch.y > 0);
  dpadBtns.left.classList.toggle('on', touch.x < 0);
  dpadBtns.right.classList.toggle('on', touch.x > 0);
}

// 指の位置（十字ボタンの中心からのずれ）で向きを決める
function setDirFromPoint(clientX, clientY) {
  const r = dpad.getBoundingClientRect();
  const dx = clientX - (r.left + r.width / 2);
  const dy = clientY - (r.top + r.height / 2);
  const half = r.width / 2;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < half * DPAD_DEAD) {
    touch.x = 0;
    touch.y = 0;
  } else if (ax > ay * 2) {        // ほぼ横 → 左右だけ
    touch.x = Math.sign(dx); touch.y = 0;
  } else if (ay > ax * 2) {        // ほぼ縦 → 上下だけ
    touch.x = 0; touch.y = Math.sign(dy);
  } else {                         // 斜め
    touch.x = Math.sign(dx); touch.y = Math.sign(dy);
  }
  showDpad();
}

// ゲーム開始時などにリセット（main.js から呼ぶ）
function resetStick() {
  touch.active = false;
  touch.id = null;
  touch.x = 0;
  touch.y = 0;
  touch.sneak = false;
  sneakBtn.classList.remove('on');
  showDpad();
}

// ---- 十字ボタン ----
dpad.addEventListener('touchstart', (ev) => {
  ev.preventDefault();
  if (state !== 'playing') return;
  if (touch.id !== null && findTouch(ev.touches, touch.id)) return; // すでに別の指で操作中
  const t = ev.changedTouches[0];
  touch.id = t.identifier;
  touch.active = true;
  setDirFromPoint(t.clientX, t.clientY);
}, { passive: false });

dpad.addEventListener('touchmove', (ev) => {
  ev.preventDefault();
  if (touch.id === null) return;
  const t = findTouch(ev.changedTouches, touch.id);
  if (t) setDirFromPoint(t.clientX, t.clientY); // 指をすべらせると向きが変わる
}, { passive: false });

function endDpad(ev) {
  if (touch.id === null) return;
  if (findTouch(ev.changedTouches, touch.id)) {
    touch.active = false;
    touch.id = null;
    touch.x = 0;
    touch.y = 0;
    showDpad();
  }
}
dpad.addEventListener('touchend', endDpad);
dpad.addEventListener('touchcancel', endDpad);

// ---- しのび足ボタン（押すたびにオン・オフ）----
function toggleSneak() {
  if (state !== 'playing') return;
  touch.sneak = !touch.sneak;
  sneakBtn.classList.toggle('on', touch.sneak);
}
sneakBtn.addEventListener('touchstart', (ev) => {
  ev.preventDefault();
  toggleSneak();
}, { passive: false });
sneakBtn.addEventListener('click', toggleSneak);

// ---- 閃光ボタン ----
flashBtn.addEventListener('touchstart', (ev) => {
  ev.preventDefault();
  if (state === 'playing') useFlash();
}, { passive: false });
flashBtn.addEventListener('click', () => {
  if (state === 'playing') useFlash();
});

// 遊んでいる間、画面がスクロールしたり拡大したりしないようにする
document.addEventListener('touchmove', (ev) => {
  if (state === 'playing') ev.preventDefault();
}, { passive: false });
