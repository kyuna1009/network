// =====================================================
//  【ロジック担当】
//  迷路生成・移動と当たり判定・敵の追跡・罠とゴールの判定
//  主な関数：generateMaze / bfsNextStep / updatePlayer / updateEnemies
//  ※ このファイルは画面に何も描かない。計算だけをして、結果を game に書き込む「審判」
// =====================================================

const WALL = 1;    // 迷路の表で「壁」を表す数字
const FLOOR = 0;   // 迷路の表で「床（通れる所）」を表す数字
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // 右・左・下・上（[横にずらす量, 縦にずらす量]）

// そのマスが壁か（迷路の外も壁あつかい）
function isWall(grid, tx, ty) {      // grid＝迷路の表、tx, ty＝調べたいマスの番号
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return true; // 迷路の外なら「壁」と答える（外に出ないように）
  return grid[ty][tx] === WALL;      // 表の中身が WALL なら true（壁）、FLOOR なら false（床）
}

// -----------------------------------------------------
//  迷路の自動生成：穴掘り法（深さ優先探索）
//  部屋 w×h 個 → マスは (2w+1)×(2h+1)。奇数マスが部屋、間が壁。
// -----------------------------------------------------
function generateMaze(w, h) {        // w, h＝横と縦の部屋の数（今は13×8）
  const cols = w * 2 + 1;            // 横のマス数（13×2+1＝27）
  const rows = h * 2 + 1;            // 縦のマス数（8×2+1＝17）
  const grid = [];                   // 迷路の表（2次元配列）
  for (let y = 0; y < rows; y++) grid.push(new Array(cols).fill(WALL)); // 最初は全部のマスを壁にする

  const visited = [];                // 部屋ごとに「もう行ったか」を覚えておく表
  for (let y = 0; y < h; y++) visited.push(new Array(w).fill(false)); // 最初はどの部屋も「まだ行っていない」

  // スタート（左上の部屋）から掘り始める
  const stack = [[0, 0]];            // 通ってきた部屋のメモ（一番上が今いる部屋）
  visited[0][0] = true;              // スタートの部屋は「行った」
  grid[1][1] = FLOOR;                // スタートの部屋を床にする

  while (stack.length > 0) {         // メモが空になる（全部の部屋を回ってスタートまで戻る）までくり返す
    const [cx, cy] = stack[stack.length - 1];   // 今いる部屋（メモの一番上）

    // まだ行っていない隣の部屋を集める
    const options = [];                         // 行ける候補の部屋のリスト
    for (const [dx, dy] of DIRS) {              // 右・左・下・上の4方向を順に見る
      const nx = cx + dx;                       // 隣の部屋の番号
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && !visited[ny][nx]) { // 迷路の中にあって、まだ行っていないなら
        options.push([nx, ny, dx, dy]);         // 候補に入れる（部屋の番号と、その向き）
      }
    }

    if (options.length === 0) {      // 候補が1つもない＝行き止まり
      stack.pop(); // 行き止まり → 1つ戻る
      continue;                      // whileの最初に戻って、1つ前の部屋から続きを探す
    }

    // ランダムに1つ選んで、間の壁と次の部屋を掘る
    const [nx, ny, dx, dy] = options[randInt(options.length)];   // 候補からランダムに1つ選ぶ
    grid[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = FLOOR;              // 間の壁を床にする（部屋は表の「2倍＋1」の位置。そこから向きの方へ1マス）
    grid[ny * 2 + 1][nx * 2 + 1] = FLOOR;                        // 次の部屋を床にする
    visited[ny][nx] = true;                                      // 次の部屋を「行った」にする
    stack.push([nx, ny]);                                        // メモに積んで、次の部屋へ進む
  }

  // 一本道だと敵から逃げられないので、いくつか壁を壊して回り道を作る
  let removed = 0;                   // 壊した壁の数
  let tries = 0;                     // 試した回数（ずっと見つからないときに止めるため）
  while (removed < CONFIG.EXTRA_PATHS && tries < 2000) {   // 30枚壊すまで（ただし2000回試したらあきらめる）
    tries++;
    const x = 1 + randInt(cols - 2);  // 外側の壁以外から、ランダムにマスを1つ選ぶ
    const y = 1 + randInt(rows - 2);
    if (grid[y][x] !== WALL) continue;  // 床なら壊す必要がないので選び直す
    const horizontal = grid[y][x - 1] === FLOOR && grid[y][x + 1] === FLOOR &&   // 左右が床で
                       grid[y - 1][x] === WALL && grid[y + 1][x] === WALL;      // 上下が壁＝横の通路を仕切る壁
    const vertical = grid[y - 1][x] === FLOOR && grid[y + 1][x] === FLOOR &&     // 上下が床で
                     grid[y][x - 1] === WALL && grid[y][x + 1] === WALL;        // 左右が壁＝縦の通路を仕切る壁
    if (horizontal || vertical) {     // 通路と通路の間の壁1枚だけなら
      grid[y][x] = FLOOR;             // 壊して床にする → ぐるっと回れる道ができる
      removed++;
    }
  }

  return grid;                        // 完成した迷路の表を返す
}

// -----------------------------------------------------
//  経路探索：幅優先探索（BFS）
//  スタートから近いマス順に調べていく（水面の波紋のように広がる）
// -----------------------------------------------------

// from から to へ最短で向かうとき「次に進むマス」を返す（敵の追跡に使う）
function bfsNextStep(grid, from, to) {      // from＝敵のマス、to＝プレイヤーのマス
  if (from.x === to.x && from.y === to.y) return { x: from.x, y: from.y }; // もう同じマスにいるなら動かない

  const cols = grid[0].length;              // 横のマス数
  const prev = new Array(grid.length * cols).fill(-1); // どのマスから来たか（-1＝まだ調べていない）
  const startKey = from.y * cols + from.x;  // マス(x, y)を1つの番号にする（上の行から順に 0, 1, 2…）
  const goalKey = to.y * cols + to.x;       // ゴール（プレイヤー）のマスの番号
  prev[startKey] = startKey;                // スタートは「調べた」印を付けておく

  const queue = [startKey];   // 待ち行列：これから調べるマスを、近い順に並べておく
  let head = 0;               // 待ち行列の先頭の位置（先に並んだものから取り出す）
  while (head < queue.length) {             // 調べるマスがある間くり返す
    const key = queue[head++];              // 先頭のマスを取り出す
    if (key === goalKey) break;             // プレイヤーのマスに届いたら終わり
    const x = key % cols;                   // 番号 → 横の位置（割った余り）
    const y = (key - x) / cols;             // 番号 → 縦の位置
    for (const [dx, dy] of DIRS) {          // 上下左右の隣を見る
      const nx = x + dx;
      const ny = y + dy;
      if (isWall(grid, nx, ny)) continue;   // 壁なら進めない
      const nk = ny * cols + nx;            // 隣のマスの番号
      if (prev[nk] !== -1) continue;        // もう調べたマスなら飛ばす
      prev[nk] = key;                       // 「このマスから来た」とメモする
      queue.push(nk);                       // 待ち行列の後ろに並べる（あとで調べる）
    }
  }

  if (prev[goalKey] === -1) return { x: from.x, y: from.y }; // たどり着けない

  // ゴールからスタートへさかのぼり、スタートの隣のマスを見つける
  let key = goalKey;                        // プレイヤーのマスから
  while (prev[key] !== startKey) key = prev[key];  // 「どこから来たか」をたどって、敵のすぐ隣まで戻る
  return { x: key % cols, y: Math.floor(key / cols) }; // そのマスが「次に進むマス」
}

// start から各マスまでの歩数を調べる（敵や罠の配置に使う）
function bfsDistances(grid, start) {
  const dist = grid.map(row => row.map(() => -1)); // 迷路と同じ大きさの表。-1＝まだ行けていない
  dist[start.y][start.x] = 0;               // スタートは0歩
  const queue = [start];                    // 待ち行列（近い順に調べる）
  let head = 0;
  while (head < queue.length) {
    const { x, y } = queue[head++];         // 先頭のマスを取り出す
    for (const [dx, dy] of DIRS) {          // 上下左右の隣を見る
      const nx = x + dx;
      const ny = y + dy;
      if (isWall(grid, nx, ny) || dist[ny][nx] !== -1) continue; // 壁か、もう歩数が決まっているなら飛ばす
      dist[ny][nx] = dist[y][x] + 1;        // 隣は「今のマス＋1歩」
      queue.push({ x: nx, y: ny });         // 待ち行列に並べる
    }
  }
  return dist;                              // 全部のマスの歩数が入った表を返す
}

// -----------------------------------------------------
//  敵と罠の配置
// -----------------------------------------------------
function createEnemies(grid, start) {
  const dist = bfsDistances(grid, start);   // スタートから各マスまでの歩数
  const candidates = [];                    // 敵を置いてもいいマスのリスト
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (dist[y][x] >= CONFIG.ENEMY_SPAWN_MIN_DIST) candidates.push({ x, y }); // スタートから14歩以上離れたマスだけ（いきなり捕まらないように）
    }
  }

  const enemies = [];                       // 敵のリスト
  for (let i = 0; i < CONFIG.ENEMY_COUNT && candidates.length > 0; i++) {   // 敵の数（2体）だけくり返す
    const tile = candidates.splice(randInt(candidates.length), 1)[0];      // 候補からランダムに1マス取り出す（同じマスに2体置かないように取り除く）
    enemies.push({
      x: centerOf(tile.x),    // 位置（ピクセル）。マスの真ん中
      y: centerOf(tile.y),
      tile: tile,       // 今いるマス
      next: tile,       // 向かっているマス
      prev: null,       // 1つ前のマス（うろつくとき引き返さないため）
      chasing: false,   // 追跡中か
      memory: 0,        // 見失ってからの残り追跡時間
      stunned: 0,       // 閃光でひるんでいる残り時間
      wobble: Math.random() * Math.PI * 2, // 見た目のゆらゆら用
    });
  }
  return enemies;
}

// 鍵の配置：スタートからもゴールからも離れていて、寄り道が必要になる場所を選ぶ
function placeKey(grid, start, goal) {
  const fromStart = bfsDistances(grid, start);   // スタートから各マスまでの歩数
  const fromGoal = bfsDistances(grid, goal);     // ゴールから各マスまでの歩数
  const direct = fromStart[goal.y][goal.x];      // スタートからゴールまで直接行ったときの歩数

  const candidates = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (fromStart[y][x] < CONFIG.KEY_MIN_DIST || fromGoal[y][x] < CONFIG.KEY_MIN_DIST) continue; // スタートやゴールに近すぎる（8歩未満）マスは使わない（壁のマスも -1 なのでここで除かれる）
      // 寄り道の長さ = スタート→鍵→ゴール と スタート→ゴール の差
      const detour = fromStart[y][x] + fromGoal[y][x] - direct;
      candidates.push({ x, y, detour });         // 候補に入れる（寄り道の長さも一緒に）
    }
  }
  if (candidates.length === 0) return { x: goal.x, y: 1 }; // 念のため（右上の角）

  // 寄り道が長い順に並べ、上位3分の1からランダムに選ぶ
  candidates.sort((a, b) => b.detour - a.detour);          // 寄り道が長い順に並べかえる
  const top = candidates.slice(0, Math.max(1, Math.floor(candidates.length / 3))); // 上位3分の1だけ残す
  const k = top[randInt(top.length)];                      // その中からランダムに1つ
  return { x: k.x, y: k.y };
}

function placeTraps(grid, start, goal, key) {
  const dist = bfsDistances(grid, start);   // スタートから各マスまでの歩数
  const candidates = [];                    // トゲを置いてもいいマスのリスト
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (dist[y][x] < 3) continue;                    // スタート付近には置かない
      if (x === goal.x && y === goal.y) continue;      // ゴールには置かない
      if (x === key.x && y === key.y) continue;        // 鍵の上には置かない
      candidates.push({ x, y });
    }
  }

  const traps = [];                         // 置いたトゲのリスト
  while (traps.length < CONFIG.TRAP_COUNT && candidates.length > 0) {    // トゲが10個になるまでくり返す
    const t = candidates.splice(randInt(candidates.length), 1)[0];      // 候補からランダムに1マス取り出す
    // 罠どうしが隣り合わないようにする
    const tooClose = traps.some(o => Math.abs(o.x - t.x) + Math.abs(o.y - t.y) < 2); // すでに置いたトゲと隣り合っていないか
    if (tooClose) continue;                 // 隣り合うならこのマスはやめる
    // ここに置いても「トゲを踏まずに スタート→鍵→ゴール と行ける道」が残るときだけ置く
    const trial = traps.concat([t]);        // 「ここにも置いたら」というトゲのリストを試しに作る
    if (canReachWithoutTraps(grid, start, key, trial) && canReachWithoutTraps(grid, key, goal, trial)) { // スタート→鍵、鍵→ゴールの両方がトゲなしで行けるなら
      traps.push({ x: t.x, y: t.y, used: false });   // 本当に置く（used＝もう踏まれたか）
    }
  }
  return traps;
}

// トゲのマスを壁とみなして、start から goal へ行けるか調べる
function canReachWithoutTraps(grid, start, goal, traps) {
  const blocked = grid.map(row => row.slice());           // 迷路の表をコピーする（元の迷路は変えない）
  for (const t of traps) blocked[t.y][t.x] = WALL;        // コピーの上で、トゲのマスを壁にする
  return bfsDistances(blocked, start)[goal.y][goal.x] !== -1; // 幅優先探索でゴールに歩数が付けば（-1でなければ）行ける
}

// -----------------------------------------------------
//  プレイヤーの移動（加速度・速度・摩擦）と当たり判定
//  1秒に約60回、main.js の loop から呼ばれる
// -----------------------------------------------------
function updatePlayer(dt) {          // dt＝前回からの経過秒数
  const p = game.player;             // プレイヤーを短く p と呼ぶ

  // 入力の向き
  let ix = 0;                        // 横の向き（左 -1 〜 右 1）
  let iy = 0;                        // 縦の向き（上 -1 〜 下 1）
  if (keys.left) ix -= 1;            // ←が押されていたら左へ
  if (keys.right) ix += 1;           // →が押されていたら右へ（両方押すと 0 で止まる）
  if (keys.up) iy -= 1;              // ↑なら上へ（画面は下に行くほど y が大きい）
  if (keys.down) iy += 1;            // ↓なら下へ

  // スマホ：十字ボタンを押しているときはそちらの向きを使う（touch.js）
  if (touch.active) {
    ix = touch.x;
    iy = touch.y;
  }

  // トゲを踏んだ直後は動けない
  if (p.stun > 0) {
    p.stun -= dt;                    // 動けない残り時間を減らす
    ix = 0;                          // 入力を無視して
    iy = 0;
    p.vx = 0;                        // 速度も0にする
    p.vy = 0;
  }

  // 斜め移動が速くならないように長さを1にそろえる
  const len = Math.hypot(ix, iy);    // 向きの長さ（斜めだと約1.41になる）
  if (len > 0) {
    ix /= len;                       // 長さで割って1にそろえる
    iy /= len;
  }

  // 加速度 → 速度
  p.vx += ix * CONFIG.ACCEL * dt;    // 押している向きに少しずつ速くなる
  p.vy += iy * CONFIG.ACCEL * dt;

  // 摩擦で減速
  const keep = Math.max(0, 1 - CONFIG.FRICTION * dt);   // 速度を何割残すか（1フレームで約9割）
  p.vx *= keep;                      // 毎フレーム少しずつ遅くなる → キーを離すと止まる
  p.vy *= keep;

  // 最高速度を超えないようにする（しのび足のときは遅くする）
  p.sneaking = keys.sneak || touch.sneak; // Shift、またはスマホのしのび足ボタン
  const maxSpeed = p.sneaking ? CONFIG.SNEAK_SPEED : CONFIG.MAX_SPEED;   // しのび足なら70、普通なら200
  const speed = Math.hypot(p.vx, p.vy);    // 今の速さ
  if (speed > maxSpeed) {                  // 最高速度を超えていたら
    p.vx = (p.vx / speed) * maxSpeed;      // 向きはそのままで、速さだけ最高速度に下げる
    p.vy = (p.vy / speed) * maxSpeed;
  }

  // 細い通路で曲がりやすくするため、通路の中央に少し寄せる
  cornerAssist(p, Math.sign(ix), Math.sign(iy), dt);

  // 速度 → 位置（x と y を別々に動かして壁で止める）
  moveAndCollide(p, p.vx * dt, 0);   // まず横に動かして、壁にめり込んだら戻す
  moveAndCollide(p, 0, p.vy * dt);   // 次に縦に動かして、壁にめり込んだら戻す（別々にすると壁に沿って滑れる）
  p.speed = Math.hypot(p.vx, p.vy);  // 今の速さを記録（render.js の updateLight が光の大きさに使う）
  if (p.speed > 5) p.facing = Math.atan2(p.vy, p.vx);   // 動いているときだけ、向いている方向を更新

  // 罠とゴールの判定（プレイヤーの中心がどのマスにいるか）
  const tx = tileOf(p.x);            // 今いるマスの番号（横）
  const ty = tileOf(p.y);            // 今いるマスの番号（縦）

  for (const trap of game.traps) {   // トゲを1つずつ調べる
    if (!trap.used && trap.x === tx && trap.y === ty) {   // まだ踏まれていないトゲの上にいたら
      trap.used = true;              // 踏んだ印を付ける（同じトゲで何度も減らないように）
      game.life -= 1;                // ライフを1減らす
      p.stun = CONFIG.TRAP_STUN;     // 0.5秒動けなくする
      p.vx = 0;                      // その場で止める
      p.vy = 0;
      game.hitFlash = 0.35;          // 画面を赤く光らせる時間
      if (game.life <= 0) {          // ライフがなくなったら
        endGame(false, 'トゲを踏みすぎてライフがなくなった…');   // ゲームオーバー（main.js）
        return;
      }
    }
  }

  // 鍵を拾う
  if (!game.hasKey && tx === game.key.x && ty === game.key.y) {   // まだ鍵を持っていなくて、鍵のマスにいたら
    game.hasKey = true;              // 鍵を持っている状態にする
    showMessage('鍵を手に入れた！ 出口の扉が開いた');   // お知らせを出す（render.js）
  }

  // ゴール：鍵がないと扉が開かない
  if (tx === game.goal.x && ty === game.goal.y) {   // ゴールのマスにいたら
    if (game.hasKey) {
      endGame(true);                 // 鍵があればクリア（main.js）
    } else {
      showMessage('扉に鍵がかかっている… 鍵を探そう');   // 鍵がなければお知らせだけ
    }
  }
}

// -----------------------------------------------------
//  ランク評価：タイム50点 + ライフ30点 + 閃光の残り20点 = 100点満点
// -----------------------------------------------------
function calcRank() {
  const ratio = game.time / game.parTime; // 目標タイムの何倍かかったか
  let timePts;                            // タイムの点数
  if (ratio <= 1.0) timePts = 50;         // 目標タイム以内なら50点
  else if (ratio <= 1.5) timePts = 35;    // 1.5倍以内なら35点
  else if (ratio <= 2.2) timePts = 20;    // 2.2倍以内なら20点
  else timePts = 10;                      // それより遅ければ10点

  const lifePts = game.life * 10;      // 1つ10点
  const flashPts = game.flashes * 10;  // 使わずに残した閃光1回10点
  const total = timePts + lifePts + flashPts;   // 合計（100点満点）

  let rank = 'C';                                    // 最初はCにしておき
  if (total >= CONFIG.RANK_S) rank = 'S';            // 90点以上ならS
  else if (total >= CONFIG.RANK_A) rank = 'A';       // 70点以上ならA
  else if (total >= CONFIG.RANK_B) rank = 'B';       // 50点以上ならB

  return { rank, total, timePts, lifePts, flashPts, parTime: game.parTime }; // 結果画面に出すために、点数の内訳もまとめて返す
}

// 移動したあと壁にめり込んでいたら押し戻す
function moveAndCollide(p, dx, dy) {   // dx, dy＝今回動かす量（横か縦のどちらか一方）
  const r = CONFIG.PLAYER_RADIUS;      // プレイヤーの半径
  const T = CONFIG.TILE;               // 1マスの大きさ
  p.x += dx;                           // まず動かしてみる
  p.y += dy;

  const left = tileOf(p.x - r);          // プレイヤーの左端があるマス
  const right = tileOf(p.x + r - 0.001); // 右端があるマス
  const top = tileOf(p.y - r);           // 上端があるマス
  const bottom = tileOf(p.y + r - 0.001);// 下端があるマス

  for (let ty = top; ty <= bottom; ty++) {      // プレイヤーが重なっているマスを全部調べる
    for (let tx = left; tx <= right; tx++) {
      if (!isWall(game.grid, tx, ty)) continue; // 床なら問題なし
      if (dx > 0) { p.x = tx * T - r; p.vx = 0; }       // 右に動いて壁に入ったら、壁の左側まで戻して止める
      if (dx < 0) { p.x = (tx + 1) * T + r; p.vx = 0; } // 左に動いて壁に入ったら、壁の右側まで戻す
      if (dy > 0) { p.y = ty * T - r; p.vy = 0; }       // 下に動いて壁に入ったら、壁の上側まで戻す
      if (dy < 0) { p.y = (ty + 1) * T + r; p.vy = 0; } // 上に動いて壁に入ったら、壁の下側まで戻す
    }
  }
}

// 細い通路で曲がりやすくする補正：進む方向が通路なら、少しずつ通路の真ん中に寄せる
function cornerAssist(p, ix, iy, dt) {
  const tx = tileOf(p.x);              // 今いるマス
  const ty = tileOf(p.y);
  const pull = CONFIG.CORNER_ASSIST * dt;   // 1フレームで寄せる量
  if (ix !== 0 && iy === 0 && !isWall(game.grid, tx + ix, ty)) {   // 横だけに進んでいて、その先が通路なら
    p.y += clamp(centerOf(ty) - p.y, -pull, pull);                 // 縦の位置をマスの真ん中に少し寄せる
  }
  if (iy !== 0 && ix === 0 && !isWall(game.grid, tx, ty + iy)) {   // 縦だけに進んでいて、その先が通路なら
    p.x += clamp(centerOf(tx) - p.x, -pull, pull);                 // 横の位置をマスの真ん中に少し寄せる
  }
}

// -----------------------------------------------------
//  敵の動き：普段はうろつき、光に入ると追跡（見失ってもしばらく追う）
//  1秒に約60回、main.js の loop から呼ばれる
// -----------------------------------------------------
function updateEnemies(dt) {
  const p = game.player;
  const playerTile = { x: tileOf(p.x), y: tileOf(p.y) };   // プレイヤーがいるマス

  for (const e of game.enemies) {    // 敵を1体ずつ動かす
    e.wobble += dt * 4;              // ゆらゆら揺れる見た目用（render.js で使う）

    // ひるんでいる間は動かず、触れても捕まらない
    if (e.stunned > 0) {
      e.stunned -= dt;               // ひるみの残り時間を減らす
      continue;                      // この敵の残りの処理（移動・捕まえる判定）を飛ばす
    }

    // 光の範囲に入ったら追跡開始。外に出たら追跡時間を減らす
    const distToPlayer = Math.hypot(e.x - p.x, e.y - p.y);   // 敵とプレイヤーの距離（ピクセル）
    if (distToPlayer < game.lightRadius) {    // 光の半径より近い＝光の中に入った
      e.chasing = true;                       // 追跡モードにする
      e.memory = CONFIG.ENEMY_MEMORY;         // 見失っても追い続ける時間（2秒）をセット
    } else if (e.chasing) {                   // 光の外だけど追跡中なら
      e.memory -= dt;                         // 残り時間を減らして
      if (e.memory <= 0) e.chasing = false;   // 0になったらあきらめる
    }

    // 向かっているマスの中心へ進む
    const speed = e.chasing ? CONFIG.ENEMY_CHASE_SPEED : CONFIG.ENEMY_WANDER_SPEED;   // 追跡中は90、うろつき中は40
    const targetX = centerOf(e.next.x);    // 向かっているマスの真ん中
    const targetY = centerOf(e.next.y);
    const dx = targetX - e.x;              // そこまでの横の距離
    const dy = targetY - e.y;              // 縦の距離
    const d = Math.hypot(dx, dy);          // まっすぐの距離
    const step = speed * dt;               // 今回進める距離

    if (d <= step) {                       // 今回で着いてしまうなら
      // マスに着いたので次のマスを決める
      e.x = targetX;                       // ぴったりマスの真ん中に置く
      e.y = targetY;
      e.prev = e.tile;                     // 今までいたマスを「1つ前のマス」に
      e.tile = e.next;                     // 着いたマスを「今いるマス」に
      e.next = chooseEnemyNext(e, playerTile);   // 次に向かうマスを決める（下の関数）
    } else {
      e.x += (dx / d) * step;              // まだ着かないなら、向かっている方向へ step だけ進む
      e.y += (dy / d) * step;
    }

    // 捕まったらゲームオーバー
    if (distToPlayer < CONFIG.ENEMY_RADIUS + CONFIG.PLAYER_RADIUS - 2) {   // 敵とプレイヤーの円が重なったら
      endGame(false, '敵に捕まってしまった…');   // ゲームオーバー（main.js）
      return;
    }
  }
}

// -----------------------------------------------------
//  閃光：Spaceで使う。範囲内の敵をひるませ、追跡もやめさせる
// -----------------------------------------------------
function useFlash() {
  if (game.flashes <= 0 || game.flashTime > 0) return;   // 残り回数がない、または演出中なら使えない
  game.flashes -= 1;                         // 残り回数を1減らす
  game.flashTime = CONFIG.FLASH_DURATION;    // 画面が白く光る演出の時間（0.5秒）
  game.lightRadius = CONFIG.FLASH_RADIUS; // 一瞬だけ光が大きくなる

  const p = game.player;
  for (const e of game.enemies) {            // 敵を1体ずつ調べる
    if (Math.hypot(e.x - p.x, e.y - p.y) < CONFIG.FLASH_RADIUS) {   // プレイヤーから220px以内なら
      e.stunned = CONFIG.FLASH_STUN;         // 3秒ひるませる
      e.chasing = false;                     // 追跡をやめさせる
      e.memory = 0;                          // 追い続ける時間も0に
    }
  }
}

// 敵がマスに着いたとき、次に向かうマスを決める
function chooseEnemyNext(e, playerTile) {
  // 追跡中：BFSでプレイヤーへの最短ルートの次のマス
  if (e.chasing) return bfsNextStep(game.grid, e.tile, playerTile);

  // うろつき中：来た道以外の通路からランダムに選ぶ
  const options = [];                        // 進める候補
  for (const [dx, dy] of DIRS) {             // 上下左右を見る
    const nx = e.tile.x + dx;
    const ny = e.tile.y + dy;
    if (isWall(game.grid, nx, ny)) continue;                     // 壁は無理
    if (e.prev && e.prev.x === nx && e.prev.y === ny) continue;  // 来た道には戻らない（行ったり来たりしないように）
    options.push({ x: nx, y: ny });
  }
  if (options.length === 0) return e.prev || e.tile; // 行き止まりなら引き返す
  return options[randInt(options.length)];           // 候補からランダムに1つ
}
