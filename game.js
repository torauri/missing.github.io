// ゲーム状態管理
let config = null;
let playerChar = null; // プレイヤーのキャラ名 ("MT", "ST", ...)
let characters = {};  // 全キャラ情報 { "MT": { marker: "頭割り", group: "グループ1", x: 0, y: 0 }, ... }
let currentPhase = 1;
let lastApocalypseText = ""; // 直近の偶数フェーズで出たテキスト ("過去の終焉" または "未来の終焉")
let startTime = 0;
let isAnimating = false;

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
  resizeGameField();
  setupCharacterSelection();
  setupEventListeners();
}

// レスポンシブに1024x576のフィールドをスケールさせる
function resizeGameField() {
  const field = document.getElementById("game-field");
  const container = document.getElementById("game-container");
  if (!field || !container) return;

  const baseWidth = 1024;
  const baseHeight = 576;
  
  const containerWidth = container.clientWidth;
  const containerHeight = container.clientHeight;
  
  const scaleX = containerWidth / baseWidth;
  const scaleY = containerHeight / baseHeight;
  const scale = Math.min(scaleX, scaleY, 1.3); // 最大1.3倍まで拡大、基本はフィット
  
  // 常に中央を基準にしてスケーリングを適用
  field.style.transform = `translate(-50%, -50%) scale(${scale})`;
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
      
      const startBtn = document.getElementById("start-game-btn");
      startBtn.classList.remove("disabled");
      startBtn.removeAttribute("disabled");
    });
    grid.appendChild(card);
  });
}

function setupEventListeners() {
  document.getElementById("start-game-btn").addEventListener("click", startGame);
  document.getElementById("next-phase-btn").addEventListener("click", proceedToNextPhase);
  document.getElementById("retry-game-btn").addEventListener("click", resetToStart);
  document.getElementById("restart-game-btn").addEventListener("click", resetToStart);
}

// ゲーム開始処理
function startGame() {
  if (!playerChar) return;
  
  // 画面切り替え
  document.getElementById("start-screen").classList.remove("active");
  document.getElementById("game-screen").classList.add("active");
  
  // 開始時間記録
  startTime = Date.now();
  currentPhase = 1;
  lastApocalypseText = "";
  
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

  // 残り6人
  const remainingChars = CHAR_NAMES.filter(name => name !== shareTH && name !== shareDPS);
  
  // 3. 残り6人からランダムに3人に扇マーカー
  // シャッフル
  const shuffled = [...remainingChars].sort(() => 0.5 - Math.random());
  const fanTargets = shuffled.slice(0, 3);
  const circleTargets = shuffled.slice(3, 6);

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

  // 3. キャラクターを初期位置（ボスの周りの円周上）に配置
  resetCharacterPositions();

  // フェーズタイプに応じた挙動
  const type = getPhaseType(phaseNum);
  
  // 指定されたフェーズ名を表示
  phaseTypeBadge.textContent = PHASE_NAMES[phaseNum];
  
  if (type === "odd") {
    phaseTypeBadge.style.borderColor = "var(--neon-blue)";
    phaseTypeBadge.style.color = "var(--neon-blue)";
    phaseMsg.textContent = "マーカーとグループを基に、正しい塔（ボタン）を踏め";
    renderActionButtons();
  } 
  else if (type === "even") {
    phaseTypeBadge.style.borderColor = "var(--neon-yellow)";
    phaseTypeBadge.style.color = "var(--neon-yellow)";
    phaseMsg.textContent = "終焉の予兆が出現！正しい塔（ボタン）を踏め";
    
    // ボスの上にランダムでテキスト表示 ("過去の終焉" または "未来 of 終焉")
    const isFuture = Math.random() < 0.5;
    lastApocalypseText = isFuture ? "未来の終焉" : "過去の終焉";
    
    apocEl.textContent = lastApocalypseText;
    apocEl.classList.add(isFuture ? "future" : "past");
    
    renderActionButtons();
  } 
  else if (type === "past_future") {
    phaseTypeBadge.style.borderColor = "var(--neon-purple)";
    phaseTypeBadge.style.color = "var(--neon-purple)";
    phaseMsg.textContent = "直前の予兆に基づき、ボスの上または下へ誘導せよ";
    
    // 答えとなるテロップは出さない
    apocEl.textContent = "";
    apocEl.className = "apocalypse-text";
    
    renderPastFutureButtons();
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
    const pos = rows[name];
    // 全フェーズで画面左上に並べて配置 (X=60〜240, Y=45〜95)
    const x = 60 + pos.col * 60;
    const y = 45 + (pos.row - 1) * 50;
    
    characters[name].x = x;
    characters[name].y = y;
    
    const pawn = document.createElement("div");
    pawn.id = `char-pawn-${name}`;
    pawn.className = "char-pawn";
    if (name === playerChar) pawn.classList.add("player");
    
    pawn.style.left = `${x}px`;
    pawn.style.top = `${y}px`;
    pawn.textContent = name;
    
    // マーカーに応じたクラス追加
    const m = characters[name].marker;
    if (m === MARKER_SHARE) pawn.classList.add("marker-share");
    else if (m === MARKER_FAN) pawn.classList.add("marker-fan");
    else if (m === MARKER_CIRCLE) pawn.classList.add("marker-circle");
    
    container.appendChild(pawn);
  });
}

// 設定ファイル（config.json）に基づく回答ボタンの描画
function renderActionButtons() {
  const container = document.getElementById("action-buttons-container");
  container.innerHTML = "";
  
  const phData = config.phases[String(currentPhase)];
  if (!phData || !phData.buttons || phData.buttons.length === 0) {
    // ボタンが設定されていない場合のフォールバック（デモ用）
    return;
  }
  
  phData.buttons.forEach(btn => {
    const el = document.createElement("button");
    el.className = "action-btn";
    el.style.left = `${btn.x}px`;
    el.style.top = `${btn.y}px`;
    el.style.width = `${btn.w}px`;
    el.style.height = `${btn.h}px`;
    el.textContent = btn.label;
    
    el.addEventListener("click", () => {
      if (isAnimating) return;
      handleAnswerSelection(btn.x, btn.y, btn.condition);
    });
    
    container.appendChild(el);
  });
}

// 過去/未来誘導フェーズ用のボタン描画（自動計算）
function renderPastFutureButtons() {
  const container = document.getElementById("action-buttons-container");
  container.innerHTML = "";
  
  const b = config.boss;
  const cl = config.circle_left;
  const cr = config.circle_right;
  
  // 1. ボスの上
  const topX = b.x;
  const topY = b.y - 85;
  
  // 2. ボスの下（2つの円の間）
  const bottomX = Math.round((cl.x + cr.x) / 2);
  const bottomY = Math.round((cl.y + cr.y) / 2);
  
  // 上ボタン
  const topBtn = document.createElement("button");
  topBtn.className = "action-btn past-future-btn";
  topBtn.style.left = `${topX}px`;
  topBtn.style.top = `${topY}px`;
  topBtn.textContent = "未来の終焉を誘導";
  topBtn.addEventListener("click", () => {
    if (isAnimating) return;
    // 未来が正解の場合
    const isCorrect = (lastApocalypseText === "未来の終焉");
    handleAnswerSelection(topX, topY, isCorrect ? "true" : "false");
  });
  
  // 下ボタン
  const bottomBtn = document.createElement("button");
  bottomBtn.className = "action-btn past-future-btn";
  bottomBtn.style.left = `${bottomX}px`;
  bottomBtn.style.top = `${bottomY}px`;
  bottomBtn.textContent = "過去の終焉を誘導";
  bottomBtn.addEventListener("click", () => {
    if (isAnimating) return;
    // 過去が正解の場合
    const isCorrect = (lastApocalypseText === "過去の終焉");
    handleAnswerSelection(bottomX, bottomY, isCorrect ? "true" : "false");
  });
  
  container.appendChild(topBtn);
  container.appendChild(bottomBtn);
}

// プレイヤーが立ち位置を選択したときの処理
function handleAnswerSelection(targetX, targetY, conditionStr) {
  isAnimating = true;
  
  // ボタン入力を一時無効化
  document.querySelectorAll(".action-btn").forEach(btn => {
    btn.style.pointerEvents = "none";
  });
  
  // プレイヤーのキャラを移動
  const pawn = document.getElementById(`char-pawn-${playerChar}`);
  pawn.style.left = `${targetX}px`;
  pawn.style.top = `${targetY}px`;
  
  // 判定処理（移動アニメーション完了後）
  setTimeout(() => {
    const playerInfo = characters[playerChar];
    const isCorrect = evaluateCondition(conditionStr, playerChar, playerInfo.group, playerInfo.marker);
    
    if (isCorrect) {
      handleSuccess();
    } else {
      handleFailure();
    }
  }, 650);
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

  showPhaseClearOverlay(recordList);
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
function handleFailure() {
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

// スタート画面（初期状態）へリセット
function resetToStart() {
  document.getElementById("game-over-overlay").classList.remove("active");
  document.getElementById("game-clear-overlay").classList.remove("active");
  document.getElementById("game-screen").classList.remove("active");
  document.getElementById("start-screen").classList.add("active");
  
  playerChar = null;
  setupCharacterSelection();
}
