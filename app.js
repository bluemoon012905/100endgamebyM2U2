const SGF_DIR = "9x9 Endgame Book 1";

const MODES = {
  EXPLORATION: "exploration",
  RESPONSIVE: "responsive",
  ANSWER_KEY: "answer-key",
};

const MODE_LABELS = {
  [MODES.EXPLORATION]: "Exploration Mode",
  [MODES.RESPONSIVE]: "Responsive Puzzle",
  [MODES.ANSWER_KEY]: "Answer Key Puzzle",
};

const startScreenEl = document.getElementById("startScreen");
const viewerEl = document.getElementById("viewer");
const startSgfSelect = document.getElementById("startSgfSelect");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));

const boardCanvas = document.getElementById("board");
const ctx = boardCanvas.getContext("2d");
const sgfSelect = document.getElementById("sgfSelect");
const reloadBtn = document.getElementById("reloadBtn");
const prevPuzzleBtn = document.getElementById("prevPuzzleBtn");
const nextPuzzleBtn = document.getElementById("nextPuzzleBtn");
const changeModeBtn = document.getElementById("changeModeBtn");
const modePill = document.getElementById("modePill");
const firstBtn = document.getElementById("firstBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const lastBtn = document.getElementById("lastBtn");
const navRow = document.getElementById("navRow");
const puzzleActions = document.getElementById("puzzleActions");
const puzzleResetBtn = document.getElementById("puzzleResetBtn");
const puzzleSubmitBtn = document.getElementById("puzzleSubmitBtn");
const settingsToggleBtn = document.getElementById("settingsToggleBtn");
const settingsBody = document.getElementById("settingsBody");
const settingsRow = document.querySelector(".settings-row");
const confirmMoveToggle = document.getElementById("confirmMoveToggle");
const shuffleNextToggle = document.getElementById("shuffleNextToggle");
const shuffleOrientationToggle = document.getElementById("shuffleOrientationToggle");
const confirmPrompt = document.getElementById("confirmPrompt");
const confirmMoveBtn = document.getElementById("confirmMoveBtn");
const cancelMoveBtn = document.getElementById("cancelMoveBtn");
const hintTextEl = document.getElementById("hintText");
const feedbackOverlayEl = document.getElementById("feedbackOverlay");
const statusEl = document.getElementById("status");
const capturesEl = document.getElementById("captures");
const notesEl = document.getElementById("notes");
const variationBlockEl = document.getElementById("variationBlock");
const variationsEl = document.getElementById("variations");
const boardPanelEl = document.querySelector(".board-panel");

const state = {
  mode: null,
  root: null,
  virtualRoot: null,
  currentNode: null,
  selectedChildByNodeId: new Map(),
  nextNodeId: 1,
  boardSize: 9,
  puzzle: {
    answerPath: [],
    answerIndex: 0,
    playerColor: "B",
    answerMoves: [],
    answerComment: "",
    baseBoardState: null,
    userMoves: [],
  },
  ui: {
    hover: null,
    confirmMoves: false,
    pendingConfirm: null,
    boardRotation: 0,
  },
  navigation: {
    puzzleHistory: [],
    puzzleHistoryIndex: -1,
    shuffleNextPuzzle: false,
    shuffleOrientation: false,
  },
};

function initSelector(selectEl) {
  selectEl.innerHTML = "";
  for (let i = 1; i <= 100; i += 1) {
    const id = String(i).padStart(3, "0");
    const option = document.createElement("option");
    option.value = `${SGF_DIR}/${id}.sgf`;
    option.textContent = `${id}.sgf`;
    selectEl.appendChild(option);
  }
}

function coordToPoint(coord) {
  if (!coord || coord.length < 2) {
    return null;
  }
  const x = coord.charCodeAt(0) - 97;
  const y = coord.charCodeAt(1) - 97;
  if (x < 0 || y < 0) {
    return null;
  }
  return { x, y };
}

function pointToCoord(point) {
  return String.fromCharCode(97 + point.x) + String.fromCharCode(97 + point.y);
}

function parseProblemIndex(path) {
  const match = /\/(\d{3})\.sgf$/i.exec(path || "");
  if (!match) {
    return 1;
  }
  const idx = Number.parseInt(match[1], 10);
  if (!Number.isInteger(idx) || idx < 1 || idx > 100) {
    return 1;
  }
  return idx;
}

function sgfPathForIndex(idx) {
  const safe = Math.max(1, Math.min(100, idx));
  return `${SGF_DIR}/${String(safe).padStart(3, "0")}.sgf`;
}

function randomBoardRotation() {
  const all = [0, 90, 180, 270];
  return all[Math.floor(Math.random() * all.length)];
}

function displayPointFromLogical(point, size) {
  if (!point) {
    return null;
  }
  const rot = state.ui.boardRotation;
  if (rot === 90) {
    return { x: size - 1 - point.y, y: point.x };
  }
  if (rot === 180) {
    return { x: size - 1 - point.x, y: size - 1 - point.y };
  }
  if (rot === 270) {
    return { x: point.y, y: size - 1 - point.x };
  }
  return { x: point.x, y: point.y };
}

function logicalPointFromDisplay(point, size) {
  if (!point) {
    return null;
  }
  const rot = state.ui.boardRotation;
  if (rot === 90) {
    return { x: point.y, y: size - 1 - point.x };
  }
  if (rot === 180) {
    return { x: size - 1 - point.x, y: size - 1 - point.y };
  }
  if (rot === 270) {
    return { x: size - 1 - point.y, y: point.x };
  }
  return { x: point.x, y: point.y };
}

function chooseBoardRotationForCurrentPuzzle() {
  state.ui.boardRotation = state.navigation.shuffleOrientation ? randomBoardRotation() : 0;
}

function recordPuzzleVisit(path) {
  const history = state.navigation.puzzleHistory;
  const idx = state.navigation.puzzleHistoryIndex;
  if (idx >= 0 && history[idx] === path) {
    return;
  }
  if (idx < history.length - 1) {
    history.splice(idx + 1);
  }
  history.push(path);
  state.navigation.puzzleHistoryIndex = history.length - 1;
}

function parseSgf(text) {
  let i = 0;

  function skipWs() {
    while (i < text.length && /\s/.test(text[i])) {
      i += 1;
    }
  }

  function parseValue() {
    if (text[i] !== "[") {
      return "";
    }
    i += 1;
    let out = "";
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        i += 1;
        if (i < text.length) {
          out += text[i];
          i += 1;
        }
      } else if (ch === "]") {
        i += 1;
        break;
      } else {
        out += ch;
        i += 1;
      }
    }
    return out;
  }

  function parseNode() {
    const props = {};
    while (i < text.length) {
      skipWs();
      if (text[i] === ";" || text[i] === "(" || text[i] === ")") {
        break;
      }
      let ident = "";
      while (i < text.length && /[A-Za-z]/.test(text[i])) {
        ident += text[i];
        i += 1;
      }
      if (!ident) {
        i += 1;
        continue;
      }
      skipWs();
      const values = [];
      while (i < text.length && text[i] === "[") {
        values.push(parseValue());
        skipWs();
      }
      props[ident] = (props[ident] || []).concat(values);
    }
    return props;
  }

  function parseGameTree() {
    if (text[i] !== "(") {
      throw new Error(`Expected '(' at ${i}`);
    }
    i += 1;
    skipWs();

    const sequence = [];
    while (i < text.length && text[i] === ";") {
      i += 1;
      sequence.push(parseNode());
      skipWs();
    }

    const children = [];
    while (i < text.length && text[i] === "(") {
      children.push(parseGameTree());
      skipWs();
    }

    if (text[i] !== ")") {
      throw new Error(`Expected ')' at ${i}`);
    }
    i += 1;

    return { sequence, children };
  }

  skipWs();
  const trees = [];
  while (i < text.length) {
    skipWs();
    if (i >= text.length) {
      break;
    }
    if (text[i] !== "(") {
      i += 1;
      continue;
    }
    trees.push(parseGameTree());
    skipWs();
  }

  if (!trees.length) {
    throw new Error("No game tree found");
  }
  return trees[0];
}

function buildNodeTree(gameTree) {
  const virtualRoot = {
    id: 0,
    props: {},
    parent: null,
    children: [],
  };

  function appendSequence(fromNode, tree) {
    let cursor = fromNode;
    for (const props of tree.sequence) {
      const node = {
        id: state.nextNodeId,
        props,
        parent: cursor,
        children: [],
      };
      state.nextNodeId += 1;
      cursor.children.push(node);
      cursor = node;
    }

    for (const childTree of tree.children) {
      appendSequence(cursor, childTree);
    }
  }

  appendSequence(virtualRoot, gameTree);
  return virtualRoot;
}

function newBoard(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function pointKey(p) {
  return `${p.x},${p.y}`;
}

function neighbors(p, size) {
  const out = [];
  if (p.x > 0) out.push({ x: p.x - 1, y: p.y });
  if (p.x < size - 1) out.push({ x: p.x + 1, y: p.y });
  if (p.y > 0) out.push({ x: p.x, y: p.y - 1 });
  if (p.y < size - 1) out.push({ x: p.x, y: p.y + 1 });
  return out;
}

function collectGroup(board, start) {
  const color = board[start.y][start.x];
  if (!color) {
    return { stones: [], libs: 0 };
  }

  const stack = [start];
  const seen = new Set([pointKey(start)]);
  const stones = [];
  const libs = new Set();

  while (stack.length) {
    const p = stack.pop();
    stones.push(p);

    for (const n of neighbors(p, board.length)) {
      const val = board[n.y][n.x];
      if (val === null) {
        libs.add(pointKey(n));
      } else if (val === color) {
        const key = pointKey(n);
        if (!seen.has(key)) {
          seen.add(key);
          stack.push(n);
        }
      }
    }
  }

  return { stones, libs: libs.size };
}

function removeStones(board, stones) {
  for (const p of stones) {
    board[p.y][p.x] = null;
  }
}

function applyMove(board, color, point, captures) {
  if (!point) {
    return;
  }
  const size = board.length;
  if (point.x < 0 || point.y < 0 || point.x >= size || point.y >= size) {
    return;
  }

  board[point.y][point.x] = color;
  const opponent = color === "B" ? "W" : "B";

  let removed = 0;
  for (const n of neighbors(point, size)) {
    if (board[n.y][n.x] !== opponent) {
      continue;
    }
    const group = collectGroup(board, n);
    if (group.libs === 0) {
      removed += group.stones.length;
      removeStones(board, group.stones);
    }
  }

  const ownGroup = collectGroup(board, point);
  if (ownGroup.libs === 0) {
    removeStones(board, ownGroup.stones);
  }

  if (removed > 0) {
    captures[color] += removed;
  }
}

function getPathTo(node) {
  const path = [];
  let cursor = node;
  while (cursor && cursor.parent) {
    path.push(cursor);
    cursor = cursor.parent;
  }
  path.reverse();
  return path;
}

function parseLabels(node) {
  const labels = [];
  for (const raw of node.props.LB || []) {
    const [coord, text] = raw.split(":");
    const p = coordToPoint(coord);
    if (p && text) {
      labels.push({ ...p, text });
    }
  }
  return labels;
}

function parseMarks(node) {
  const marks = [];
  const markProps = ["MA", "TR", "SQ", "CR"];
  for (const type of markProps) {
    for (const coord of node.props[type] || []) {
      const p = coordToPoint(coord);
      if (p) {
        marks.push({ ...p, type });
      }
    }
  }
  return marks;
}

function getNodeMove(node) {
  if (node.props.B && node.props.B.length) {
    const point = coordToPoint(node.props.B[0]);
    return { color: "B", point, coord: node.props.B[0] || "" };
  }
  if (node.props.W && node.props.W.length) {
    const point = coordToPoint(node.props.W[0]);
    return { color: "W", point, coord: node.props.W[0] || "" };
  }
  return null;
}

function boardStateForNode(node) {
  const path = getPathTo(node);
  let size = state.boardSize;

  for (const n of path) {
    if (n.props.SZ && n.props.SZ[0]) {
      const parsed = Number.parseInt(n.props.SZ[0], 10);
      if (Number.isInteger(parsed) && parsed > 1) {
        size = parsed;
      }
    }
  }

  const board = newBoard(size);
  const captures = { B: 0, W: 0 };
  let moveNumber = 0;
  let lastMove = null;

  for (const n of path) {
    for (const c of n.props.AB || []) {
      const p = coordToPoint(c);
      if (p && p.x < size && p.y < size) {
        board[p.y][p.x] = "B";
      }
    }
    for (const c of n.props.AW || []) {
      const p = coordToPoint(c);
      if (p && p.x < size && p.y < size) {
        board[p.y][p.x] = "W";
      }
    }
    for (const c of n.props.AE || []) {
      const p = coordToPoint(c);
      if (p && p.x < size && p.y < size) {
        board[p.y][p.x] = null;
      }
    }

    const move = getNodeMove(n);
    if (move) {
      moveNumber += 1;
      applyMove(board, move.color, move.point, captures);
      lastMove = move.point;
    }
  }

  return {
    board,
    captures,
    moveNumber,
    lastMove,
    size,
    labels: parseLabels(node),
    marks: parseMarks(node),
  };
}

function drawBoard(stateForNode) {
  const size = stateForNode.size;
  state.boardSize = size;

  const w = boardCanvas.width;
  const h = boardCanvas.height;
  const pad = Math.round(w * 0.08);
  const cell = (w - pad * 2) / (size - 1);

  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "#e3b66f");
  grad.addColorStop(1, "#cd974d");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#5a3f1f";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < size; i += 1) {
    const pos = pad + i * cell;
    ctx.beginPath();
    ctx.moveTo(pad, pos);
    ctx.lineTo(w - pad, pos);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(pos, pad);
    ctx.lineTo(pos, h - pad);
    ctx.stroke();
  }

  const starIndex = size === 9 ? [2, 4, 6] : size === 19 ? [3, 9, 15] : [];
  ctx.fillStyle = "#4a3113";
  for (const sy of starIndex) {
    for (const sx of starIndex) {
      const cx = pad + sx * cell;
      const cy = pad + sy * cell;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(2.5, cell * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const stoneR = cell * 0.42;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const val = stateForNode.board[y][x];
      if (!val) continue;
      const display = displayPointFromLogical({ x, y }, size);
      const cx = pad + display.x * cell;
      const cy = pad + display.y * cell;

      const stoneGrad = ctx.createRadialGradient(
        cx - stoneR * 0.35,
        cy - stoneR * 0.35,
        stoneR * 0.2,
        cx,
        cy,
        stoneR
      );

      if (val === "B") {
        stoneGrad.addColorStop(0, "#666");
        stoneGrad.addColorStop(1, "#111");
      } else {
        stoneGrad.addColorStop(0, "#fff");
        stoneGrad.addColorStop(1, "#d9d9d9");
      }

      ctx.beginPath();
      ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
      ctx.fillStyle = stoneGrad;
      ctx.fill();
      ctx.strokeStyle = val === "B" ? "#000" : "#8a8a8a";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  if (state.ui.hover && state.ui.hover.color) {
    const hp = state.ui.hover.point;
    if (
      hp &&
      hp.x >= 0 &&
      hp.y >= 0 &&
      hp.x < size &&
      hp.y < size &&
      stateForNode.board[hp.y][hp.x] === null
    ) {
      const display = displayPointFromLogical(hp, size);
      const cx = pad + display.x * cell;
      const cy = pad + display.y * cell;
      ctx.globalAlpha = 0.55;
      const hoverGrad = ctx.createRadialGradient(
        cx - stoneR * 0.35,
        cy - stoneR * 0.35,
        stoneR * 0.15,
        cx,
        cy,
        stoneR
      );
      if (state.ui.hover.color === "B") {
        hoverGrad.addColorStop(0, "#777");
        hoverGrad.addColorStop(1, "#1a1a1a");
      } else {
        hoverGrad.addColorStop(0, "#ffffff");
        hoverGrad.addColorStop(1, "#d8d8d8");
      }
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR, 0, Math.PI * 2);
      ctx.fillStyle = hoverGrad;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = state.ui.hover.color === "B" ? "#111" : "#888";
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (stateForNode.lastMove) {
    const display = displayPointFromLogical(stateForNode.lastMove, size);
    const cx = pad + display.x * cell;
    const cy = pad + display.y * cell;
    const color = stateForNode.board[stateForNode.lastMove.y][stateForNode.lastMove.x] === "B" ? "#fff" : "#111";
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, stoneR * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.font = `${Math.max(11, Math.round(cell * 0.34))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of stateForNode.labels || []) {
    if (l.x >= size || l.y >= size) continue;
    const display = displayPointFromLogical(l, size);
    const cx = pad + display.x * cell;
    const cy = pad + display.y * cell;
    const under = stateForNode.board[l.y][l.x];
    ctx.fillStyle = under === "B" ? "#fff" : "#111";
    ctx.fillText(l.text, cx, cy);
  }

  for (const m of stateForNode.marks || []) {
    if (m.x >= size || m.y >= size) continue;
    const display = displayPointFromLogical(m, size);
    const cx = pad + display.x * cell;
    const cy = pad + display.y * cell;
    const under = stateForNode.board[m.y][m.x];
    ctx.strokeStyle = under === "B" ? "#fff" : "#111";
    ctx.lineWidth = 2;

    if (m.type === "MA") {
      const d = stoneR * 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
    } else if (m.type === "TR") {
      const d = stoneR * 0.62;
      ctx.beginPath();
      ctx.moveTo(cx, cy - d);
      ctx.lineTo(cx + d * 0.9, cy + d * 0.65);
      ctx.lineTo(cx - d * 0.9, cy + d * 0.65);
      ctx.closePath();
      ctx.stroke();
    } else if (m.type === "SQ") {
      const d = stoneR * 0.58;
      ctx.beginPath();
      ctx.rect(cx - d, cy - d, d * 2, d * 2);
      ctx.stroke();
    } else if (m.type === "CR") {
      ctx.beginPath();
      ctx.arc(cx, cy, stoneR * 0.58, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  boardCanvas._renderMeta = { pad, cell, size };
}

function childPreviewText(child, idx) {
  const move = child.props.B?.[0] || child.props.W?.[0] || "pass";
  const color = child.props.B ? "B" : child.props.W ? "W" : "?";
  const comment = (child.props.C?.[0] || "").split("\n")[0].trim();
  const moveLabel = `${color}[${move}]`;
  if (comment) {
    return `${idx + 1}: ${moveLabel} - ${comment}`;
  }
  return `${idx + 1}: ${moveLabel}`;
}

function renderVariations() {
  variationsEl.innerHTML = "";
  const children = state.currentNode.children || [];

  if (children.length <= 1) {
    variationsEl.textContent = children.length === 1 ? "Single continuation" : "No continuation";
    return;
  }

  const active = state.selectedChildByNodeId.get(state.currentNode.id) || 0;
  children.forEach((child, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `variation-btn ${idx === active ? "active" : ""}`;
    btn.textContent = childPreviewText(child, idx);
    btn.addEventListener("click", () => {
      state.selectedChildByNodeId.set(state.currentNode.id, idx);
      render();
    });
    variationsEl.appendChild(btn);
  });
}

function commentForNode(node) {
  const comments = node?.props?.C || [];
  return comments.join("\n").trim();
}

function renderStatusNode(boardState) {
  const hasMove = state.currentNode.props.B || state.currentNode.props.W;
  const moveColor = state.currentNode.props.B ? "Black" : state.currentNode.props.W ? "White" : null;
  const moveCoord = state.currentNode.props.B?.[0] || state.currentNode.props.W?.[0] || "";

  const prefix = hasMove ? `${moveColor} played ${moveCoord || "pass"}` : "Setup / root node";
  statusEl.textContent = `${prefix} | Move ${boardState.moveNumber} | Board ${boardState.size}x${boardState.size}`;
  capturesEl.textContent = `Captures -> Black: ${boardState.captures.B} | White: ${boardState.captures.W}`;
}

function renderExploration() {
  const bState = boardStateForNode(state.currentNode);
  drawBoard(bState);
  renderStatusNode(bState);
  renderVariations();
  notesEl.textContent = commentForNode(state.currentNode) || "(No note on this node)";
}

function buildMainlinePath(startNode) {
  const out = [];
  let cursor = startNode;
  while (cursor) {
    out.push(cursor);
    if (!cursor.children.length) {
      break;
    }
    cursor = cursor.children[0];
  }
  return out;
}

function extractAnswerMoves(path) {
  const out = [];
  for (let i = 1; i < path.length; i += 1) {
    const move = getNodeMove(path[i]);
    if (move && move.point) {
      out.push({
        color: move.color,
        point: move.point,
        coord: move.coord,
      });
    }
  }
  return out;
}

function findAnswerComment(path) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const c = commentForNode(path[i]);
    if (c) {
      return c;
    }
  }
  return "(No answer comment in this SGF)";
}

function showFeedback(message, isWrong = false) {
  feedbackOverlayEl.textContent = isWrong ? `✗ ${message}` : message;
  feedbackOverlayEl.classList.remove("hidden");
  setTimeout(() => {
    feedbackOverlayEl.classList.add("hidden");
  }, 1200);
}

function setupResponsivePuzzle() {
  const path = buildMainlinePath(state.root);
  state.puzzle.answerPath = path;
  state.puzzle.answerIndex = 0;

  const firstMove = extractAnswerMoves(path)[0];
  state.puzzle.playerColor = firstMove ? firstMove.color : "B";
  state.currentNode = path[0];

  advanceResponsiveToPlayerTurn();
  renderResponsivePuzzle();
}

function advanceResponsiveToPlayerTurn() {
  const path = state.puzzle.answerPath;
  while (state.puzzle.answerIndex < path.length - 1) {
    const next = path[state.puzzle.answerIndex + 1];
    const move = getNodeMove(next);

    if (!move || !move.point) {
      state.puzzle.answerIndex += 1;
      continue;
    }

    if (move.color !== state.puzzle.playerColor) {
      state.puzzle.answerIndex += 1;
      continue;
    }

    break;
  }

  state.currentNode = path[state.puzzle.answerIndex] || path[path.length - 1];
}

function renderResponsivePuzzle() {
  const bState = boardStateForNode(state.currentNode);
  drawBoard(bState);
  renderStatusNode(bState);

  const next = state.puzzle.answerPath[state.puzzle.answerIndex + 1];
  const done = !next;
  if (done) {
    statusEl.textContent = `Solved | Move ${bState.moveNumber} | Board ${bState.size}x${bState.size}`;
    notesEl.textContent = state.puzzle.answerComment;
    hintTextEl.textContent = "Solved. Load another problem or change mode.";
  } else {
    notesEl.textContent = "Find the correct move continuation.";
    hintTextEl.textContent = `Play as ${state.puzzle.playerColor === "B" ? "Black" : "White"}. Wrong move shows immediately.`;
  }
}

function setupAnswerKeyPuzzle() {
  const path = buildMainlinePath(state.root);
  state.puzzle.answerPath = path;
  state.puzzle.answerMoves = extractAnswerMoves(path);
  state.puzzle.answerComment = findAnswerComment(path);
  state.puzzle.userMoves = [];
  state.currentNode = state.root;

  const baseState = boardStateForNode(state.root);
  state.puzzle.baseBoardState = {
    board: cloneBoard(baseState.board),
    captures: { ...baseState.captures },
    size: baseState.size,
    moveNumber: baseState.moveNumber,
    lastMove: baseState.lastMove,
  };

  renderAnswerKeyPuzzle();
}

function rebuildAnswerAttemptBoard() {
  const base = state.puzzle.baseBoardState;
  const board = cloneBoard(base.board);
  const captures = { ...base.captures };
  let lastMove = base.lastMove;

  for (const move of state.puzzle.userMoves) {
    applyMove(board, move.color, move.point, captures);
    lastMove = move.point;
  }

  return {
    board,
    captures,
    size: base.size,
    moveNumber: base.moveNumber + state.puzzle.userMoves.length,
    lastMove,
    labels: [],
    marks: [],
  };
}

function renderAnswerKeyPuzzle() {
  const bState = rebuildAnswerAttemptBoard();
  drawBoard(bState);
  capturesEl.textContent = `Captures -> Black: ${bState.captures.B} | White: ${bState.captures.W}`;
  statusEl.textContent = `Your line length: ${state.puzzle.userMoves.length} / ${state.puzzle.answerMoves.length}`;
  notesEl.textContent = "Play both sides, then press Submit to compare with the answer line.";
  hintTextEl.textContent = "Alternate moves by clicking intersections. Submit checks exact move order.";
}

function render() {
  if (!state.currentNode) {
    return;
  }

  if (state.mode === MODES.EXPLORATION) {
    renderExploration();
  } else if (state.mode === MODES.RESPONSIVE) {
    renderResponsivePuzzle();
  } else if (state.mode === MODES.ANSWER_KEY) {
    renderAnswerKeyPuzzle();
  }
}

function canGoNext() {
  return (state.currentNode.children || []).length > 0;
}

function goFirst() {
  if (state.virtualRoot.children[0]) {
    state.currentNode = state.virtualRoot.children[0];
    render();
  }
}

function goPrev() {
  if (!state.currentNode?.parent || state.currentNode.parent === state.virtualRoot) {
    return;
  }
  state.currentNode = state.currentNode.parent;
  render();
}

function goNext() {
  const children = state.currentNode.children || [];
  if (!children.length) {
    return;
  }
  const idx = state.selectedChildByNodeId.get(state.currentNode.id) || 0;
  state.currentNode = children[Math.min(idx, children.length - 1)];
  render();
}

function goLast() {
  let guard = 1000;
  while (guard > 0 && canGoNext()) {
    guard -= 1;
    goNext();
  }
}

function goToChildByMove(point) {
  const children = state.currentNode.children || [];
  if (!children.length) {
    return;
  }

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const moveCoord = child.props.B?.[0] || child.props.W?.[0];
    const m = coordToPoint(moveCoord);
    if (m && m.x === point.x && m.y === point.y) {
      state.selectedChildByNodeId.set(state.currentNode.id, i);
      state.currentNode = child;
      render();
      return;
    }
  }
}

function applyResponsiveClick(point) {
  const path = state.puzzle.answerPath;
  const next = path[state.puzzle.answerIndex + 1];
  if (!next) {
    return;
  }

  const move = getNodeMove(next);
  if (!move || !move.point || move.color !== state.puzzle.playerColor) {
    return;
  }

  if (move.point.x !== point.x || move.point.y !== point.y) {
    showFeedback("Wrong!", true);
    return true;
  }

  state.puzzle.answerIndex += 1;
  advanceResponsiveToPlayerTurn();

  if (state.puzzle.answerIndex >= path.length - 1) {
    showFeedback("Correct line", false);
  }

  render();
  return true;
}

function answerKeyNextColor() {
  const firstAnswerMove = state.puzzle.answerMoves[0];
  const startColor = firstAnswerMove ? firstAnswerMove.color : "B";
  if (!state.puzzle.userMoves.length) {
    return startColor;
  }
  return state.puzzle.userMoves[state.puzzle.userMoves.length - 1].color === "B" ? "W" : "B";
}

function applyAnswerKeyClick(point) {
  const boardState = rebuildAnswerAttemptBoard();
  if (boardState.board[point.y][point.x] !== null) {
    return false;
  }

  const color = answerKeyNextColor();
  state.puzzle.userMoves.push({
    color,
    point,
    coord: pointToCoord(point),
  });
  render();
  return true;
}

function submitAnswerKey() {
  const expected = state.puzzle.answerMoves;
  const actual = state.puzzle.userMoves;

  const sameLength = expected.length === actual.length;
  let match = sameLength;
  if (sameLength) {
    for (let i = 0; i < expected.length; i += 1) {
      const e = expected[i];
      const a = actual[i];
      if (!a || e.color !== a.color || e.point.x !== a.point.x || e.point.y !== a.point.y) {
        match = false;
        break;
      }
    }
  }

  if (!match) {
    showFeedback("Wrong!", true);
    notesEl.textContent = "Line does not match the answer key. Reset and try again.";
    return;
  }

  showFeedback("Correct", false);
  notesEl.textContent = state.puzzle.answerComment;
}

function resetAnswerKeyAttempt() {
  state.puzzle.userMoves = [];
  render();
}

function applyModeUi() {
  modePill.textContent = MODE_LABELS[state.mode] || "Mode";

  const isExploration = state.mode === MODES.EXPLORATION;
  const isAnswerKey = state.mode === MODES.ANSWER_KEY;

  navRow.classList.toggle("hidden", !isExploration);
  variationBlockEl.classList.toggle("hidden", !isExploration);
  puzzleActions.classList.toggle("hidden", !isAnswerKey);

  if (isExploration) {
    hintTextEl.textContent = "Click a board point to follow that move when a branch exists.";
  }
}

async function loadSgf(path) {
  const res = await fetch(encodeURI(path));
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  const text = await res.text();

  state.nextNodeId = 1;
  state.selectedChildByNodeId.clear();
  state.puzzle.userMoves = [];
  state.ui.hover = null;
  chooseBoardRotationForCurrentPuzzle();
  clearConfirmPrompt();

  const gameTree = parseSgf(text);
  state.virtualRoot = buildNodeTree(gameTree);

  if (!state.virtualRoot.children.length) {
    throw new Error("SGF has no nodes");
  }

  state.root = state.virtualRoot.children[0];
  state.currentNode = state.root;

  const pathNodes = buildMainlinePath(state.root);
  state.puzzle.answerComment = findAnswerComment(pathNodes);

  if (state.mode === MODES.RESPONSIVE) {
    setupResponsivePuzzle();
  } else if (state.mode === MODES.ANSWER_KEY) {
    setupAnswerKeyPuzzle();
  } else {
    render();
  }
}

function openPuzzle(path, { recordHistory = true } = {}) {
  sgfSelect.value = path;
  startSgfSelect.value = path;
  return loadSgf(path)
    .then(() => {
      if (recordHistory) {
        recordPuzzleVisit(path);
      }
    })
    .catch((err) => {
      statusEl.textContent = err.message;
    });
}

function startMode(mode) {
  state.mode = mode;
  sgfSelect.value = startSgfSelect.value;

  startScreenEl.classList.add("hidden");
  viewerEl.classList.remove("hidden");
  applyModeUi();

  openPuzzle(sgfSelect.value);
}

function backToStart() {
  viewerEl.classList.add("hidden");
  startScreenEl.classList.remove("hidden");
  feedbackOverlayEl.classList.add("hidden");
  state.ui.hover = null;
  clearConfirmPrompt();
  state.mode = null;
}

function goNextPuzzle() {
  let nextPath = null;

  if (state.navigation.shuffleNextPuzzle) {
    const currentPath = sgfSelect.value;
    let guard = 200;
    while (guard > 0) {
      guard -= 1;
      const randomIdx = Math.floor(Math.random() * 100) + 1;
      const candidate = sgfPathForIndex(randomIdx);
      if (candidate !== currentPath || state.navigation.puzzleHistory.length <= 1) {
        nextPath = candidate;
        break;
      }
    }
    if (!nextPath) {
      nextPath = currentPath;
    }
  } else {
    const currentIdx = parseProblemIndex(sgfSelect.value);
    const nextIdx = currentIdx >= 100 ? 1 : currentIdx + 1;
    nextPath = sgfPathForIndex(nextIdx);
  }

  openPuzzle(nextPath);
}

function goPrevPuzzle() {
  if (state.navigation.puzzleHistoryIndex <= 0) {
    statusEl.textContent = "No earlier puzzle in history.";
    return;
  }
  state.navigation.puzzleHistoryIndex -= 1;
  const prevPath = state.navigation.puzzleHistory[state.navigation.puzzleHistoryIndex];
  openPuzzle(prevPath, { recordHistory: false });
}

function getBoardPointFromEvent(e) {
  if (!boardCanvas._renderMeta) {
    return null;
  }
  const rect = boardCanvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * boardCanvas.width;
  const y = ((e.clientY - rect.top) / rect.height) * boardCanvas.height;

  const { pad, cell, size } = boardCanvas._renderMeta;
  const gx = Math.round((x - pad) / cell);
  const gy = Math.round((y - pad) / cell);
  if (gx < 0 || gy < 0 || gx >= size || gy >= size) {
    return null;
  }
  return logicalPointFromDisplay({ x: gx, y: gy }, size);
}

function samePoint(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function getHoverCandidate(point) {
  if (!point || !state.mode) {
    return null;
  }

  if (state.mode === MODES.EXPLORATION) {
    const children = state.currentNode?.children || [];
    for (const child of children) {
      const move = getNodeMove(child);
      if (!move || !move.point) continue;
      if (move.point.x === point.x && move.point.y === point.y) {
        return { point, color: move.color };
      }
    }
    return null;
  }

  if (state.mode === MODES.RESPONSIVE) {
    const next = state.puzzle.answerPath[state.puzzle.answerIndex + 1];
    if (!next) return null;
    const bState = boardStateForNode(state.currentNode);
    if (bState.board[point.y][point.x] !== null) return null;
    return { point, color: state.puzzle.playerColor };
  }

  if (state.mode === MODES.ANSWER_KEY) {
    const bState = rebuildAnswerAttemptBoard();
    if (bState.board[point.y][point.x] !== null) return null;
    return { point, color: answerKeyNextColor() };
  }

  return null;
}

function clearConfirmPrompt() {
  state.ui.pendingConfirm = null;
  confirmPrompt.classList.add("hidden");
  if (state.ui.confirmMoves) {
    state.ui.hover = null;
    render();
  }
}

function setHoverCandidate(candidate) {
  const prev = state.ui.hover;
  const unchanged =
    (prev === null && candidate === null) ||
    (prev &&
      candidate &&
      prev.color === candidate.color &&
      samePoint(prev.point, candidate.point));
  if (unchanged) {
    return;
  }
  state.ui.hover = candidate;
  render();
}

function executeBoardAction(point) {
  clearConfirmPrompt();
  if (state.mode === MODES.EXPLORATION) {
    goToChildByMove(point);
    return;
  }
  if (state.mode === MODES.RESPONSIVE) {
    applyResponsiveClick(point);
    return;
  }
  if (state.mode === MODES.ANSWER_KEY) {
    applyAnswerKeyClick(point);
  }
}

function showConfirmPromptAt(point, color) {
  if (!boardCanvas._renderMeta) {
    return;
  }
  const { pad, cell, size } = boardCanvas._renderMeta;
  const displayPoint = displayPointFromLogical(point, size);
  const rect = boardCanvas.getBoundingClientRect();
  const cxCanvas = pad + displayPoint.x * cell;
  const cyCanvas = pad + displayPoint.y * cell;
  const cx = boardCanvas.offsetLeft + (cxCanvas / boardCanvas.width) * rect.width;
  const cy = boardCanvas.offsetTop + (cyCanvas / boardCanvas.height) * rect.height;

  state.ui.pendingConfirm = { point, color };
  state.ui.hover = { point, color };
  confirmPrompt.style.left = `${cx}px`;
  confirmPrompt.style.top = `${cy}px`;
  confirmPrompt.classList.remove("hidden");
  render();
}

function setSettingsExpanded(expanded) {
  settingsBody.classList.toggle("hidden", !expanded);
  settingsRow.classList.toggle("compact", !expanded);
  settingsToggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function wireEvents() {
  startSgfSelect.addEventListener("change", () => {
    sgfSelect.value = startSgfSelect.value;
  });

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      startMode(mode);
    });
  });

  settingsToggleBtn.addEventListener("click", () => {
    const expanded = settingsToggleBtn.getAttribute("aria-expanded") === "true";
    setSettingsExpanded(!expanded);
  });

  reloadBtn.addEventListener("click", () => {
    openPuzzle(sgfSelect.value);
  });

  prevPuzzleBtn.addEventListener("click", goPrevPuzzle);
  nextPuzzleBtn.addEventListener("click", goNextPuzzle);
  changeModeBtn.addEventListener("click", backToStart);
  confirmMoveToggle.addEventListener("change", () => {
    state.ui.confirmMoves = !!confirmMoveToggle.checked;
    clearConfirmPrompt();
  });

  shuffleNextToggle.addEventListener("change", () => {
    state.navigation.shuffleNextPuzzle = !!shuffleNextToggle.checked;
  });
  shuffleOrientationToggle.addEventListener("change", () => {
    state.navigation.shuffleOrientation = !!shuffleOrientationToggle.checked;
    chooseBoardRotationForCurrentPuzzle();
    if (state.currentNode) {
      render();
    }
  });

  sgfSelect.addEventListener("change", () => {
    openPuzzle(sgfSelect.value);
  });

  firstBtn.addEventListener("click", goFirst);
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  lastBtn.addEventListener("click", goLast);

  puzzleSubmitBtn.addEventListener("click", submitAnswerKey);
  puzzleResetBtn.addEventListener("click", resetAnswerKeyAttempt);
  confirmMoveBtn.addEventListener("click", () => {
    const pending = state.ui.pendingConfirm;
    if (!pending) return;
    executeBoardAction(pending.point);
  });
  cancelMoveBtn.addEventListener("click", clearConfirmPrompt);

  window.addEventListener("keydown", (e) => {
    if (state.mode !== MODES.EXPLORATION) {
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "Home") {
      e.preventDefault();
      goFirst();
    } else if (e.key === "End") {
      e.preventDefault();
      goLast();
    }
  });

  boardCanvas.addEventListener("click", (e) => {
    if (!boardCanvas._renderMeta || !state.mode) {
      return;
    }
    const point = getBoardPointFromEvent(e);
    if (!point) {
      return;
    }

    const candidate = getHoverCandidate(point);
    if (!candidate) {
      return;
    }

    if (state.ui.confirmMoves) {
      showConfirmPromptAt(point, candidate.color);
      return;
    }

    executeBoardAction(point);
  });

  boardCanvas.addEventListener("mousemove", (e) => {
    const point = getBoardPointFromEvent(e);
    const candidate = getHoverCandidate(point);
    setHoverCandidate(candidate);
  });

  boardCanvas.addEventListener("mouseleave", () => {
    if (state.ui.pendingConfirm) {
      return;
    }
    setHoverCandidate(null);
  });

  boardPanelEl.addEventListener("click", (e) => {
    if (!confirmPrompt.classList.contains("hidden") && !confirmPrompt.contains(e.target) && e.target !== boardCanvas) {
      clearConfirmPrompt();
    }
  });

  document.addEventListener("click", (e) => {
    if (confirmPrompt.classList.contains("hidden")) {
      return;
    }
    const target = e.target;
    if (confirmPrompt.contains(target) || target === boardCanvas) {
      return;
    }
    if (target instanceof Element && target.closest("button")) {
      clearConfirmPrompt();
    } else if (!boardPanelEl.contains(target)) {
      clearConfirmPrompt();
    }
  });
}

initSelector(startSgfSelect);
initSelector(sgfSelect);
startSgfSelect.value = `${SGF_DIR}/001.sgf`;
sgfSelect.value = startSgfSelect.value;
setSettingsExpanded(true);
wireEvents();
