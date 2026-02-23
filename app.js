const SGF_DIR = "9x9 Endgame Book 1";

const boardCanvas = document.getElementById("board");
const ctx = boardCanvas.getContext("2d");
const sgfSelect = document.getElementById("sgfSelect");
const reloadBtn = document.getElementById("reloadBtn");
const firstBtn = document.getElementById("firstBtn");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const lastBtn = document.getElementById("lastBtn");
const statusEl = document.getElementById("status");
const capturesEl = document.getElementById("captures");
const notesEl = document.getElementById("notes");
const variationsEl = document.getElementById("variations");

const state = {
  root: null,
  virtualRoot: null,
  currentNode: null,
  selectedChildByNodeId: new Map(),
  nextNodeId: 1,
  boardSize: 9,
};

function initSelector() {
  for (let i = 1; i <= 100; i += 1) {
    const id = String(i).padStart(3, "0");
    const option = document.createElement("option");
    option.value = `${SGF_DIR}/${id}.sgf`;
    option.textContent = `${id}.sgf`;
    sgfSelect.appendChild(option);
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

    if (n.props.B && n.props.B.length) {
      moveNumber += 1;
      const point = coordToPoint(n.props.B[0]);
      applyMove(board, "B", point, captures);
      lastMove = point;
    }
    if (n.props.W && n.props.W.length) {
      moveNumber += 1;
      const point = coordToPoint(n.props.W[0]);
      applyMove(board, "W", point, captures);
      lastMove = point;
    }
  }

  return { board, captures, moveNumber, lastMove, size };
}

function currentComment() {
  const comments = state.currentNode?.props?.C || [];
  return comments.join("\n").trim();
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
      const cx = pad + x * cell;
      const cy = pad + y * cell;

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

  if (stateForNode.lastMove) {
    const cx = pad + stateForNode.lastMove.x * cell;
    const cy = pad + stateForNode.lastMove.y * cell;
    const color = stateForNode.board[stateForNode.lastMove.y][stateForNode.lastMove.x] === "B" ? "#fff" : "#111";
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.arc(cx, cy, stoneR * 0.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  const labels = parseLabels(state.currentNode);
  ctx.font = `${Math.max(11, Math.round(cell * 0.34))}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const l of labels) {
    if (l.x >= size || l.y >= size) continue;
    const cx = pad + l.x * cell;
    const cy = pad + l.y * cell;
    const under = stateForNode.board[l.y][l.x];
    ctx.fillStyle = under === "B" ? "#fff" : "#111";
    ctx.fillText(l.text, cx, cy);
  }

  const marks = parseMarks(state.currentNode);
  for (const m of marks) {
    if (m.x >= size || m.y >= size) continue;
    const cx = pad + m.x * cell;
    const cy = pad + m.y * cell;
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

function renderStatus(boardState) {
  const hasMove = state.currentNode.props.B || state.currentNode.props.W;
  const moveColor = state.currentNode.props.B ? "Black" : state.currentNode.props.W ? "White" : null;
  const moveCoord = state.currentNode.props.B?.[0] || state.currentNode.props.W?.[0] || "";

  const prefix = hasMove ? `${moveColor} played ${moveCoord || "pass"}` : "Setup / root node";
  statusEl.textContent = `${prefix} | Move ${boardState.moveNumber} | Board ${boardState.size}x${boardState.size}`;
  capturesEl.textContent = `Captures -> Black: ${boardState.captures.B} | White: ${boardState.captures.W}`;

  const note = currentComment();
  notesEl.textContent = note || "(No note on this node)";
}

function render() {
  if (!state.currentNode) {
    return;
  }
  const bState = boardStateForNode(state.currentNode);
  drawBoard(bState);
  renderStatus(bState);
  renderVariations();
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

async function loadSgf(path) {
  const res = await fetch(encodeURI(path));
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  const text = await res.text();

  state.nextNodeId = 1;
  state.selectedChildByNodeId.clear();
  const gameTree = parseSgf(text);
  state.virtualRoot = buildNodeTree(gameTree);

  if (!state.virtualRoot.children.length) {
    throw new Error("SGF has no nodes");
  }

  state.root = state.virtualRoot.children[0];
  state.currentNode = state.root;
  render();
}

function wireEvents() {
  reloadBtn.addEventListener("click", () => {
    loadSgf(sgfSelect.value).catch((err) => {
      statusEl.textContent = err.message;
    });
  });

  sgfSelect.addEventListener("change", () => {
    loadSgf(sgfSelect.value).catch((err) => {
      statusEl.textContent = err.message;
    });
  });

  firstBtn.addEventListener("click", goFirst);
  prevBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  lastBtn.addEventListener("click", goLast);

  window.addEventListener("keydown", (e) => {
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
    if (!boardCanvas._renderMeta) {
      return;
    }
    const rect = boardCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * boardCanvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * boardCanvas.height;

    const { pad, cell, size } = boardCanvas._renderMeta;
    const gx = Math.round((x - pad) / cell);
    const gy = Math.round((y - pad) / cell);

    if (gx < 0 || gy < 0 || gx >= size || gy >= size) {
      return;
    }

    goToChildByMove({ x: gx, y: gy });
  });
}

initSelector();
wireEvents();
loadSgf(`${SGF_DIR}/001.sgf`).catch((err) => {
  statusEl.textContent = err.message;
});
