// =====================================================
//  全体の進行（2人の共通部分）
//  キー入力・ゲーム開始と終了・ゲームループ
//  ※ 1秒に約60回 loop が呼ばれ、その中でほかのファイルの関数を順番に呼ぶ「舞台監督」
// =====================================================

// 押されているキー（true＝押している、false＝離している）。logic.js の updatePlayer がこれを見て動く
const keys = { up: false, down: false, left: false, right: false, sneak: false };

// キーボードのキー → 向き の対応表。矢印キーでもWASDでも同じ向きになる
const KEY_MAP = {
  ArrowUp: 'up', KeyW: 'up',          // ↑ か W で上
  ArrowDown: 'down', KeyS: 'down',    // ↓ か S で下
  ArrowLeft: 'left', KeyA: 'left',    // ← か A で左
  ArrowRight: 'right', KeyD: 'right', // → か D で右
};

let game = null;       // 今のゲームの状態をまとめたもの（迷路・プレイヤー・敵・ライフ・タイムなど全部）
let state = 'title';   // 今の画面：'title'（タイトル）/ 'playing'（遊んでいる）/ 'result'（結果）
let lastTime = 0;      // 前回 loop が呼ばれた時刻（経過時間 dt を計算するのに使う）

// ---- ゲーム開始：新しい迷路を作って、すべてを最初の状態にする ----
function startGame() {
  const grid = generateMaze(CONFIG.MAZE_W, CONFIG.MAZE_H);       // 穴掘り法で新しい迷路を作る（logic.js）
  const start = { x: 1, y: 1 };                                   // スタートは左上のマス
  const goal = { x: grid[0].length - 2, y: grid.length - 2 };     // ゴールは右下のマス（外側の壁の1つ内側）
  const key = placeKey(grid, start, goal);                        // 寄り道が必要な場所に鍵を置く（logic.js）

  // 目標タイム：スタート→鍵→ゴールの最短ルートを最高速度で走った時間 × 倍率
  const route = bfsDistances(grid, start)[key.y][key.x] + bfsDistances(grid, key)[goal.y][goal.x]; // 最短ルートの歩数（スタート→鍵 ＋ 鍵→ゴール）
  const parTime = (route * CONFIG.TILE / CONFIG.MAX_SPEED) * CONFIG.PAR_FACTOR;                    // 歩数×1マスの大きさ÷速さ＝秒数。それを2倍にしたものが目標タイム

  // ゲームの状態を1つのオブジェクトにまとめる（ほかのファイルは全部この game を見て動く）
  game = {
    grid,             // 迷路（壁＝1、床＝0 の表）
    goal,             // ゴールのマス
    key,              // 鍵のマス
    hasKey: false,    // 鍵を拾ったか
    parTime,          // ランク評価の目標タイム
    message: '',      // 画面に出すお知らせ
    messageTime: 0,   // お知らせを出しておく残り時間
    player: {
      x: centerOf(start.x),   // プレイヤーの位置（ピクセル）。スタートのマスの真ん中から
      y: centerOf(start.y),
      vx: 0, vy: 0,           // 横・縦の速度（最初は止まっている）
      speed: 0,               // 速さ（光の大きさを決めるのに使う）
      facing: 0,              // 向いている方向（ランタンを描く位置に使う）
      stun: 0,                // トゲを踏んで動けない残り時間
      sneaking: false,        // しのび足中か
    },
    enemies: createEnemies(grid, start),          // スタートから離れた所に敵を置く（logic.js）
    traps: placeTraps(grid, start, goal, key),    // 道をふさがないようにトゲを置く（logic.js）
    life: CONFIG.LIFE,                            // ライフ（3）
    time: 0,                                      // 経過時間
    lightRadius: CONFIG.LIGHT_MIN,                // 光の大きさ（最初は一番小さい40px）
    hitFlash: 0,                                  // トゲを踏んだときの赤いフラッシュの残り時間
    flashes: CONFIG.FLASH_CHARGES, // 閃光の残り回数
    flashTime: 0,                  // 閃光の演出の残り時間
  };

  resizeCanvases(grid);   // キャンバスの大きさを迷路に合わせる（render.js）
  buildMazeImage(grid);   // 床と壁の絵を1回だけ描いておく（render.js）
  hideScreens();          // タイトル画面・結果画面を隠す（render.js）
  resetStick();           // スマホの十字ボタン・しのび足をリセット（touch.js）
  state = 'playing';      // 「遊んでいる」状態にする → loop で動きの計算が始まる
  document.body.classList.add('playing'); // スマホのボタンを表示する
  fitStage(); // ボタンの場所を空けて、ゲーム画面の大きさを合わせ直す
}

// ---- ゲーム終了（クリア or ゲームオーバー）----
// cleared：クリアしたか（true/false）、reason：ゲームオーバーの理由の文
function endGame(cleared, reason) {
  if (state !== 'playing') return;              // すでに終わっていたら何もしない（2回呼ばれても大丈夫なように）
  state = 'result';                             // 「結果画面」の状態にする → loop で動きの計算が止まる
  document.body.classList.remove('playing');    // スマホのボタンを隠す
  fitStage();                                   // ボタンの場所がいらなくなったので画面の大きさを合わせ直す
  game.player.vx = 0;                           // プレイヤーを止める
  game.player.vy = 0;
  game.messageTime = 0;                         // お知らせを消す
  showResult(cleared, reason, game.time, cleared ? calcRank() : null); // 結果画面を出す。クリアならランクも計算（calcRank は logic.js）
}

// ---- ゲームループ：requestAnimationFrame で毎秒約60回 ----
// now：ブラウザが渡してくれる今の時刻（ミリ秒）
function loop(now) {
  // 前のフレームからの経過時間(秒)。タブ切り替え後などに飛びすぎないよう上限をつける
  const dt = Math.min(0.05, (now - lastTime) / 1000);   // ミリ秒→秒にして、最大0.05秒まで
  lastTime = now;                                      // 次回のために今の時刻を覚えておく

  if (state === 'playing') {                       // 遊んでいる間だけ、動きを計算する
    game.time += dt;                               // タイムを進める
    updatePlayer(dt);                              // ① プレイヤーを動かし、壁・トゲ・鍵・ゴールを判定（logic.js）
    updateLight(dt);                               // ② その速さで光の大きさを決める（render.js）
    if (state === 'playing') updateEnemies(dt);    // ③ 敵を動かす（logic.js）。①でクリア・ゲームオーバーになっていたら動かさない
    if (game.hitFlash > 0) game.hitFlash -= dt;    // 赤いフラッシュの残り時間を減らす
    if (game.flashTime > 0) game.flashTime -= dt;  // 閃光の演出の残り時間を減らす
    if (game.messageTime > 0) game.messageTime -= dt; // お知らせの残り時間を減らす
    updateHud();                                   // ④ 上のステータス欄を書き換える（render.js）
  }

  if (game) draw(now);            // ⑤ 絵を描く（render.js）。タイトル・結果画面の後ろでも描き続ける
  requestAnimationFrame(loop);    // 「次に画面を書き換えるとき、また loop を呼んで」と予約する → くり返しになる
}

// ---- キー入力 ----
// しのび足：左右どちらのShiftでも反応するよう、キーの位置(code)ではなく
// 「今Shiftが押されているか」(shiftKey) で判定する。
// 環境によって右Shiftの code が正しく届かないことがあるための対策。
function updateSneak(ev) {
  keys.sneak = ev.shiftKey || (ev.type === 'keydown' && ev.key === 'Shift');
}

// キーが押されたとき
window.addEventListener('keydown', (ev) => {
  updateSneak(ev);                 // Shiftの状態を確認
  const k = KEY_MAP[ev.code];      // 押されたキーが向きのキーなら、その向き（'up' など）
  if (k) {
    keys[k] = true;                // その向きを「押している」にする
    ev.preventDefault(); // 矢印キーで画面がスクロールしないように
  }
  if (ev.code === 'Space') {       // Spaceキーなら
    ev.preventDefault();           // 画面がスクロールしないように
    if (state === 'playing' && !ev.repeat) useFlash();  // 遊んでいる間だけ閃光を使う（押しっぱなしで連続しないように repeat は無視）
  }
  // Spaceは閃光に使うので、スタートはEnterだけにする（連打で結果画面が飛ばないように）
  if (ev.code === 'Enter' && state !== 'playing') {
    ev.preventDefault();
    startGame();                   // タイトル・結果画面でEnterならゲーム開始
  }
});

// キーが離されたとき
window.addEventListener('keyup', (ev) => {
  updateSneak(ev);                 // Shiftの状態を確認
  const k = KEY_MAP[ev.code];
  if (k) keys[k] = false;          // その向きを「離している」にする
});

// 画面の大きさや向きが変わったら、ゲーム画面の大きさを合わせ直す
window.addEventListener('resize', fitStage);

// ウィンドウからフォーカスが外れたらキーを離したことにする（押しっぱなしで進み続けないように）
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});

// スタートボタン・もう一度ボタンを押したらゲーム開始
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);

// ---- 最初の画面：タイトルの後ろに迷路をうっすら表示しておく ----
// ページを開いたときに1回だけ実行される
(function init() {
  startGame();                                   // 迷路を1つ作っておく（タイトル画面の後ろに見せるため）
  state = 'title';                               // でも状態は「タイトル」にして、動きは止めておく
  document.body.classList.remove('playing');     // スマホのボタンは隠す
  showTitle();                                   // タイトル画面を出す（render.js）
  updateHud();                                   // ステータス欄を最初の状態にする
  requestAnimationFrame((t) => { lastTime = t; loop(t); });  // ゲームループを開始する
})();
