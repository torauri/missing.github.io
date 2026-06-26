let config = null;
let currentPhase = 1;
let lastApocalypseText = "過去の終焉"; // "過去の終焉" または "未来の終焉"
let phase12Step = 1; // 1 = A集合, 2 = 避ける
let characters = {};
let currentTargetAreas = [];
let adjustByPrevTowerMode = false;

// ドラッグ状態管理
let draggingChar = null;
let dragStartPointer = { x: 0, y: 0 };
let dragStartCharPos = { x: 0, y: 0 };
let hasMoved = false; // ドラッグ中に移動したかどうかのフラグ（クリック判定用）

// ポップアップメニュー操作対象キャラ
let activeMenuChar = null;

const CHAR_NAMES = ["MT", "ST", "H1", "H2", "D1", "D2", "D3", "D4"];

const PAIRS = [
  ["MT", "H1"],
  ["ST", "H2"],
  ["D1", "D3"],
  ["D2", "D4"]
];

const MARKER_SHARE = "頭割り";
const MARKER_FAN = "扇";
const MARKER_CIRCLE = "円";
const MARKER_NONE = "なし";

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

// 1. ロード処理
window.addEventListener("DOMContentLoaded", () => {
  fetch("../config.json")
    .then(res => res.json())
    .then(data => {
      config = data;
      initExplainMode();
    })
    .catch(err => {
      console.error("設定ファイルのロードに失敗しました:", err);
      // フォールバック用のデフォルト設定
      config = {
        boss: { x: 500, y: 250, radius: 150 },
        circle_left: { x: 370, y: 410, radius: 100 },
        circle_right: { x: 630, y: 410, radius: 100 },
        phases: {}
      };
      initExplainMode();
    });

  window.addEventListener("resize", resizeGameField);
});

// 説明モード初期化
function initExplainMode() {
  setupEventListeners();
  initCharacters();
  loadPhase(1);
  resizeGameField();
}

// キャラクター初期化
function initCharacters() {
  characters = {};
  CHAR_NAMES.forEach(name => {
    characters[name] = {
      marker: MARKER_NONE,
      group: "",
      x: 0,
      y: 0,
      lastCorrectX: null,
      lastCorrectY: null
    };
  });

  // 通常ゲームと同様の初期マーカーとグループを割り当てる (説明時のベースにするため)
  // 1. [MT, ST, H1, H2] から1人に頭割り
  const tanksHealers = ["MT", "ST", "H1", "H2"];
  const shareTH = tanksHealers[Math.floor(Math.random() * 4)];
  characters[shareTH].marker = MARKER_SHARE;

  // 2. [D1, D2, D3, D4] から1人に頭割り
  const dps = ["D1", "D2", "D3", "D4"];
  const shareDPS = dps[Math.floor(Math.random() * 4)];
  characters[shareDPS].marker = MARKER_SHARE;

  // 3. 残りTH/DPSに扇と円を3名ずつ割り当て
  const remainingTH = tanksHealers.filter(name => name !== shareTH);
  const remainingDPS = dps.filter(name => name !== shareDPS);

  const isFanTH = Math.random() < 0.5;
  const fanTargets = isFanTH ? remainingTH : remainingDPS;
  const circleTargets = isFanTH ? remainingDPS : remainingTH;

  fanTargets.forEach(name => { characters[name].marker = MARKER_FAN; });
  circleTargets.forEach(name => { characters[name].marker = MARKER_CIRCLE; });

  // 4. ペア基準でグループ分け
  let group1Pairs = [];
  PAIRS.forEach(pair => {
    if (pair.includes(shareTH) || pair.includes(shareDPS)) {
      group1Pairs.push(pair);
    }
  });

  CHAR_NAMES.forEach(name => {
    const isGroup1 = group1Pairs.some(pair => pair.includes(name));
    characters[name].group = isGroup1 ? "グループ1" : "グループ2";
  });

  // キャラクターを初期配置 (PH1の整列位置)
  resetCharacterPositions();
}

// キャラクターの位置を初期整列位置に戻す
function resetCharacterPositions() {
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
    characters[name].x = 400 + pos.col * 70;
    characters[name].y = 475 + (pos.row - 1) * 50;
  });
}

// イベントリスナー設定
function setupEventListeners() {
  // リサイズ
  window.addEventListener("resize", resizeGameField);

  // フェーズ切り替え
  document.getElementById("prev-phase-btn").addEventListener("click", () => {
    if (currentPhase > 1) loadPhase(currentPhase - 1);
  });
  document.getElementById("next-phase-btn").addEventListener("click", () => {
    if (currentPhase < 12) loadPhase(currentPhase + 1);
  });
  document.getElementById("phase-select").addEventListener("change", (e) => {
    loadPhase(parseInt(e.target.value));
  });

  // 予兆トグル
  document.getElementById("apoc-toggle-btn").addEventListener("click", () => {
    if (lastApocalypseText === "過去の終焉") {
      lastApocalypseText = "未来の終焉";
    } else {
      lastApocalypseText = "過去の終焉";
    }
    updateApocalypseToggleUI();
    loadPhase(currentPhase, false); // キャラ位置は維持してエリアのみ再描画
  });

  // フェーズ12ステップトグル
  document.getElementById("p12-step-btn").addEventListener("click", () => {
    phase12Step = phase12Step === 1 ? 2 : 1;
    updateP12StepUI();
    loadPhase(currentPhase, false); // キャラ位置は維持してエリアのみ再描画
  });

  // コントロールボタン
  document.getElementById("auto-pos-btn").addEventListener("click", autoPositionCharacters);
  document.getElementById("reset-btn").addEventListener("click", () => {
    if (confirm("キャラクターの位置とマーカーを初期化しますか？")) {
      initCharacters();
      loadPhase(currentPhase);
    }
  });

  // 前回同塔被り調整トグル
  document.getElementById("adjust-by-prev-tower-chk").addEventListener("change", (e) => {
    adjustByPrevTowerMode = e.target.checked;
    loadPhase(currentPhase, false); // 位置は維持して再判定
  });

  // ポップアップメニューのクローズ
  document.getElementById("popup-close-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    closePopupMenu();
  });

  // ポップアップ自身をクリックした時のイベント伝播防止
  const popupMenuEl = document.getElementById("marker-popup-menu");
  popupMenuEl.addEventListener("click", (e) => e.stopPropagation());
  popupMenuEl.addEventListener("touchstart", (e) => e.stopPropagation());

  // マーカーオプションボタン
  document.querySelectorAll(".marker-opt-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!activeMenuChar) return;
      const marker = btn.dataset.marker;
      characters[activeMenuChar].marker = marker;
      
      // アクティブ表示の切り替え
      document.querySelectorAll(".marker-opt-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      updateCharacterDOM(activeMenuChar);
      updateTargetAreaOccupancy();
    });
  });

  // グループオプションボタン
  document.querySelectorAll(".group-opt-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!activeMenuChar) return;
      const group = btn.dataset.group;
      characters[activeMenuChar].group = group;

      document.querySelectorAll(".group-opt-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      updateCharacterDOM(activeMenuChar);
      updateTargetAreaOccupancy();
    });
  });

  // ドラッグの解除などを広域で検知
  window.addEventListener("mousemove", handleDragMove);
  window.addEventListener("touchmove", handleDragMove, { passive: false });
  window.addEventListener("mouseup", handleDragEnd);
  window.addEventListener("touchend", handleDragEnd);

  // ポップアップ外クリックで閉じる
  document.addEventListener("click", (e) => {
    const popup = document.getElementById("marker-popup-menu");
    const isClickInside = popup.contains(e.target) || e.target.classList.contains("char-pawn") || e.target.closest(".char-pawn");
    if (!isClickInside && !popup.classList.contains("hidden")) {
      closePopupMenu();
    }
  });
  document.addEventListener("touchstart", (e) => {
    const popup = document.getElementById("marker-popup-menu");
    const isClickInside = popup.contains(e.target) || e.target.classList.contains("char-pawn") || e.target.closest(".char-pawn");
    if (!isClickInside && !popup.classList.contains("hidden")) {
      closePopupMenu();
    }
  });
}

// アスペクト比維持スケーリング
function resizeGameField() {
  const app = document.getElementById("app-container");
  const field = document.getElementById("game-field");
  const container = document.getElementById("game-container");
  const header = document.getElementById("explain-header");
  const help = document.getElementById("help-hud");
  if (!field || !container || !app) return;

  const baseWidth = 1024;
  const baseHeight = 576;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let headerHeight = 0;
  if (header && header.offsetHeight > 0) {
    headerHeight = header.offsetHeight + 10;
  }
  let helpHeight = 0;
  if (help && help.offsetHeight > 0) {
    helpHeight = help.offsetHeight + 10;
  }

  const availableWidth = viewportWidth - 20;
  const availableHeight = viewportHeight - headerHeight - helpHeight - 20;

  const scaleX = availableWidth / baseWidth;
  const scaleY = availableHeight / baseHeight;
  const scale = Math.max(0.1, Math.min(scaleX, scaleY, 1.3));

  field.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

// フェーズ読み込み
function loadPhase(phaseNum, resetPositions = true) {
  // フェーズが切り替わる前に、現在のフェーズ（currentPhase）の正解位置を各キャラに記録する
  if (currentPhase !== phaseNum) {
    const prevType = getPhaseType(currentPhase);
    if (prevType !== "past_future") {
      const phData = config.phases[String(currentPhase)] || {};
      const priority = phData.priority || "";
      
      // 1. 全員の正解位置を一斉に計算（途中で lastCorrectX が書き換わるのを防ぐ）
      const correctAreas = {};
      CHAR_NAMES.forEach(name => {
        let correctArea = null;
        for (let area of currentTargetAreas) {
          if (evaluateButtonCorrectness(name, area, priority)) {
            correctArea = area;
            break;
          }
        }
        correctAreas[name] = correctArea;
      });

      // 2. 計算し終わった正解位置を一斉に記録
      CHAR_NAMES.forEach(name => {
        const correctArea = correctAreas[name];
        if (correctArea) {
          characters[name].lastCorrectX = correctArea.x;
          characters[name].lastCorrectY = correctArea.y;
        }
      });
    }
  }

  currentPhase = phaseNum;

  // 1, 5, 11 回目塔踏みフェーズロード時に前回の塔位置情報をクリア
  if ([1, 5, 11].includes(phaseNum)) {
    CHAR_NAMES.forEach(name => {
      characters[name].lastCorrectX = null;
      characters[name].lastCorrectY = null;
    });
  }

  // フェーズ11の場合、自動的に補助マーカー番号を割り当てる
  if (phaseNum === 11) {
    const hasNumbers = CHAR_NAMES.some(name => characters[name].helperNumber !== null);
    if (!hasNumbers) {
      assignHelperNumbers();
    }
  }

  // UI更新
  document.getElementById("current-phase-num").textContent = String(phaseNum).padStart(2, "0");
  document.getElementById("phase-select").value = String(phaseNum);

  // トグル類の表示制御
  const type = getPhaseType(phaseNum);
  const apocToggle = document.getElementById("apoc-toggle-container");
  const stepToggle = document.getElementById("p12-step-container");

  if (type === "even") {
    apocToggle.classList.remove("hidden");
    updateApocalypseToggleUI();
  } else {
    apocToggle.classList.add("hidden");
  }

  if (phaseNum === 12) {
    stepToggle.classList.remove("hidden");
    updateP12StepUI();
  } else {
    stepToggle.classList.add("hidden");
  }

  // ボスの終焉表示
  const apocEl = document.getElementById("apocalypse-text");
  apocEl.className = "apocalypse-text";
  if (type === "even") {
    apocEl.textContent = lastApocalypseText;
    apocEl.classList.add(lastApocalypseText === "未来の終焉" ? "future" : "past");
  } else {
    apocEl.textContent = "";
  }

  // 2. オブジェクト描画
  renderBaseObjects();

  // 3. ターゲットエリアの描画
  if (type === "past_future") {
    renderPastFutureTargetAreas();
  } else {
    renderTargetAreas();
  }

  // 4. キャラクターの描画
  if (resetPositions) {
    // 1回目塔踏みは整列位置、それ以外は前フェーズの正解位置、などとする代わりに
    // フェーズ1は初期位置、その他は現在の位置を維持（または自動配置をユーザーに選ばせる）
    if (phaseNum === 1) {
      resetCharacterPositions();
    }
  }

  renderCharacters();
  updateTargetAreaOccupancy();
}

// フェーズタイプの取得
function getPhaseType(phaseNum) {
  if ([1, 4, 7, 10].includes(phaseNum)) return "odd";
  if ([2, 5, 8, 11].includes(phaseNum)) return "even";
  return "past_future";
}

// 予兆トグルUI更新
function updateApocalypseToggleUI() {
  const btn = document.getElementById("apoc-toggle-btn");
  btn.textContent = lastApocalypseText;
  btn.className = `toggle-btn ${lastApocalypseText === "未来 of 終焉" || lastApocalypseText === "未来の終焉" ? "future" : "past"}`;
}

// フェーズ12ステップUI更新
function updateP12StepUI() {
  const btn = document.getElementById("p12-step-btn");
  if (phase12Step === 1) {
    btn.textContent = "A集合 (Step1)";
    btn.classList.add("active");
  } else {
    btn.textContent = "誘導 (Step2)";
    btn.classList.remove("active");
  }
}

// 基本オブジェクト描画
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

// ターゲットエリアの描画 (奇数・偶数フェーズ)
function renderTargetAreas() {
  const container = document.getElementById("target-areas-container");
  container.innerHTML = "";
  currentTargetAreas = [];

  const phData = config.phases[String(currentPhase)];
  if (!phData || !phData.buttons || phData.buttons.length === 0) return;

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

// ターゲットエリアの描画 (過去/未来誘導フェーズ)
function renderPastFutureTargetAreas() {
  const container = document.getElementById("target-areas-container");
  container.innerHTML = "";
  currentTargetAreas = [];

  const b = config.boss;
  const cl = config.circle_left;
  const cr = config.circle_right;

  const topX = b.x;
  const topY = b.y - 85;

  const bottomX = Math.round((cl.x + cr.x) / 2);
  const bottomY = Math.round((cl.y + cr.y) / 2);

  if (currentPhase === 12 && phase12Step === 1) {
    // A集合
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

  // 過去/未来誘導またはフェーズ12ステップ2
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

// キャラクター全体のレンダリング
function renderCharacters() {
  const container = document.getElementById("characters-container");
  container.innerHTML = "";

  CHAR_NAMES.forEach(name => {
    const char = characters[name];
    const pawn = document.createElement("div");
    pawn.id = `char-pawn-${name}`;
    pawn.className = "char-pawn no-transition";
    pawn.style.left = `${char.x}px`;
    pawn.style.top = `${char.y}px`;
    pawn.textContent = name;

    // マーカー反映
    const m = char.marker;
    if (m === MARKER_SHARE) pawn.classList.add("marker-share");
    else if (m === MARKER_FAN) pawn.classList.add("marker-fan");
    else if (m === MARKER_CIRCLE) pawn.classList.add("marker-circle");

    // 補助マーカー用要素の生成・描画
    let helperMarker = pawn.querySelector(".helper-marker");
    if (!helperMarker) {
      helperMarker = document.createElement("div");
      helperMarker.className = "helper-marker";
      pawn.appendChild(helperMarker);
    }
    if (char.helperType && char.helperNumber) {
      const emoji = char.helperType === "chain" ? "🔗" : "🚫";
      helperMarker.textContent = emoji + char.helperNumber;
      helperMarker.style.display = "block";
    } else {
      helperMarker.style.display = "none";
    }

    // グループバッジ
    const badge = document.createElement("div");
    badge.className = `char-info-badge ${char.group === "グループ1" ? "g1" : "g2"}`;
    const mIcon = MARKER_ICONS[m] !== "ー" ? MARKER_ICONS[m] : "";
    const gText = char.group === "グループ1" ? "G1" : "G2";
    badge.textContent = `${gText} ${mIcon}`;
    pawn.appendChild(badge);

    // イベント
    pawn.addEventListener("mousedown", (e) => startDrag(e, name));
    pawn.addEventListener("touchstart", (e) => startDrag(e, name), { passive: false });
    pawn.addEventListener("click", (e) => e.stopPropagation());
    pawn.addEventListener("touchend", (e) => e.stopPropagation());

    container.appendChild(pawn);
  });
}

// 個別のキャラクターDOMのみ更新 (移動・マーク変更時)
function updateCharacterDOM(name) {
  const pawn = document.getElementById(`char-pawn-${name}`);
  if (!pawn) return;

  const char = characters[name];
  pawn.className = "char-pawn no-transition";
  pawn.style.left = `${char.x}px`;
  pawn.style.top = `${char.y}px`;
  pawn.innerHTML = name; // クリア

  const m = char.marker;
  if (m === MARKER_SHARE) pawn.classList.add("marker-share");
  else if (m === MARKER_FAN) pawn.classList.add("marker-fan");
  else if (m === MARKER_CIRCLE) pawn.classList.add("marker-circle");

  // 補助マーカー用要素の生成・描画
  let helperMarker = pawn.querySelector(".helper-marker");
  if (!helperMarker) {
    helperMarker = document.createElement("div");
    helperMarker.className = "helper-marker";
    pawn.appendChild(helperMarker);
  }
  if (char.helperType && char.helperNumber) {
    const emoji = char.helperType === "chain" ? "🔗" : "🚫";
    helperMarker.textContent = emoji + char.helperNumber;
    helperMarker.style.display = "block";
  } else {
    helperMarker.style.display = "none";
  }

  const badge = document.createElement("div");
  badge.className = `char-info-badge ${char.group === "グループ1" ? "g1" : "g2"}`;
  const mIcon = MARKER_ICONS[m] !== "ー" ? MARKER_ICONS[m] : "";
  const gText = char.group === "グループ1" ? "G1" : "G2";
  badge.textContent = `${gText} ${mIcon}`;
  pawn.appendChild(badge);
}

// ターゲットエリアの「占有」「正解」状態を評価してクラスを付与
function updateTargetAreaOccupancy() {
  const phData = config.phases[String(currentPhase)] || {};
  const priority = phData.priority || "";

  // まず初期化
  currentTargetAreas.forEach(area => {
    area.el.classList.remove("occupied", "correct");
  });

  // 各エリアに立っているキャラを調べる
  currentTargetAreas.forEach(area => {
    const occupants = [];
    CHAR_NAMES.forEach(name => {
      const char = characters[name];
      const withinX = char.x >= (area.x - area.w / 2) && char.x <= (area.x + area.w / 2);
      const withinY = char.y >= (area.y - area.h / 2) && char.y <= (area.y + area.h / 2);
      if (withinX && withinY) {
        occupants.push(name);
      }
    });

    if (occupants.length > 0) {
      area.el.classList.add("occupied");

      // その中に正解のキャラクターが含まれているか判定
      const hasCorrectOccupant = occupants.some(name => {
        return evaluateButtonCorrectness(name, area, priority);
      });

      if (hasCorrectOccupant) {
        area.el.classList.add("correct");
      }
    }
  });
}

// 優先度を含めたボタンの正答判定 (game.jsより移植)
function evaluateButtonCorrectness(playerChar, area, priority) {
  const conditionStr = area.condition;
  const priorityType = area.priority_type || "";

  if (!priorityType || priorityType === "") {
    const playerInfo = characters[playerChar];
    return evaluateCondition(conditionStr, playerChar, playerInfo.group, playerInfo.marker);
  }

  const matchingChars = [];
  for (let charName of CHAR_NAMES) {
    const charInfo = characters[charName];
    if (evaluateCondition(conditionStr, charName, charInfo.group, charInfo.marker)) {
      matchingChars.push(charName);
    }
  }

  if (!matchingChars.includes(playerChar)) {
    return false;
  }

  // --- 特殊モード：「前回同塔被り調整モード」 ---
  if (adjustByPrevTowerMode && currentPhase < 11 && matchingChars.length === 2) {
    const charA = matchingChars[0];
    const charB = matchingChars[1];

    const hasPrevA = characters[charA].lastCorrectX !== null && characters[charA].lastCorrectY !== null;
    const hasPrevB = characters[charB].lastCorrectX !== null && characters[charB].lastCorrectY !== null;

    if (hasPrevA && hasPrevB) {
      const bossX = config.boss.x;
      const isLeftA = characters[charA].lastCorrectX < bossX;
      const isLeftB = characters[charB].lastCorrectX < bossX;

      let correctSideLeft = null;

      if (isLeftA === isLeftB) {
        // 前回踏んだ塔が同じ（両方とも左、または両方とも右）：南側が逆側に調整する
        const originalSideLeft = isLeftA; // 被った前回の側が左か

        // 前回のY座標が大きい方を南（下）、小さい方を北（上）とする
        const yA = characters[charA].lastCorrectY;
        const yB = characters[charB].lastCorrectY;

        let northChar, southChar;
        if (yA < yB) {
          northChar = charA;
          southChar = charB;
        } else {
          northChar = charB;
          southChar = charA;
        }

        if (playerChar === northChar) {
          correctSideLeft = originalSideLeft;
        } else if (playerChar === southChar) {
          correctSideLeft = !originalSideLeft;
        }
      } else {
        // 前回踏んだ塔が異なる（被りなし）：それぞれ前回と同じ側に行く
        if (playerChar === charA) {
          correctSideLeft = isLeftA;
        } else if (playerChar === charB) {
          correctSideLeft = isLeftB;
        }
      }

      if (correctSideLeft !== null) {
        const isAreaLeft = area.x < bossX;
        return isAreaLeft === correctSideLeft;
      }
    }
  }
  // ------------------------------------------

  // --- 特殊モード：「最終塔踏み補助マーカー番号優先モード」 ---
  if (currentPhase === 11 && matchingChars.every(c => characters[c].helperNumber !== null && characters[c].helperNumber !== undefined)) {
    matchingChars.sort((a, b) => {
      return characters[a].helperNumber - characters[b].helperNumber;
    });
  } else {
    const priorityList = priority ? priority.split(">").map(s => s.trim()) : [];

    matchingChars.sort((a, b) => {
      let idxA = priorityList.indexOf(a);
      let idxB = priorityList.indexOf(b);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }

  let targetChar = "";
  if (priorityType === "larger") {
    targetChar = matchingChars[0];
  } else if (priorityType === "smaller") {
    targetChar = matchingChars[matchingChars.length - 1];
  }

  return playerChar === targetChar;
}

// 条件式評価関数 (game.jsより移植)
function evaluateCondition(conditionStr, charName, group, marker) {
  if (conditionStr === "true") return true;
  if (conditionStr === "false") return false;
  if (!conditionStr || conditionStr.trim() === "") return true;

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

// ドラッグ開始
function startDrag(e, charName) {
  e.preventDefault(); // スクロール防止
  e.stopPropagation(); // documentのクリックイベント伝播防止
  draggingChar = charName;
  hasMoved = false;

  const pointer = e.touches ? e.touches[0] : e;
  dragStartPointer = { x: pointer.clientX, y: pointer.clientY };
  dragStartCharPos = { x: characters[charName].x, y: characters[charName].y };

  const pawn = document.getElementById(`char-pawn-${charName}`);
  if (pawn) {
    pawn.classList.add("dragging");
    pawn.classList.remove("no-transition");
  }

  // ドラッグ/クリック時に対象キャラのポップアップを即座に表示・更新
  showPopupMenu(charName);
}

// ドラッグ中
function handleDragMove(e) {
  if (!draggingChar) return;

  const pointer = e.touches ? e.touches[0] : e;
  const dx = pointer.clientX - dragStartPointer.x;
  const dy = pointer.clientY - dragStartPointer.y;

  if (Math.sqrt(dx * dx + dy * dy) > 3) {
    hasMoved = true;
  }

  const field = document.getElementById("game-field");
  const rect = field.getBoundingClientRect();
  const scale = rect.width / 1024; // フィールドの縮尺比率

  // 論理座標での移動量を加算
  let newX = dragStartCharPos.x + (dx / scale);
  let newY = dragStartCharPos.y + (dy / scale);

  // フィールドの境界にクランプ (直径38px -> 半径19px)
  newX = Math.max(19, Math.min(1024 - 19, newX));
  newY = Math.max(19, Math.min(576 - 19, newY));

  characters[draggingChar].x = newX;
  characters[draggingChar].y = newY;

  const pawn = document.getElementById(`char-pawn-${draggingChar}`);
  if (pawn) {
    pawn.style.left = `${newX}px`;
    pawn.style.top = `${newY}px`;
  }

  updateTargetAreaOccupancy();
}

// ドラッグ終了
function handleDragEnd(e) {
  if (!draggingChar) return;

  const pawn = document.getElementById(`char-pawn-${draggingChar}`);
  if (pawn) {
    pawn.classList.remove("dragging");
    pawn.classList.add("no-transition");
  }

  draggingChar = null;
}

// ポップアップメニューを表示
function showPopupMenu(charName) {
  activeMenuChar = charName;
  const char = characters[charName];
  
  const popup = document.getElementById("marker-popup-menu");
  document.getElementById("popup-char-name").textContent = charName;

  // マーカーオプションのアクティブ設定
  document.querySelectorAll(".marker-opt-btn").forEach(btn => {
    if (btn.dataset.marker === char.marker) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // グループオプションのアクティブ設定
  document.querySelectorAll(".group-opt-btn").forEach(btn => {
    if (btn.dataset.group === char.group) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // 位置はCSSで右上固定にするため、JS側での位置設定は行わない
  popup.classList.remove("hidden");
  
  // クラス付与でフェードインアニメーション
  setTimeout(() => {
    popup.classList.add("active");
  }, 10);
}

// ポップアップメニューを閉じる
function closePopupMenu() {
  const popup = document.getElementById("marker-popup-menu");
  popup.classList.remove("active");
  setTimeout(() => {
    popup.classList.add("hidden");
  }, 200);
  activeMenuChar = null;
}

// キャラクターを正しい位置へ自動配置
function autoPositionCharacters() {
  const phData = config.phases[String(currentPhase)] || {};
  const priority = phData.priority || "";

  // アニメーション効果を一時的に持たせるために transition なしクラスを解除する
  CHAR_NAMES.forEach(name => {
    const pawn = document.getElementById(`char-pawn-${name}`);
    if (pawn) {
      pawn.classList.remove("no-transition");
    }
  });

  // 各キャラクターの正解位置を求めて移動
  CHAR_NAMES.forEach(name => {
    let correctArea = null;

    for (let area of currentTargetAreas) {
      if (evaluateButtonCorrectness(name, area, priority)) {
        correctArea = area;
        break;
      }
    }

    if (correctArea) {
      characters[name].x = correctArea.x;
      characters[name].y = correctArea.y;

      const pawn = document.getElementById(`char-pawn-${name}`);
      if (pawn) {
        pawn.style.left = `${correctArea.x}px`;
        pawn.style.top = `${correctArea.y}px`;
      }
    }
  });

  // アニメーション終了後に再び no-transition に戻す (ドラッグ操作への干渉を防ぐ)
  setTimeout(() => {
    CHAR_NAMES.forEach(name => {
      const pawn = document.getElementById(`char-pawn-${name}`);
      if (pawn) {
        pawn.classList.add("no-transition");
      }
    });
    updateTargetAreaOccupancy();
  }, 650);
}

function assignHelperNumbers() {
  // 1. 全員の helper 情報を初期化
  CHAR_NAMES.forEach(name => {
    characters[name].helperNumber = null;
    characters[name].helperType = null;
  });

  // 2. 頭割りの2人を特定
  const shareChars = CHAR_NAMES.filter(name => characters[name].marker === MARKER_SHARE);
  let chainShareChar = null;
  let forbiddenShareChar = null;

  if (shareChars.length === 2) {
    // 頭割りの1人目を鎖 (🔗)、2人目を禁止 (🚫) とする
    chainShareChar = shareChars[0];
    forbiddenShareChar = shareChars[1];
  }

  // 3. 鎖グループ（4名）：扇の3名 ＋ 頭割りのうち鎖になった1名
  // このうち、PH11で塔を踏む「グループ1の扇2名」
  const fanG1 = CHAR_NAMES.filter(name => characters[name].marker === MARKER_FAN && characters[name].group === "グループ1");
  // 残り（グループ2の扇1名 ＋ 頭割り）
  const fanG2AndShare = CHAR_NAMES.filter(name => characters[name].marker === MARKER_FAN && characters[name].group === "グループ2");
  if (chainShareChar) fanG2AndShare.push(chainShareChar);

  // 4. 禁止グループ（4名）：円の3名 ＋ 頭割りのうち禁止になった1名
  // このうち、PH11で塔を踏む「グループ1の円2名」
  const circleG1 = CHAR_NAMES.filter(name => characters[name].marker === MARKER_CIRCLE && characters[name].group === "グループ1");
  // 残り（グループ2の円1名 ＋ 頭割り）
  const circleG2AndShare = CHAR_NAMES.filter(name => characters[name].marker === MARKER_CIRCLE && characters[name].group === "グループ2");
  if (forbiddenShareChar) circleG2AndShare.push(forbiddenShareChar);

  // シャッフル・割り当て関数
  const assignGroup = (g1Array, g2Array, type) => {
    // g1の2名に 1 と 2 をランダムに割り当てる
    if (Math.random() < 0.5) {
      characters[g1Array[0]].helperNumber = 1;
      characters[g1Array[1]].helperNumber = 2;
    } else {
      characters[g1Array[0]].helperNumber = 2;
      characters[g1Array[1]].helperNumber = 1;
    }
    characters[g1Array[0]].helperType = type;
    characters[g1Array[1]].helperType = type;

    // g2の2名に 1 と 2 をランダムに割り当てる
    if (Math.random() < 0.5) {
      characters[g2Array[0]].helperNumber = 1;
      characters[g2Array[1]].helperNumber = 2;
    } else {
      characters[g2Array[0]].helperNumber = 2;
      characters[g2Array[1]].helperNumber = 1;
    }
    characters[g2Array[0]].helperType = type;
    characters[g2Array[1]].helperType = type;
  };

  if (fanG1.length === 2 && fanG2AndShare.length === 2) {
    assignGroup(fanG1, fanG2AndShare, "chain");
  }
  if (circleG1.length === 2 && circleG2AndShare.length === 2) {
    assignGroup(circleG1, circleG2AndShare, "forbidden");
  }
}
