// ゲーム状態管理
let config = null;
let playerChar = null; // プレイヤーのキャラ名 ("MT", "ST", ...)
let characters = {};  // 全キャラ情報 { "MT": { marker: "頭割り", group: "グループ1", x: 0, y: 0 }, ... }
let currentPhase = 1;
let lastApocalypseText = ""; // 直近の偶数フェーズで出たテキスト ("過去の終焉" または "未来の終焉")
let startTime = 0;
let isAnimating = false;
let hideMarkersAfterPhase1 = false;
let phase12Step = 1;

// 追加の操作・タイマー状態
let controlType = "wasd"; // "wasd" または "joystick"
let isCanvasRotated = false; // 縦画面のスマホ操作時に90度回転しているかどうかのフラグ
let keysPressed = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
let joystickInput = { x: 0, y: 0 };
let playerSpeed = 5.5;
let timeRemaining = 0; // 残り時間(ミリ秒)
let timerInterval = null;
let gameLoopId = null;
let isGameRunning = false;
let currentTargetAreas = []; // 現在配置されているターゲットエリアの情報 [{x, y, w, h, condition, priority_type, el}]
let joystickActive = false;
let joystickStartPos = { x: 0, y: 0 };
let changedMarkerChars = []; // マーカーが変化したキャラを一時的に記録する配列
let isCheckingPositions = false; // ワイプ時の立ち位置確認中フラグ

// 固定ペア定義（グループ決定用）
const PAIRS = [
  ["MT", "H1"],
  ["ST", "H2"],
  ["D1", "D3"],
  ["D2", "D4"]
];

const CHAR_NAMES = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];

// マーカー定義
const MARKER_SHARE = "頭割り";
const MARKER_FAN = "扇";
const MARKER_CIRCLE = "円";
const MARKER_NONE = "なし";

// マーカーとアイコンの対応表 (表示用)
const MARKER_ICONS = {
  [MARKER_SHARE]: "💢",
  [MARKER_FAN]: "📐",
  [MARKER_CIRCLE]: "🔵",
  [MARKER_NONE]: "ー"
};

const PHASE_NAMES = {
  1: "1回目塔踏み",
  2: "2回目塔踏み",
  3: "過去/未来誘導",
  4: "3回目塔踏み",
  5: "4回目塔踏み",
  6: "過去/未来誘導",
  7: "5回目塔踏み",
  8: "6回目塔踏み",
  9: "過去/未来誘導",
  10: "7回目塔踏み",
  11: "8回目塔踏み",
  12: "過去/未来誘導"
};

// 1. 設定データのロードとゲーム初期化
window.addEventListener("DOMContentLoaded", () => {
  fetch("config.json")
    .then(res => res.json())
    .then(data => {
      config = data;
      initApp();
    })
    .catch(err => {
      console.error("設定ファイルの読み込みに失敗しました:", err);
      // フォールバック用のデフォルト設定
      config = {
        boss: { x: 512, y: 180, radius: 50 },
        circle_left: { x: 350, y: 380, radius: 70 },
        circle_right: { x: 674, y: 380, radius: 70 },
        phases: {}
      };
      initApp();
    });

  // レスポンシブスケーリングの設定
  window.addEventListener("resize", resizeGameField);
});

function initApp() {
  const selectedControl = document.querySelector('input[name="control-type"]:checked');
  controlType = selectedControl ? selectedControl.value : "wasd";

  setupCharacterSelection();
  setupEventListeners();
  resizeGameField();
}

// レスポンシブに1024x576のフィールドをスケールさせる
function resizeGameField() {
  const app = document.getElementById("app-container");
  const field = document.getElementById("game-field");
  const container = document.getElementById("game-container");
  const header = document.getElementById("game-header");
  if (!field || !container || !app) return;

  const baseWidth = 1024;
  const baseHeight = 576;
  
  // ビューポートサイズを取得
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  // 縦長画面（幅 < 高さ）かつスマホ操作（joystick）が選択されている場合、90度回転させる
  const shouldRotate = (viewportWidth < viewportHeight) && (controlType === "joystick");
  isCanvasRotated = shouldRotate;

  // 実質的な利用可能サイズ（回転を考慮）
  let screenWidth = viewportWidth;
  let screenHeight = viewportHeight;

  if (shouldRotate) {
    // app-container に回転用クラスを付与 (CSS側の絶対センタリングに任せる)
    app.classList.add("rotated");
    app.style.width = "";
    app.style.height = "";
    app.style.transform = "";
    app.style.transformOrigin = "";
    app.style.position = "";
    app.style.left = "";
    app.style.top = "";
    
    // 回転後の実質的な画面幅・高さ (反転)
    screenWidth = viewportHeight;
    screenHeight = viewportWidth;
  } else {
    // 通常状態に戻す
    app.classList.remove("rotated");
    app.style.width = "";
    app.style.height = "";
    app.style.transform = "";
    app.style.transformOrigin = "";
    app.style.position = "";
    app.style.left = "";
    app.style.top = "";
  }

  // ヘッダーの実質的な高さを取得（要素が存在し、表示されている場合）
  let headerHeight = 0;
  if (header && header.offsetHeight > 0) {
    const style = window.getComputedStyle(header);
    const marginTop = parseFloat(style.marginTop) || 0;
    const marginBottom = parseFloat(style.marginBottom) || 0;
    headerHeight = header.offsetHeight + marginTop + marginBottom;
  }

  // ゲームフィールドが使える最大の高さと幅
  // 上下の安全なマージン余白としてバッファを残す
  const availableWidth = screenWidth - 20;
  const availableHeight = screenHeight - headerHeight - 15;

  // スケーリングの計算 (縦横比を完全に維持しながら、使えるスペースに100%収める)
  const scaleX = availableWidth / baseWidth;
  const scaleY = availableHeight / baseHeight;
  
  // 絶対に画面からはみ出さない（上下左右に合わせる）ように Math.min で決定
  const scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.3));
  
  field.style.transform = `translate(-50%, -50%) scale(${scale})`;

  // 仮想スティックの位置調整
  const joystickContainer = document.getElementById("joystick-container");
  if (joystickContainer) {
    // 回転・通常に関わらず、常にローカルの「左下」に配置する（親要素が回転しているため、これで物理的にも左下になる）
    joystickContainer.style.left = "30px";
    joystickContainer.style.right = "auto";
    joystickContainer.style.bottom = "30px";
    joystickContainer.style.top = "auto";
  }
}

// キャラクター選択画面の構成
function setupCharacterSelection() {
  const grid = document.getElementById("char-selection-grid");
  grid.innerHTML = "";
  
  const roles = {
    "MT": "Main Tank", "ST": "Sub Tank",
    "H1": "Healer 1", "H2": "Healer 2",
    "D1": "DPS 1", "D2": "DPS 2",
    "D3": "DPS 3", "D4": "DPS 4"
  };

  CHAR_NAMES.forEach(name => {
    const card = document.createElement("div");
    card.className = "char-card";
    card.innerHTML = `
      <span class="char-name">${name}</span>
      <span class="char-role">${roles[name]}</span>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".char-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      playerChar = name;
      
      // 開始ボタンコンテナを表示する
      const startBtnContainer = document.getElementById("start-btn-container");
      if (startBtnContainer) {
        startBtnContainer.style.display = "block";
      }
      
      const startBtn = document.getElementById("start-game-btn");
      startBtn.classList.remove("disabled");
      startBtn.removeAttribute("disabled");
    });
    grid.appendChild(card);
  });
}

function setupEventListeners() {
  // スマホでの画面スクロールおよびバウンス防止
  document.addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });

  // 立ち位置確認中の画面クリック/タップでの再表示処理
  const handlePositionCheckDismiss = (e) => {
    if (!isCheckingPositions) return;
    isCheckingPositions = false;
    document.getElementById("game-over-overlay").classList.add("active");
  };

  document.addEventListener("click", handlePositionCheckDismiss);
  document.addEventListener("touchstart", handlePositionCheckDismiss);

  // 立ち位置確認ボタンの制御
  const failConfirmBtn = document.getElementById("fail-confirm-btn");
  if (failConfirmBtn) {
    failConfirmBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // 画面クリックイベントへのバブリングを防止
      document.getElementById("game-over-overlay").classList.remove("active");
      isCheckingPositions = true;
    });
    failConfirmBtn.addEventListener("touchstart", (e) => {
      e.stopPropagation();
    });
  }

  document.getElementById("start-game-btn").addEventListener("click", startGame);
  document.getElementById("next-phase-btn").addEventListener("click", proceedToNextPhase);
  document.getElementById("retry-game-btn").addEventListener("click", resetToStart);
  document.getElementById("restart-game-btn").addEventListener("click", resetToStart);

  // 操作方法の変更監視
  document.querySelectorAll('input[name="control-type"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      controlType = e.target.value;
      resizeGameField();
    });
  });

  // WASDキーボードイベントの監視
  window.addEventListener("keydown", (e) => {
    if (!isGameRunning || controlType !== "wasd") return;
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      keysPressed[key] = true;
    } else if (e.key === "ArrowUp") {
      keysPressed["w"] = true;
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      keysPressed["s"] = true;
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      keysPressed["a"] = true;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      keysPressed["d"] = true;
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    const key = e.key.toLowerCase();
    if (["w", "a", "s", "d"].includes(key)) {
      keysPressed[key] = false;
    } else if (e.key === "ArrowUp") {
      keysPressed["w"] = false;
    } else if (e.key === "ArrowDown") {
      keysPressed["s"] = false;
    } else if (e.key === "ArrowLeft") {
      keysPressed["a"] = false;
    } else if (e.key === "ArrowRight") {
      keysPressed["d"] = false;
    }
  });

  // 仮想スティックイベントの監視
  setupJoystickEvents();
}

function setupJoystickEvents() {
  const joystickBase = document.getElementById("joystick-base");
  const joystickHandle = document.getElementById("joystick-handle");
  if (!joystickBase || !joystickHandle) return;

  function handleTouchStart(e) {
    if (!isGameRunning || controlType !== "joystick") return;
    joystickActive = true;
    
    // スティックスケーリングを考慮した中心座標を取得
    const rect = joystickBase.getBoundingClientRect();
    joystickStartPos = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
    
    handleTouchMove(e);
  }

  function handleTouchMove(e) {
    if (!joystickActive) return;
    e.preventDefault(); // スマホのスクロールを抑制

    const touch = e.touches[0];
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    let deltaX = clientX - joystickStartPos.x;
    let deltaY = clientY - joystickStartPos.y;

    if (isCanvasRotated) {
      // 90度回転している場合、タッチの移動ベクトルを物理的な方向に変換する
      const tempX = deltaX;
      deltaX = deltaY;      // 物理的な右方向 (X) ＝ デバイスの下方向 (clientYの差分)
      deltaY = -tempX;     // 物理的な下方向 (Y) ＝ デバイスの左方向 (-clientXの差分)
    }

    let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // 最大ドラッグ距離
    const maxDistance = 45;

    if (distance > maxDistance) {
      deltaX = (deltaX / distance) * maxDistance;
      deltaY = (deltaY / distance) * maxDistance;
      distance = maxDistance;
    }

    // つまみの移動
    joystickHandle.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    // 入力ベクトルの計算 (-1.0 ~ 1.0)
    joystickInput.x = deltaX / maxDistance;
    joystickInput.y = deltaY / maxDistance;
  }

  function handleTouchEnd() {
    joystickActive = false;
    joystickHandle.style.transform = "translate(0px, 0px)";
    joystickInput.x = 0;
    joystickInput.y = 0;
  }

  joystickBase.addEventListener("touchstart", handleTouchStart, { passive: false });
  joystickBase.addEventListener("touchmove", handleTouchMove, { passive: false });
  joystickBase.addEventListener("touchend", handleTouchEnd);
  joystickBase.addEventListener("touchcancel", handleTouchEnd);
}

// ゲーム開始処理
function startGame() {
  if (!playerChar) return;

  // 操作方法の取得
  const selectedControl = document.querySelector('input[name="control-type"]:checked');
  controlType = selectedControl ? selectedControl.value : "wasd";

  const joystickContainer = document.getElementById("joystick-container");
  if (controlType === "joystick") {
    joystickContainer.classList.remove("hidden");
  } else {
    joystickContainer.classList.add("hidden");
  }

  // 入力状態リセット
  keysPressed = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  joystickInput = { x: 0, y: 0 };
  joystickActive = false;
  isGameRunning = false;
  
  // 画面切り替え
  document.getElementById("start-screen").classList.remove("active");
  document.getElementById("game-screen").classList.add("active");
  
  // 画面サイズに合わせた再スケーリングを実行（はみ出し防止）
  resizeGameField();
  setTimeout(resizeGameField, 100); // 遅延実行でレンダリング完了後にフィットさせる
  
  // 開始時間記録
  startTime = Date.now();
  currentPhase = 1;
  lastApocalypseText = "";
  hideMarkersAfterPhase1 = document.getElementById("hide-markers-mode-chk").checked;
  
  // 1. 初期マーカーの付与
  assignInitialMarkers();
  
  // 2. フェーズ1開始
  startPhase(1);
}

// 初期マーカーとグループの付与
function assignInitialMarkers() {
  characters = {};
  CHAR_NAMES.forEach(name => {
    characters[name] = {
      marker: MARKER_NONE,
      group: "",
      x: 0,
      y: 0
    };
  });

  // 1. [MT, ST, H1, H2] からランダムに1人に頭割り
  const tanksHealers = ["MT", "ST", "H1", "H2"];
  const shareTH = tanksHealers[Math.floor(Math.random() * 4)];
  characters[shareTH].marker = MARKER_SHARE;

  // 2. [D1, D2, D3, D4] からランダムに1人に頭割り
  const dps = ["D1", "D2", "D3", "D4"];
  const shareDPS = dps[Math.floor(Math.random() * 4)];
  characters[shareDPS].marker = MARKER_SHARE;

  // 3. 頭割りマーカーがついていない TH 3名 または DPS 3名 のどちらかに扇マーカーをつけ、もう片方に円マーカーをつける
  const remainingTH = tanksHealers.filter(name => name !== shareTH);
  const remainingDPS = dps.filter(name => name !== shareDPS);

  const isFanTH = Math.random() < 0.5;
  const fanTargets = isFanTH ? remainingTH : remainingDPS;
  const circleTargets = isFanTH ? remainingDPS : remainingTH;

  fanTargets.forEach(name => {
    characters[name].marker = MARKER_FAN;
  });

  circleTargets.forEach(name => {
    characters[name].marker = MARKER_CIRCLE;
  });

  // 4. グループ分けの計算
  // 頭割りマーカーがついたキャラが属する組（ペア）を特定
  let group1Pairs = [];
  PAIRS.forEach(pair => {
    if (pair.includes(shareTH) || pair.includes(shareDPS)) {
      group1Pairs.push(pair);
    }
  });

  // group1Pairsに入っている全4キャラがグループ1、残りの2組（4キャラ）がグループ2
  CHAR_NAMES.forEach(name => {
    const isGroup1 = group1Pairs.some(pair => pair.includes(name));
    characters[name].group = isGroup1 ? "グループ1" : "グループ2";
  });

  // プレイヤーのグループバッジ更新
  const pGroup = characters[playerChar].group;
  const badge = document.getElementById("player-group-badge");
  badge.textContent = pGroup;
  badge.className = `badge group-badge ${pGroup === "グループ1" ? "g1" : "g2"}`;
  
  document.getElementById("player-char-name").textContent = playerChar;
}

// フェーズ開始処理
function startPhase(phaseNum) {
  currentPhase = phaseNum;
  isAnimating = false;
  isGameRunning = false;
  
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (timerInterval) clearInterval(timerInterval);
  
  if (phaseNum === 12) {
    phase12Step = 1;
  }
  
  // フェーズ開始時にスケーリングを再計算
  resizeGameField();
  
  // ヘッダー表示更新
  document.getElementById("current-phase-num").textContent = String(phaseNum).padStart(2, "0");
  
  const phaseTypeBadge = document.getElementById("phase-type-badge");
  const phaseMsg = document.getElementById("phase-message");
  
  // 終焉テキスト非表示
  const apocEl = document.getElementById("apocalypse-text");
  apocEl.className = "apocalypse-text";
  apocEl.textContent = "";

  // 2. 基本オブジェクト（ボス、円）の位置調整
  renderBaseObjects();

  // 3. キャラクターを初期位置（画面左上の整列位置）に配置
  resetCharacterPositions();

  // フェーズタイプに応じた挙動
  const type = getPhaseType(phaseNum);
  
  // 指定されたフェーズ名を表示
  phaseTypeBadge.textContent = PHASE_NAMES[phaseNum];
  
  // タイマー表示領域の表示制御
  const timerContainer = document.getElementById("timer-container");
  
  if (type === "odd") {
    phaseTypeBadge.style.borderColor = "var(--neon-blue)";
    phaseTypeBadge.style.color = "var(--neon-blue)";
    phaseMsg.textContent = "マーカーとグループを基に、正しい塔の位置へ移動せよ";
    
    renderTargetAreas();
    
    // タイマースタート
    if (timerContainer) timerContainer.classList.remove("hidden");
    const limit = config.phases[String(phaseNum)]?.time_limit || 10;
    startTimer(limit);
    
    // ゲームループ開始
    isGameRunning = true;
    runGameLoop();
  } 
  else if (type === "even") {
    phaseTypeBadge.style.borderColor = "var(--neon-yellow)";
    phaseTypeBadge.style.color = "var(--neon-yellow)";
    phaseMsg.textContent = "終焉の予兆が出現！正しい塔の位置へ移動せよ";
    
    // ボスの上にランダムでテキスト表示
    const isFuture = Math.random() < 0.5;
    lastApocalypseText = isFuture ? "未来の終焉" : "過去の終焉";
    
    apocEl.textContent = lastApocalypseText;
    apocEl.classList.add(isFuture ? "future" : "past");
    
    renderTargetAreas();
    
    // タイマースタート
    if (timerContainer) timerContainer.classList.remove("hidden");
    const limit = config.phases[String(phaseNum)]?.time_limit || 10;
    startTimer(limit);
    
    // ゲームループ開始
    isGameRunning = true;
    runGameLoop();
  } 
  else if (type === "past_future") {
    phaseTypeBadge.style.borderColor = "var(--neon-purple)";
    phaseTypeBadge.style.color = "var(--neon-purple)";
    
    // 答えとなるテロップは出さない
    apocEl.textContent = "";
    apocEl.className = "apocalypse-text";
    
    if (phaseNum === 12) {
      phaseMsg.textContent = "フェーズ12: 1. Aマーカーへ集合してください";
      // フェーズ12ステップ1はタイマー非表示でA集合を待つ
      if (timerContainer) timerContainer.classList.add("hidden");
      renderPastFutureTargetAreas();
      
      isGameRunning = true;
      runGameLoop();
    } else {
      phaseMsg.textContent = "直前の予兆に基づき、ボスの上または下へ誘導せよ";
      if (timerContainer) timerContainer.classList.remove("hidden");
      renderPastFutureTargetAreas();
      
      const limit = config.phases[String(phaseNum)]?.time_limit || 10;
      startTimer(limit);
      
      isGameRunning = true;
      runGameLoop();
    }
  }
}

// フェーズタイプの判定
function getPhaseType(phaseNum) {
  if ([1, 4, 7, 10].includes(phaseNum)) return "odd";
  if ([2, 5, 8, 11].includes(phaseNum)) return "even";
  return "past_future";
}

// 基本オブジェクトの描画
function renderBaseObjects() {
  const bossEl = document.getElementById("boss-object");
  const circleLEl = document.getElementById("circle-left-object");
  const circleREl = document.getElementById("circle-right-object");
  
  const b = config.boss;
  bossEl.style.left = `${b.x}px`;
  bossEl.style.top = `${b.y}px`;
  bossEl.style.width = `${b.radius * 2}px`;
  bossEl.style.height = `${b.radius * 2}px`;
  
  const cl = config.circle_left;
  circleLEl.style.left = `${cl.x}px`;
  circleLEl.style.top = `${cl.y}px`;
  circleLEl.style.width = `${cl.radius * 2}px`;
  circleLEl.style.height = `${cl.radius * 2}px`;
  
  const cr = config.circle_right;
  circleREl.style.left = `${cr.x}px`;
  circleREl.style.top = `${cr.y}px`;
  circleREl.style.width = `${cr.radius * 2}px`;
  circleREl.style.height = `${cr.radius * 2}px`;
}

// キャラクターを画面左上の整列位置に配置する（全フェーズ共通）
function resetCharacterPositions() {
  const container = document.getElementById("characters-container");
  container.innerHTML = "";
  
  // 上段（1行目）: MT, ST, D1, D2
  // 下段（2行目）: H1, H2, D3, D4
  const rows = {
    "MT": { row: 1, col: 0 },
    "ST": { row: 1, col: 1 },
    "D1": { row: 1, col: 2 },
    "D2": { row: 1, col: 3 },
    "H1": { row: 2, col: 0 },
    "H2": { row: 2, col: 1 },
    "D3": { row: 2, col: 2 },
    "D4": { row: 2, col: 3 }
  };

  CHAR_NAMES.forEach(name => {
    // フェーズ1のときのみ、初期整列位置 (X=400〜610, Y=475〜525) に座標をリセット
    if (currentPhase === 1) {
      const pos = rows[name];
      const x = 400 + pos.col * 70;
      const y = 475 + (pos.row - 1) * 50;
      characters[name].x = x;
      characters[name].y = y;
    }
    
    const x = characters[name].x;
    const y = characters[name].y;
    
    const pawn = document.createElement("div");
    pawn.id = `char-pawn-${name}`;
    pawn.className = "char-pawn";
    if (name === playerChar) pawn.classList.add("player");
    
    // フェーズ2以降の開始時は transition なしで瞬時に前回の正解位置に配置
    if (currentPhase > 1) {
      pawn.classList.add("no-transition");
    }
    
    pawn.style.left = `${x}px`;
    pawn.style.top = `${y}px`;
    pawn.textContent = name;
    
    // マーカーに応じたクラス追加
    const m = characters[name].marker;
    const shouldShowMarker = !hideMarkersAfterPhase1 || currentPhase === 1 || changedMarkerChars.includes(name);
    if (shouldShowMarker) {
      if (m === MARKER_SHARE) pawn.classList.add("marker-share");
      else if (m === MARKER_FAN) pawn.classList.add("marker-fan");
      else if (m === MARKER_CIRCLE) pawn.classList.add("marker-circle");
    }
    
    container.appendChild(pawn);
  });
}

// 設定ファイル（config.json）に基づく回答ボタンの描画
// タイマー関連の処理
function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval);
  
  timeRemaining = durationSeconds * 1000;
  updateTimerUI();
  
  const timerStart = Date.now();
  const targetTime = timeRemaining;

  timerInterval = setInterval(() => {
    const elapsed = Date.now() - timerStart;
    timeRemaining = Math.max(0, targetTime - elapsed);
    updateTimerUI();

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      timerInterval = null;
      handleTimeUp();
    }
  }, 50);
}

function updateTimerUI() {
  const countdownEl = document.getElementById("timer-countdown");
  const barEl = document.getElementById("timer-bar");
  if (!countdownEl || !barEl) return;

  const seconds = (timeRemaining / 1000).toFixed(1);
  countdownEl.textContent = seconds;

  // 現在のフェーズの最大秒数
  const maxLimit = config.phases[String(currentPhase)]?.time_limit || 10;
  const percentage = Math.max(0, Math.min(100, (timeRemaining / (maxLimit * 1000)) * 100));
  barEl.style.height = `${percentage}%`; // 高さを変更（縦型）
  barEl.style.width = '100%';

  // フェーズ開始から5秒（5000ms）経過したら、一時表示されていたマーカーを非表示にする
  const elapsedMs = (maxLimit * 1000) - timeRemaining;
  if (elapsedMs >= 5000) {
    hideTemporaryMarkers();
  }

  // 残り時間が少なくなったらネオンカラーを赤に変更
  if (percentage < 30) {
    countdownEl.className = "value text-neon-red animate-pulse";
    barEl.style.background = "var(--neon-red)";
    barEl.style.boxShadow = "0 0 10px var(--neon-red)";
  } else if (percentage < 60) {
    countdownEl.className = "value text-neon-orange";
    barEl.style.background = "var(--neon-orange)";
    barEl.style.boxShadow = "0 0 10px var(--neon-orange)";
  } else {
    countdownEl.className = "value text-neon-yellow";
    barEl.style.background = "linear-gradient(to top, var(--neon-red) 0%, var(--neon-orange) 50%, var(--neon-yellow) 100%)"; // 縦グラデーション
    barEl.style.boxShadow = "0 0 10px rgba(255, 238, 0, 0.5)";
  }
}

function hideTemporaryMarkers() {
  if (changedMarkerChars.length === 0) return;

  // マーカー非表示モードのときのみ、一時表示マーカーを消去する
  if (hideMarkersAfterPhase1) {
    changedMarkerChars.forEach(name => {
      const pawn = document.getElementById(`char-pawn-${name}`);
      if (pawn) {
        pawn.classList.remove("marker-share", "marker-fan", "marker-circle");
      }
    });
  }

  changedMarkerChars = [];
}

// ゲームループ
function runGameLoop() {
  if (!isGameRunning) return;

  updatePlayerPosition();
  checkTargetAreaCollisions();

  gameLoopId = requestAnimationFrame(runGameLoop);
}

function updatePlayerPosition() {
  if (!playerChar || !characters[playerChar]) return;

  // ゲーム実行中・操作中は常にtransitionを無効化することでガタつきを防止
  const pawn = document.getElementById(`char-pawn-${playerChar}`);
  if (pawn) {
    pawn.classList.add("no-transition");
  }

  let moveX = 0;
  let moveY = 0;

  if (controlType === "wasd") {
    if (keysPressed.w) moveY -= 1;
    if (keysPressed.s) moveY += 1;
    if (keysPressed.a) moveX -= 1;
    if (keysPressed.d) moveX += 1;
  } else if (controlType === "joystick") {
    moveX = joystickInput.x;
    moveY = joystickInput.y;
  }

  // 入力がある場合のみ座標を更新
  if (moveX !== 0 || moveY !== 0) {
    let dx = moveX;
    let dy = moveY;

    if (controlType === "wasd") {
      // WASDの斜め移動を正規化
      const length = Math.sqrt(dx * dx + dy * dy);
      dx = dx / length;
      dy = dy / length;
    }

    // プレイヤーの新しい座標を計算
    let newX = characters[playerChar].x + dx * playerSpeed;
    let newY = characters[playerChar].y + dy * playerSpeed;

    // 1024x576のフィールド境界でのクランプ（直径38pxなので半径19px分内側に）
    const halfSize = 19;
    newX = Math.max(halfSize, Math.min(1024 - halfSize, newX));
    newY = Math.max(halfSize, Math.min(576 - halfSize, newY));

    characters[playerChar].x = newX;
    characters[playerChar].y = newY;

    // DOM要素へ反映
    if (pawn) {
      pawn.style.left = `${newX}px`;
      pawn.style.top = `${newY}px`;
    }
  }
}

// プレイヤーがいずれかのターゲットエリア内にいるかチェック
function checkTargetAreaCollisions() {
  if (!playerChar || !characters[playerChar]) return;

  const px = characters[playerChar].x;
  const py = characters[playerChar].y;

  currentTargetAreas.forEach(area => {
    // ターゲットエリアの範囲判定 (矩形: 中心 x, y から w, h)
    const withinX = px >= (area.x - area.w / 2) && px <= (area.x + area.w / 2);
    const withinY = py >= (area.y - area.h / 2) && py <= (area.y + area.h / 2);

    if (withinX && withinY) {
      area.el.classList.add("active");
      
      // フェーズ12ステップ1の特別処理（A集合に到達したらステップ2へ）
      if (currentPhase === 12 && phase12Step === 1) {
        handlePhase12Step1Reached();
      }
    } else {
      area.el.classList.remove("active");
    }
  });
}

function handlePhase12Step1Reached() {
  // 進行を一時停止
  isGameRunning = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (timerInterval) clearInterval(timerInterval);

  isAnimating = true;
  
  // Aマーカーに全員を集合（NPCもワープ）
  const b = config.boss;
  const topX = b.x;
  const topY = b.y - 85;
  CHAR_NAMES.forEach(name => {
    const pawn = document.getElementById(`char-pawn-${name}`);
    if (pawn) {
      pawn.classList.remove("no-transition"); // transitionを有効にして吸い込まれるように見せる
      pawn.style.left = `${topX}px`;
      pawn.style.top = `${topY}px`;
    }
    characters[name].x = topX;
    characters[name].y = topY;
  });

  setTimeout(() => {
    isAnimating = false;
    phase12Step = 2;
    // ステップ2をスタート
    startPhase12Step2();
  }, 750);
}

function startPhase12Step2() {
  // ステップ2はタイマーあり（10秒）
  const timerContainer = document.getElementById("timer-container");
  if (timerContainer) timerContainer.classList.remove("hidden");

  // ターゲットエリアの再描画
  renderPastFutureTargetAreas();
  
  // ゲームループ再始動
  isGameRunning = true;
  runGameLoop();
  
  // タイマースタート
  startTimer(10);
}

// ターゲットエリアの描画
function renderTargetAreas() {
  const container = document.getElementById("target-areas-container");
  container.innerHTML = "";
  currentTargetAreas = [];

  const phData = config.phases[String(currentPhase)];
  if (!phData || !phData.buttons || phData.buttons.length === 0) {
    return;
  }

  phData.buttons.forEach(btn => {
    const el = document.createElement("div");
    el.className = "target-area";
    el.style.left = `${btn.x}px`;
    el.style.top = `${btn.y}px`;
    el.style.width = `${btn.w}px`;
    el.style.height = `${btn.h}px`;
    el.innerHTML = btn.label.replace(/\n/g, "<br>");

    container.appendChild(el);

    currentTargetAreas.push({
      id: btn.id,
      x: btn.x,
      y: btn.y,
      w: btn.w,
      h: btn.h,
      condition: btn.condition,
      priority_type: btn.priority_type || "",
      el: el
    });
  });
}

function renderPastFutureTargetAreas() {
  const container = document.getElementById("target-areas-container");
  container.innerHTML = "";
  currentTargetAreas = [];

  const b = config.boss;
  const cl = config.circle_left;
  const cr = config.circle_right;

  // 1. ボスの上
  const topX = b.x;
  const topY = b.y - 85;

  // 2. ボスの下
  const bottomX = Math.round((cl.x + cr.x) / 2);
  const bottomY = Math.round((cl.y + cr.y) / 2);

  if (currentPhase === 12 && phase12Step === 1) {
    // Aマーカー集合
    const el = document.createElement("div");
    el.className = "target-area";
    el.style.left = `${topX}px`;
    el.style.top = `${topY}px`;
    el.style.width = "90px";
    el.style.height = "90px";
    el.textContent = "Aマーカー集合";
    container.appendChild(el);

    currentTargetAreas.push({
      id: "a-gather",
      x: topX,
      y: topY,
      w: 90,
      h: 90,
      condition: "true",
      priority_type: "",
      el: el
    });
    return;
  }

  // ステップ2または誘導フェーズのエリア
  let topLabel = "未来の終焉を誘導";
  let bottomLabel = "過去の終焉を誘導";
  let topCond = (lastApocalypseText === "未来の終焉") ? "true" : "false";
  let bottomCond = (lastApocalypseText === "過去の終焉") ? "true" : "false";

  if (currentPhase === 12 && phase12Step === 2) {
    topLabel = "過去の終焉を避ける";
    bottomLabel = "未来の終焉を避ける";
    const isPastApoc = (lastApocalypseText === "過去の終焉" || lastApocalypseText === "過去 of 終焉");
    topCond = isPastApoc ? "true" : "false";
    bottomCond = !isPastApoc ? "true" : "false";
  }

  // 上エリア
  const elTop = document.createElement("div");
  elTop.className = "target-area";
  elTop.style.left = `${topX}px`;
  elTop.style.top = `${topY}px`;
  elTop.style.width = "140px";
  elTop.style.height = "70px";
  elTop.innerHTML = topLabel;
  container.appendChild(elTop);

  currentTargetAreas.push({
    id: "誘導_上",
    x: topX,
    y: topY,
    w: 140,
    h: 70,
    condition: topCond,
    priority_type: "",
    el: elTop
  });

  // 下エリア
  const elBottom = document.createElement("div");
  elBottom.className = "target-area";
  elBottom.style.left = `${bottomX}px`;
  elBottom.style.top = `${bottomY}px`;
  elBottom.style.width = "140px";
  elBottom.style.height = "70px";
  elBottom.innerHTML = bottomLabel;
  container.appendChild(elBottom);

  currentTargetAreas.push({
    id: "誘導_下",
    x: bottomX,
    y: bottomY,
    w: 140,
    h: 70,
    condition: bottomCond,
    priority_type: "",
    el: elBottom
  });
}

function handleTimeUp() {
  isGameRunning = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (timerInterval) clearInterval(timerInterval);

  // 全キャラのDOM要素のtransitionを一時無効にして瞬時にワープ
  CHAR_NAMES.forEach(name => {
    const pawn = document.getElementById(`char-pawn-${name}`);
    if (pawn) {
      pawn.classList.add("no-transition");
    }
  });

  const phData = config.phases[String(currentPhase)] || {};
  const priority = phData.priority || "";

  // NPC 7人（プレイヤー以外）を正解の位置にワープ
  CHAR_NAMES.forEach(name => {
    if (name === playerChar) return;

    // このキャラが正解となるエリアを探す
    let destination = null;
    for (let area of currentTargetAreas) {
      if (evaluateButtonCorrectness(name, area.condition, priority, area.priority_type)) {
        destination = area;
        break;
      }
    }

    if (destination) {
      characters[name].x = destination.x;
      characters[name].y = destination.y;
      const pawn = document.getElementById(`char-pawn-${name}`);
      if (pawn) {
        pawn.style.left = `${destination.x}px`;
        pawn.style.top = `${destination.y}px`;
      }
    }
  });

  // プレイヤーの正答チェック
  let playerCorrectArea = null;
  for (let area of currentTargetAreas) {
    if (evaluateButtonCorrectness(playerChar, area.condition, priority, area.priority_type)) {
      playerCorrectArea = area;
      break;
    }
  }

  // 少しのディレイを置いて判定を行い、ワープしたNPCの配置を見せる
  setTimeout(() => {
    const px = characters[playerChar].x;
    const py = characters[playerChar].y;

    let isCorrect = false;
    if (playerCorrectArea) {
      const withinX = px >= (playerCorrectArea.x - playerCorrectArea.w / 2) && px <= (playerCorrectArea.x + playerCorrectArea.w / 2);
      const withinY = py >= (playerCorrectArea.y - playerCorrectArea.h / 2) && py <= (playerCorrectArea.y + playerCorrectArea.h / 2);
      isCorrect = withinX && withinY;
    }

    if (isCorrect) {
      // 成功判定なら、プレイヤーも正しい位置に補正
      characters[playerChar].x = playerCorrectArea.x;
      characters[playerChar].y = playerCorrectArea.y;
      const pawn = document.getElementById(`char-pawn-${playerChar}`);
      if (pawn) {
        pawn.style.left = `${playerCorrectArea.x}px`;
        pawn.style.top = `${playerCorrectArea.y}px`;
      }
      setTimeout(handleSuccess, 300);
    } else {
      let failReason = "時間内に正しい立ち位置に移動できませんでした";
      
      // 誤ったエリアに立っているかチェック
      let stoodArea = null;
      for (let area of currentTargetAreas) {
        const withinX = px >= (area.x - area.w / 2) && px <= (area.x + area.w / 2);
        const withinY = py >= (area.y - area.h / 2) && py <= (area.y + area.h / 2);
        if (withinX && withinY) {
          stoodArea = area;
          break;
        }
      }

      if (stoodArea) {
        const satisfiesCondition = evaluateCondition(stoodArea.condition, playerChar, characters[playerChar].group, characters[playerChar].marker);
        if (satisfiesCondition) {
          failReason = `優先度が違います（本来は ${playerCorrectArea ? playerCorrectArea.el.textContent.replace(/<br>/g, " ") : "別の場所"} ですが、${stoodArea.el.textContent.replace(/<br>/g, " ")} に立っていました）`;
        } else {
          failReason = `立ち位置が違います（本来は ${playerCorrectArea ? playerCorrectArea.el.textContent.replace(/<br>/g, " ") : "別の場所"} ですが、${stoodArea.el.textContent.replace(/<br>/g, " ")} に立っていました）`;
        }
      } else {
        failReason = `ギミック発動時にどの散開位置・塔にも入っていませんでした（本来は ${playerCorrectArea ? playerCorrectArea.el.textContent.replace(/<br>/g, " ") : "別の場所"}）`;
      }

      handleFailure(failReason);
    }
  }, 350);
}

// 優先度を含めたボタンの正答判定
function evaluateButtonCorrectness(playerChar, conditionStr, priority, priorityType) {
  if (!priorityType || priorityType === "") {
    // 優先度判定が設定されていない場合は、従来どおり個人が条件を満たしているかで判定
    const playerInfo = characters[playerChar];
    return evaluateCondition(conditionStr, playerChar, playerInfo.group, playerInfo.marker);
  }

  // 優先度判定が設定されている場合
  // 1. 全8キャラのうち、条件を満たす者をすべて見つける
  const matchingChars = [];
  for (let charName of CHAR_NAMES) {
    const charInfo = characters[charName];
    if (evaluateCondition(conditionStr, charName, charInfo.group, charInfo.marker)) {
      matchingChars.push(charName);
    }
  }

  // プレイヤー自身が条件を満たしていなければ、正答になり得ない
  if (!matchingChars.includes(playerChar)) {
    return false;
  }

  // 2. 優先度リストの解析 (例: "H2 > H1 > ST > MT > D1 > D2 > D3 > D4")
  const priorityList = priority ? priority.split(">").map(s => s.trim()) : [];

  // 3. 条件を満たすキャラを優先度順にソート (最も優先度が高いものが先頭に来る)
  matchingChars.sort((a, b) => {
    let idxA = priorityList.indexOf(a);
    let idxB = priorityList.indexOf(b);
    if (idxA === -1) idxA = 999;
    if (idxB === -1) idxB = 999;
    return idxA - idxB;
  });

  // 4. 大きい方 (より左側、インデックス最小) / 小さい方 (より右側、インデックス最大) を取得して比較
  let targetChar = "";
  if (priorityType === "larger") {
    targetChar = matchingChars[0];
  } else if (priorityType === "smaller") {
    targetChar = matchingChars[matchingChars.length - 1];
  }

  return playerChar === targetChar;
}

// 条件式評価関数
function evaluateCondition(conditionStr, charName, group, marker) {
  if (conditionStr === "true") return true;
  if (conditionStr === "false") return false;
  if (!conditionStr || conditionStr.trim() === "") return true;
  
  // 括弧の周りにスペースを挿入して分割しやすくする
  let s = conditionStr.replace(/\(/g, " ( ").replace(/\)/g, " ) ");
  let tokens = s.trim().split(/\s+/).filter(t => t !== "");
  
  let exprParts = [];
  for (let token of tokens) {
    let tokLower = token.toLowerCase();
    if (tokLower === "and") {
      exprParts.push("&&");
    } else if (tokLower === "or") {
      exprParts.push("||");
    } else if (tokLower === "not") {
      exprParts.push("!");
    } else if (token === "(" || token === ")") {
      exprParts.push(token);
    } else if (token === "グループ1") {
      exprParts.push(`(group === "グループ1")`);
    } else if (token === "グループ2") {
      exprParts.push(`(group === "グループ2")`);
    } else if (token === "頭割り") {
      exprParts.push(`(marker === "頭割り")`);
    } else if (token === "扇") {
      exprParts.push(`(marker === "扇")`);
    } else if (token === "円") {
      exprParts.push(`(marker === "円")`);
    } else if (token === "なし") {
      exprParts.push(`(marker === "なし" || !marker)`);
    } else if (CHAR_NAMES.includes(token)) {
      exprParts.push(`(charName === "${token}")`);
    } else {
      // 不正トークンは評価失敗とする
      console.warn("Invalid token:", token);
      return false;
    }
  }
  
  let exprStr = exprParts.join(" ");
  try {
    let fn = new Function("charName", "group", "marker", `return (${exprStr});`);
    return fn(charName, group, marker);
  } catch (e) {
    console.error("構文エラーによる評価失敗:", conditionStr, e);
    return false;
  }
}

// 正解時の処理
function handleSuccess() {
  if (currentPhase === 12) {
    // ゲームクリア！
    showGameClear();
    return;
  }
  
  // フェーズタイプ
  const type = getPhaseType(currentPhase);
  
  if (type === "past_future") {
    // 過去/未来誘導フェーズにはマーカー変化がないため、確認画面を挟まず即座に次へ
    startPhase(currentPhase + 1);
  } 
  else {
    // 奇数/偶数フェーズ：マーカーの変化を実行し、確認ダイアログを表示
    applyMarkerChanges();
  }
}

// マーカー変化処理の実行
function applyMarkerChanges() {
  const phData = config.phases[String(currentPhase)] || {};
  const targetGroup = phData.change_target_group || "";
  
  const recordList = []; // ダイアログに表示するための前後データ記録
  
  // コピーを作成
  const oldMarkers = {};
  CHAR_NAMES.forEach(name => {
    oldMarkers[name] = characters[name].marker;
  });

  const type = getPhaseType(currentPhase);
  let targets = [];
  
  if (currentPhase === 10 || currentPhase === 11) {
    // マーカー消滅フェーズ：指定グループに属する4人のマーカーを消去
    if (targetGroup === "グループ1" || targetGroup === "グループ2") {
      targets = CHAR_NAMES.filter(name => characters[name].group === targetGroup);
      targets.forEach(name => {
        characters[name].marker = MARKER_NONE;
      });
    }
  } 
  else if (targetGroup === "グループ1" || targetGroup === "グループ2") {
    // 指定グループに属する4人のキャラ名を取得
    targets = CHAR_NAMES.filter(name => characters[name].group === targetGroup);
    
    if (targets.length === 4) {
      // 通常の変化ルール
      const shuffledTargets = [...targets].sort(() => 0.5 - Math.random());
      
      if (type === "odd") {
        // 奇数：ランダム2人が「円」、残り2人が「扇」
        characters[shuffledTargets[0]].marker = MARKER_CIRCLE;
        characters[shuffledTargets[1]].marker = MARKER_CIRCLE;
        characters[shuffledTargets[2]].marker = MARKER_FAN;
        characters[shuffledTargets[3]].marker = MARKER_FAN;
      } 
      else if (type === "even") {
        // 偶数：1人「円」、1人「扇」、2人「頭割り」
        characters[shuffledTargets[0]].marker = MARKER_CIRCLE;
        characters[shuffledTargets[1]].marker = MARKER_FAN;
        characters[shuffledTargets[2]].marker = MARKER_SHARE;
        characters[shuffledTargets[3]].marker = MARKER_SHARE;
      }
    }
  }

  // 変化結果の記録を作成
  targets.forEach(name => {
    recordList.push({
      name: name,
      before: oldMarkers[name],
      after: characters[name].marker
    });
  });

  // 今回マーカーが新しく付与された（消去フェーズ以外）キャラを一時表示対象として記録
  changedMarkerChars = [];
  if (currentPhase !== 10 && currentPhase !== 11) {
    targets.forEach(name => {
      if (characters[name].marker !== MARKER_NONE) {
        changedMarkerChars.push(name);
      }
    });
  }

  // 確認画面を表示せず、即座に次のフェーズを開始する
  startPhase(currentPhase + 1);
}

// 変化確認オーバーレイの表示
function showPhaseClearOverlay(records) {
  const overlay = document.getElementById("phase-clear-overlay");
  const grid = document.getElementById("changed-markers-grid");
  const apocBox = document.getElementById("apocalypse-record-box");
  
  grid.innerHTML = "";
  
  // 終焉テキストの記録を表示（ある場合）
  if (getPhaseType(currentPhase) === "even") {
    apocBox.style.display = "block";
    apocBox.innerHTML = `出現した予兆: <span class="${lastApocalypseText === "未来の終焉" ? "text-neon-blue" : "text-neon-purple"}">${lastApocalypseText}</span> (次の誘導フェーズで重要)`;
  } else {
    apocBox.style.display = "none";
  }

  // 変化リストカードの生成
  records.forEach(rec => {
    const card = document.createElement("div");
    card.className = "marker-change-card";
    if (rec.name === playerChar) {
      card.classList.add("highlight");
    }
    
    card.innerHTML = `
      <span class="card-char">${rec.name}${rec.name === playerChar ? " (YOU)" : ""}</span>
      <span class="card-marker-icon">${MARKER_ICONS[rec.after]}</span>
      <span class="card-marker-name">${rec.after}</span>
    `;
    grid.appendChild(card);
  });
  
  overlay.classList.add("active");
}

// 確認ダイアログの「次へ」ボタンを押したときの処理
function proceedToNextPhase() {
  document.getElementById("phase-clear-overlay").classList.remove("active");
  startPhase(currentPhase + 1);
}

// 不正解時の処理
function handleFailure(reason = "立ち位置が違います") {
  document.getElementById("fail-cause-text").textContent = `要因: ${reason}`;
  document.getElementById("game-over-overlay").classList.add("active");
}

// ゲームクリア時の処理
function showGameClear() {
  const timeTaken = Math.round((Date.now() - startTime) / 1000);
  const min = String(Math.floor(timeTaken / 60)).padStart(2, "0");
  const sec = String(timeTaken % 60).padStart(2, "0");
  
  document.getElementById("final-char").textContent = playerChar;
  document.getElementById("clear-time").textContent = `${min}:${sec}`;
  
  document.getElementById("game-clear-overlay").classList.add("active");
}

function resetToStart() {
  isGameRunning = false;
  isCheckingPositions = false;
  if (gameLoopId) cancelAnimationFrame(gameLoopId);
  if (timerInterval) clearInterval(timerInterval);
  
  keysPressed = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };
  joystickInput = { x: 0, y: 0 };
  joystickActive = false;
  changedMarkerChars = [];

  document.getElementById("game-over-overlay").classList.remove("active");
  document.getElementById("game-clear-overlay").classList.remove("active");
  document.getElementById("game-screen").classList.remove("active");
  document.getElementById("start-screen").classList.add("active");
  
  const startBtnContainer = document.getElementById("start-btn-container");
  if (startBtnContainer) {
    startBtnContainer.style.display = "none";
  }
  const startBtn = document.getElementById("start-game-btn");
  if (startBtn) {
    startBtn.classList.add("disabled");
    startBtn.setAttribute("disabled", "true");
  }

  playerChar = null;
  setupCharacterSelection();
}
