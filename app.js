(() => {
  const START = "WW3BB/WW1R1BB/2RRR2/1RRRRR1/2RRR2/BB1R1WW/BB3WW w 0 0";
  const FILES = "abcdefg";

  const el = {
    board: document.getElementById("board"),
    status: document.getElementById("status"),
    caps: document.getElementById("caps"),
    evalWhite: document.getElementById("eval-white"),
    evalLabel: document.getElementById("eval-label"),
    pv: document.getElementById("pv"),
    info: document.getElementById("info"),
    moves: document.getElementById("moves"),
    kfen: document.getElementById("kfen"),
    pvPreview: document.getElementById("pv-preview"),
    wPlayer: document.getElementById("w-player"),
    bPlayer: document.getElementById("b-player"),
    movetime: document.getElementById("movetime"),
    btnGo: document.getElementById("btn-go"),
    btnNew: document.getElementById("btn-new"),
    btnUndo: document.getElementById("btn-undo"),
    btnFlip: document.getElementById("btn-flip"),
    btnAnalyze: document.getElementById("btn-analyze"),
    btnInfinite: document.getElementById("btn-infinite"),
    btnSet: document.getElementById("btn-set"),
    btnSettings: document.getElementById("btn-settings"),
    settings: document.getElementById("settings"),
    nnueName: document.getElementById("nnue-name"),
    nnueInfo: document.getElementById("nnue-info"),
    nnueMsg: document.getElementById("nnue-msg"),
    btnNnue: document.getElementById("btn-nnue"),
    nnueFile: document.getElementById("nnue-file"),
    evalCol: document.getElementById("eval-col"),
    playPanel: document.getElementById("play-panel"),
    puzzlePanel: document.getElementById("puzzle-panel"),
    puzzleMoves: document.getElementById("puzzle-moves"),
    puzzleTabCount: document.getElementById("puzzle-tab-count"),
    puzzleStatus: document.getElementById("puzzle-status"),
    puzzleCaps: document.getElementById("puzzle-caps"),
    tabGuide: document.getElementById("tab-guide"),
    tabPlay: document.getElementById("tab-play"),
    tabPuzzles: document.getElementById("tab-puzzles"),
    boardWrap: document.getElementById("board-wrap"),
    side: document.getElementById("side-panel"),
    guidePanel: document.getElementById("guide-panel"),
    btnGuidePlay: document.getElementById("btn-guide-play"),
    btnPuzzleHint: document.getElementById("btn-puzzle-hint"),
    btnPuzzleRetry: document.getElementById("btn-puzzle-retry"),
    btnPuzzleSolution: document.getElementById("btn-puzzle-solution"),
    btnPuzzleNext: document.getElementById("btn-puzzle-next"),
    btnPuzzleFlip: document.getElementById("btn-puzzle-flip"),
  };

  const ASSET_V = "12";
  const DEFAULT_NNUE = "C16_C12_blind.nnue";
  const EVAL_SCALE = 500; // +1.0 = +500cp
  const worker = new Worker("worker.js?v=" + ASSET_V);

  const state = {
    kfen: START,
    legal: [],
    winner: 0,
    stm: 0,
    history: [START],
    moveList: [],
    selected: -1,
    lastMove: "",
    pv: [],
    pvMove: "",
    score: 0,
    flipped: false,
    busy: false,
    analyzingOnce: false,
    infinite: false,
    ready: false,
    previewId: 0,
    hoverSpan: null,
    hoverMove: "",
    previewKfen: "",
    searchGen: 0,
    pendingMove: null,
    expectPos: false,
    nnueLabel: "",
    mode: "play",
    guideFrom: "play",
    posToken: 0,
    savedPlay: null,
    solved: new Set(),
    puzzle: {
      index: -1,
      step: 0,
      phase: "user",
      revealing: false,
      timer: 0,
    },
  };

  const SOLVED_KEY = "kahu.puzzles.solved";
  state.solved = loadSolved();
  let puzzleList = [];
  let ignoreHash = false;

  let hideMiniTimer = 0;

  function parseNnue(bytes) {
    if (bytes.length < 44) return { error: "File is too small to be an NNUE" };
    let magic = "";
    for (let i = 0; i < 16 && bytes[i]; i++) magic += String.fromCharCode(bytes[i]);
    const m = /^KUBA_NNUE_V([1345])$/.exec(magic);
    if (!m) return { error: "Not a Kahu NNUE (need a KUBA_NNUE_V1/V3/V4/V5 file)" };
    const version = Number(m[1]);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const hdrVer = view.getUint32(16, true);
    const hidden = view.getUint32(20, true);
    const hidden2 = view.getUint32(24, true);
    const fpm = view.getUint32(28, true);
    const feat = view.getUint32(32, true);
    if (hdrVer !== version) return { error: "NNUE header version mismatch" };
    if (hidden < 1 || hidden > 512 || hidden2 < 1 || hidden2 > 64) {
      return { error: "NNUE architecture is not supported" };
    }
    const fpmExpect = 49 * 3 + 8 + 8 + 1;
    const featExpect = 17 * fpmExpect;
    if (fpm !== fpmExpect || feat !== featExpect) {
      return { error: "NNUE feature layout is not compatible" };
    }
    const ob = 16;
    let need = 44 + feat * hidden * 4;
    if (version >= 4) {
      need += ob * 2 * hidden * hidden2 * 4;
      need += ob * hidden2 * 4;
      need += ob * hidden2 * 4 * 2;
      need += ob * hidden2 * hidden2 * 4;
      need += ob * hidden2 * 4;
      need += ob * hidden2 * 4 * 2;
      need += ob * hidden2 * 4;
      need += ob * hidden2 * 4;
      need += ob * 4;
      need += ob * 2 * hidden * 4;
      need += ob * 4;
      need += ob * 28 * hidden2 * 4;
    } else {
      need += ob * 2 * hidden * hidden2 * 4;
      need += ob * hidden2 * 4;
      need += ob * hidden2 * 4;
      need += ob * 4;
      need += ob * 2 * hidden * 4;
    }
    if (bytes.length < need) return { error: "NNUE file is truncated" };
    return { version, hidden, hidden2, label: `v${version} · ${hidden}×${hidden2}` };
  }

  function setNnueMsg(text, ok) {
    if (!text) {
      el.nnueMsg.hidden = true;
      el.nnueMsg.textContent = "";
      return;
    }
    el.nnueMsg.hidden = false;
    el.nnueMsg.textContent = text;
    el.nnueMsg.classList.toggle("ok", !!ok);
  }

  function setSettingsOpen(open) {
    el.settings.hidden = !open;
    el.btnSettings.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function parseKfen(kfen) {
    const parts = (kfen || "").trim().split(/\s+/);
    const cells = Array(49).fill(".");
    let i = 0;
    for (const ch of parts[0] || "") {
      if (ch === "/") continue;
      if (ch >= "1" && ch <= "9") {
        i += Number(ch);
      } else if (i < 49) {
        cells[i++] = ch;
      }
    }
    return {
      cells,
      stm: parts[1] === "b" ? 1 : 0,
      capW: Number(parts[2] || 0),
      capB: Number(parts[3] || 0),
    };
  }

  function sqOf(file, rank) {
    return (7 - rank) * 7 + (file - 1);
  }

  function destSq(move) {
    const file = move.charCodeAt(0) - 96;
    const rank = Number(move[1]);
    const dir = move[2];
    let f = file, r = rank;
    if (dir === "N") r += 1;
    else if (dir === "S") r -= 1;
    else if (dir === "E") f += 1;
    else if (dir === "W") f -= 1;
    if (f < 1 || f > 7 || r < 1 || r > 7) return -1;
    return sqOf(f, r);
  }

  function fromSq(move) {
    return sqOf(move.charCodeAt(0) - 96, Number(move[1]));
  }

  function visRC(sq) {
    const r = Math.floor(sq / 7);
    const c = sq % 7;
    if (!state.flipped) return { r, c };
    return { r: 6 - r, c: 6 - c };
  }

  function visIndex(sq) {
    const v = visRC(sq);
    return v.r * 7 + v.c;
  }

  function scoreWhite(cp) {
    return state.stm === 0 ? cp : -cp;
  }

  function formatScore(cp) {
    if (Math.abs(cp) >= 28000) return cp > 0 ? "M" : "-M";
    const v = scoreWhite(cp) / EVAL_SCALE;
    const t = (v > 0 ? "+" : "") + v.toFixed(2);
    return t === "-0.00" || t === "+0.00" ? "0.00" : t;
  }

  function setEval(cp) {
    state.score = cp;
    const w = scoreWhite(cp);
    const scaled = w / EVAL_SCALE;
    const t = Math.abs(w) >= 28000 ? Math.sign(w) : Math.max(-1, Math.min(1, scaled));
    el.evalWhite.style.height = (50 + t * 50) + "%";
    el.evalLabel.textContent = formatScore(cp);
  }

  function renderBoard() {
    const pos = parseKfen(state.kfen);
    el.board.replaceChildren();

    const legalFrom = state.selected >= 0
      ? state.legal.filter((m) => fromSq(m) === state.selected)
      : [];
    const legalDests = new Set(legalFrom.map(destSq));

    for (let sq = 0; sq < 49; sq++) {
      const r = Math.floor(sq / 7);
      const c = sq % 7;
      const cell = document.createElement("div");
      cell.className = "sq";
      cell.dataset.sq = String(sq);

      if (state.lastMove && (fromSq(state.lastMove) === sq || destSq(state.lastMove) === sq)) {
        cell.classList.add("last");
      }
      if (state.selected === sq) cell.classList.add("sel");

      const vis = visRC(sq);
      if (vis.c === 0) {
        const rank = document.createElement("span");
        rank.className = "coord rank";
        rank.textContent = String(7 - r);
        cell.appendChild(rank);
      }
      if (vis.r === 6) {
        const file = document.createElement("span");
        file.className = "coord file";
        file.textContent = FILES[c];
        cell.appendChild(file);
      }

      const piece = pos.cells[sq];
      if (piece !== ".") {
        const m = document.createElement("div");
        m.className = "marble " + piece;
        cell.appendChild(m);
      }

      if (legalDests.has(sq)) {
        const d = document.createElement("div");
        d.className = "legal-dot";
        cell.appendChild(d);
      }

      if (state.selected === sq) {
        const visFlip = { N: "S", S: "N", E: "W", W: "E" };
        for (const m of legalFrom) {
          if (destSq(m) !== -1) continue;
          const tick = document.createElement("button");
          tick.type = "button";
          tick.className = "offboard " + (state.flipped ? visFlip[m[2]] : m[2]);
          tick.title = m;
          tick.addEventListener("click", (e) => {
            e.stopPropagation();
            playMove(m);
          });
          cell.appendChild(tick);
        }
      }

      cell.addEventListener("click", () => onSquare(sq));
      el.board.appendChild(cell);
    }

    const nodes = Array.from(el.board.children);
    nodes.sort((a, b) => visIndex(Number(a.dataset.sq)) - visIndex(Number(b.dataset.sq)));
    nodes.forEach((n) => el.board.appendChild(n));

    el.caps.textContent = `Reds — White ${pos.capW} · Black ${pos.capB}`;
    el.kfen.value = state.kfen;
  }

  function renderStatus() {
    if (!state.ready) {
      el.status.textContent = "Loading engine…";
      return;
    }
    if (state.winner === 1) el.status.textContent = "White wins";
    else if (state.winner === 2) el.status.textContent = "Black wins";
    else el.status.textContent = (state.stm === 0 ? "White" : "Black") + " to move";
  }

  function renderMoves() {
    const target = state.mode === "puzzle" ? el.puzzleMoves : el.moves;
    target.replaceChildren();
    for (let i = 0; i < state.moveList.length; i += 2) {
      const li = document.createElement("li");
      li.textContent = state.moveList[i] + (state.moveList[i + 1] ? "  " + state.moveList[i + 1] : "");
      target.appendChild(li);
    }
    target.scrollTop = target.scrollHeight;
  }

  function renderPv(pvStr) {
    const moves = (pvStr || "").trim().split(/\s+/).filter(Boolean);
    if (moves.join(" ") === state.pv.join(" ") && el.pv.querySelector("span")) return;
    hideMini();
    state.pv = moves;
    el.pv.replaceChildren();
    if (!moves.length) {
      el.pv.textContent = "—";
      return;
    }
    moves.forEach((mv, i) => {
      const span = document.createElement("span");
      span.textContent = mv;
      span.addEventListener("mouseenter", () => hoverLine(i, span));
      span.addEventListener("mouseleave", hideMiniSoon);
      span.addEventListener("click", (e) => {
        e.preventDefault();
        playPvTo(i);
      });
      el.pv.appendChild(span);
      el.pv.appendChild(document.createTextNode(" "));
    });
  }

  function paintMiniBoard(kfen, lastMove) {
    const pos = parseKfen(kfen);
    const board = document.createElement("div");
    board.className = "mini-board";
    const cells = [];
    for (let sq = 0; sq < 49; sq++) {
      const cell = document.createElement("div");
      cell.className = "sq";
      if (lastMove && (fromSq(lastMove) === sq || destSq(lastMove) === sq)) {
        cell.classList.add("last");
      }
      const piece = pos.cells[sq];
      if (piece !== ".") {
        const m = document.createElement("div");
        m.className = "marble " + piece;
        cell.appendChild(m);
      }
      cells.push(cell);
    }
    const ordered = Array.from({ length: 49 }, (_, sq) => sq)
      .sort((a, b) => visIndex(a) - visIndex(b));
    for (const sq of ordered) board.appendChild(cells[sq]);
    el.pvPreview.replaceChildren(board);
    el.pvPreview.hidden = false;
  }

  function placeMini(span) {
    el.pvPreview.hidden = false;
    const r = span.getBoundingClientRect();
    const box = el.pvPreview.getBoundingClientRect();
    let left = r.left + r.width / 2 - box.width / 2;
    let top = r.top - box.height - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8));
    if (top < 8) top = r.bottom + 8;
    el.pvPreview.style.left = left + "px";
    el.pvPreview.style.top = top + "px";
  }

  function hideMini() {
    clearTimeout(hideMiniTimer);
    hideMiniTimer = 0;
    state.previewId += 1;
    state.hoverSpan = null;
    state.hoverMove = "";
    state.previewKfen = "";
    el.pvPreview.hidden = true;
    el.pvPreview.replaceChildren();
  }

  function hideMiniSoon() {
    clearTimeout(hideMiniTimer);
    hideMiniTimer = setTimeout(hideMini, 80);
  }

  function hoverLine(index, span) {
    clearTimeout(hideMiniTimer);
    state.hoverSpan = span;
    state.hoverMove = state.pv[index] || "";
    const id = ++state.previewId;
    const prefix = state.pv.slice(0, index + 1).join(" ");
    worker.postMessage({ cmd: "preview", kfen: state.kfen, moves: prefix, id });
  }

  function playPvTo(index) {
    if (!state.ready || state.winner) return;
    const moves = state.pv.slice(0, index + 1);
    if (!moves.length) return;
    if (!state.legal.includes(moves[0])) return;
    if (state.pendingMove) return;
    hideMini();
    stopAnalysis();
    state.busy = true;
    state.selected = -1;
    state.expectPos = true;
    state.posToken += 1;
    worker.postMessage({ cmd: "line", moves: moves.join(" "), token: state.posToken });
  }

  function onSquare(sq) {
    if (!state.ready || state.busy || state.winner) return;
    if (state.mode === "puzzle") {
      if (state.puzzle.phase !== "user" || state.puzzle.revealing) return;
    } else {
      const human = (state.stm === 0 ? el.wPlayer.value : el.bPlayer.value) === "human";
      if (!human) return;
    }

    if (state.selected >= 0) {
      const hit = state.legal.find((m) => fromSq(m) === state.selected && destSq(m) === sq);
      if (hit) {
        playMove(hit);
        return;
      }
    }
    const mine = parseKfen(state.kfen).cells[sq];
    const want = state.stm === 0 ? "W" : "B";
    if (mine === want && state.legal.some((m) => fromSq(m) === sq)) {
      state.selected = sq;
    } else {
      state.selected = -1;
    }
    renderBoard();
  }

  function playMove(move) {
    if (!state.ready || state.busy) return;
    if (state.mode === "puzzle") {
      if (state.puzzle.phase === "done") return;
      if (state.puzzle.phase === "user" && !state.puzzle.revealing) {
        const puzzle = currentPuzzle();
        const accepted = puzzle ? puzzle.moves[state.puzzle.step] || [] : [];
        if (!accepted.includes(move)) {
          rejectPuzzleMove();
          return;
        }
      }
    }
    state.busy = true;
    state.selected = -1;
    state.pendingMove = move;
    state.posToken += 1;
    worker.postMessage({ cmd: "move", move, token: state.posToken });
  }

  function applyPos(msg, fromMove) {
    if (msg.token !== undefined && msg.token !== state.posToken) return;
    state.kfen = msg.kfen;
    state.legal = msg.legal || [];
    state.winner = msg.winner;
    state.stm = msg.stm;
    state.busy = false;
    state.expectPos = false;
    if (fromMove && state.pendingMove) {
      state.history.push(msg.kfen);
      state.moveList.push(state.pendingMove);
      state.lastMove = state.pendingMove;
      state.pendingMove = null;
      renderMoves();
    }
    setEval(msg.eval);
    renderBoard();
    renderStatus();
    if (state.mode === "puzzle" || (state.mode === "guide" && state.guideFrom === "puzzle")) {
      afterPuzzlePos(fromMove, msg);
      return;
    }
    if (state.mode === "guide") return;
    if (!state.analyzingOnce && !state.infinite) maybeEngineTurn();
  }

  function setAnalyzeUi() {
    el.btnAnalyze.classList.toggle("active", state.analyzingOnce);
    el.btnInfinite.classList.toggle("active", state.infinite);
  }

  function stopAnalysis() {
    state.analyzingOnce = false;
    state.infinite = false;
    setAnalyzeUi();
    cancelSearch();
  }

  function maybeEngineTurn() {
    if (!state.ready || state.winner || state.busy) return;
    if (state.infinite) {
      requestSearch();
      return;
    }
    const side = state.stm === 0 ? el.wPlayer.value : el.bPlayer.value;
    if (side === "engine") requestSearch();
  }

  function cancelSearch() {
    state.searchGen += 1;
    worker.postMessage({ cmd: "stop" });
  }

  function requestSearch() {
    state.busy = true;
    el.btnGo.disabled = true;
    worker.postMessage({
      cmd: "search",
      endless: !!state.infinite,
      ms: state.infinite ? 0 : (Number(el.movetime.value) || 1000),
      gen: state.searchGen,
    });
  }

  worker.onmessage = (ev) => {
    const msg = ev.data;
    if (msg.type === "error") {
      el.status.textContent = msg.error;
      state.busy = false;
      return;
    }
    if (msg.type === "ready") {
      state.ready = true;
      if (state.mode === "puzzle" && puzzleList.length && state.puzzle.index >= 0) {
        openPuzzle(state.puzzle.index);
        return;
      }
      applyPos(msg, false);
      return;
    }
    if (msg.type === "nnue") {
      state.busy = false;
      if (!msg.ok) {
        setNnueMsg(msg.error || "Engine rejected this file", false);
        return;
      }
      el.nnueName.textContent = msg.name;
      el.nnueInfo.textContent = state.nnueLabel || "Loaded";
      setNnueMsg("Loaded", true);
      applyPos(msg, false);
      return;
    }
    if (msg.type === "info") {
      setEval(msg.score);
      renderPv(msg.pv);
      const nps = msg.elapsed > 0 ? Math.round(msg.nodes * 1000 / msg.elapsed) : 0;
      el.info.textContent = `depth ${msg.depth} · ${msg.nodes} nodes · ${nps} nps`;
      if (msg.pv) state.pvMove = msg.pv.split(" ")[0];
      return;
    }
    if (msg.type === "preview" && msg.id === state.previewId) {
      if (state.hoverSpan && document.contains(state.hoverSpan)) {
        state.previewKfen = msg.kfen;
        paintMiniBoard(msg.kfen, state.hoverMove);
        placeMini(state.hoverSpan);
      }
      return;
    }
    if (msg.type === "line") {
      if (msg.token !== undefined && msg.token !== state.posToken) return;
      hideMini();
      const rest = state.pv.slice((msg.applied || []).length);
      for (const step of msg.applied || []) {
        state.history.push(step.kfen);
        state.moveList.push(step.move);
        state.lastMove = step.move;
      }
      state.pendingMove = null;
      renderMoves();
      applyPos(msg, false);
      if (rest.length) renderPv(rest.join(" "));
      return;
    }
    if (msg.type === "pos") {
      if (msg.token !== undefined && msg.token !== state.posToken) return;
      const played = !!state.pendingMove && msg.ok !== false;
      if (msg.ok === false) state.pendingMove = null;
      applyPos(msg, played);
      return;
    }
    if (msg.type === "search") {
      if (msg.gen !== undefined && msg.gen !== state.searchGen) {
        if (!state.expectPos) {
          state.busy = false;
          el.btnGo.disabled = false;
        }
        return;
      }
      const m = /bestmove\s+(\S+)/.exec(msg.raw || "");
      const scoreM = /score\s+(-?\d+)/.exec(msg.raw || "");
      if (scoreM) setEval(Number(scoreM[1]));
      state.busy = false;
      el.btnGo.disabled = false;
      if (state.analyzingOnce) {
        state.analyzingOnce = false;
        setAnalyzeUi();
        return;
      }
      if (msg.endless || state.infinite) {
        return;
      }
      if (m && m[1] && m[1] !== "000") {
        playMove(m[1]);
      } else {
        applyPos(msg, false);
      }
    }
  };

  el.btnNew.onclick = () => {
    stopAnalysis();
    state.history = [START];
    state.moveList = [];
    state.lastMove = "";
    state.selected = -1;
    state.pv = [];
    state.pendingMove = null;
    state.busy = true;
    state.expectPos = true;
    state.posToken += 1;
    renderPv("");
    renderMoves();
    worker.postMessage({ cmd: "reset", token: state.posToken });
  };

  el.btnUndo.onclick = () => {
    if (state.history.length < 2) return;
    stopAnalysis();
    state.history.pop();
    state.moveList.pop();
    state.lastMove = state.moveList[state.moveList.length - 1] || "";
    const kfen = state.history[state.history.length - 1];
    state.pendingMove = null;
    state.busy = true;
    state.expectPos = true;
    state.posToken += 1;
    worker.postMessage({ cmd: "set", kfen, token: state.posToken });
    renderMoves();
  };

  function toggleFlip() {
    state.flipped = !state.flipped;
    renderBoard();
    if (state.previewKfen && state.hoverSpan && document.contains(state.hoverSpan)) {
      paintMiniBoard(state.previewKfen, state.hoverMove);
      placeMini(state.hoverSpan);
    }
  }
  el.btnFlip.onclick = toggleFlip;

  el.btnGo.onclick = () => {
    if (state.analyzingOnce || state.infinite) return;
    if (!state.busy && !state.winner) requestSearch();
  };

  el.btnAnalyze.onclick = () => {
    if (state.analyzingOnce || state.infinite) {
      stopAnalysis();
      return;
    }
    if (state.busy || state.winner || !state.ready) return;
    state.infinite = false;
    state.analyzingOnce = true;
    setAnalyzeUi();
    requestSearch();
  };

  el.btnInfinite.onclick = () => {
    if (state.infinite) {
      stopAnalysis();
      return;
    }
    if (state.busy || state.winner || !state.ready) return;
    state.analyzingOnce = false;
    state.infinite = true;
    setAnalyzeUi();
    requestSearch();
  };

  el.btnSet.onclick = () => {
    const kfen = el.kfen.value.trim();
    if (!kfen) return;
    stopAnalysis();
    state.history = [kfen];
    state.moveList = [];
    state.lastMove = "";
    state.pendingMove = null;
    state.busy = true;
    state.expectPos = true;
    state.posToken += 1;
    worker.postMessage({ cmd: "set", kfen, token: state.posToken });
    renderMoves();
  };

  el.wPlayer.onchange = () => {
    if (!state.analyzingOnce && !state.infinite) maybeEngineTurn();
  };
  el.bPlayer.onchange = () => {
    if (!state.analyzingOnce && !state.infinite) maybeEngineTurn();
  };

  el.btnSettings.onclick = (e) => {
    e.stopPropagation();
    setSettingsOpen(el.settings.hidden);
  };
  el.settings.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => setSettingsOpen(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setSettingsOpen(false);
  });

  el.btnNnue.onclick = () => el.nnueFile.click();
  el.nnueFile.onchange = async () => {
    const file = el.nnueFile.files && el.nnueFile.files[0];
    el.nnueFile.value = "";
    if (!file) return;
    if (!state.ready) {
      setNnueMsg("Engine is still loading", false);
      return;
    }
    let bytes;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (err) {
      setNnueMsg("Could not read that file", false);
      return;
    }
    const info = parseNnue(bytes);
    if (info.error) {
      setNnueMsg(info.error, false);
      return;
    }
    stopAnalysis();
    state.busy = true;
    state.nnueLabel = info.label;
    setNnueMsg("Loading…", true);
    worker.postMessage({ cmd: "loadNnue", name: file.name, buf: bytes.buffer }, [bytes.buffer]);
  };

  function loadSolved() {
    try {
      const raw = JSON.parse(localStorage.getItem(SOLVED_KEY) || "[]");
      if (!Array.isArray(raw)) return new Set();
      return new Set(raw.filter((id) => typeof id === "string"));
    } catch (err) {
      return new Set();
    }
  }

  function saveSolved() {
    try {
      localStorage.setItem(SOLVED_KEY, JSON.stringify([...state.solved]));
    } catch (err) { /* private mode */ }
  }

  function parsePuzzleFile(text) {
    const out = [];
    for (const line of String(text || "").split("\n")) {
      const s = line.trim();
      if (!s || s.charAt(0) === "#") continue;
      const parts = s.split(/\s+/);
      if (parts.length < 5) continue;
      const moves = parts.slice(4).map((ply) => ply.split("|").map((m) => m.trim()).filter(Boolean));
      if (!moves.length || moves.some((ply) => !ply.length)) continue;
      out.push({ id: s, kfen: parts.slice(0, 4).join(" "), moves });
    }
    return out;
  }

  function currentPuzzle() {
    return puzzleList[state.puzzle.index] || null;
  }

  function setFeedback(text, kind) {
    if (!text) return;
    el.puzzleStatus.textContent = text;
    el.puzzleStatus.classList.toggle("bad", kind === "bad");
  }

  function setHash(hash) {
    const next = hash ? (hash.charAt(0) === "#" ? hash : "#" + hash) : "";
    if ((location.hash || "") === next) return;
    if (!next) {
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    ignoreHash = true;
    location.hash = next;
  }

  function setModeChrome(mode) {
    document.body.dataset.mode = mode;
    el.tabGuide.setAttribute("aria-selected", mode === "guide" ? "true" : "false");
    el.tabPlay.setAttribute("aria-selected", mode === "play" ? "true" : "false");
    el.tabPuzzles.setAttribute("aria-selected", mode === "puzzle" ? "true" : "false");
    el.playPanel.hidden = mode !== "play";
    el.puzzlePanel.hidden = mode !== "puzzle";
    el.guidePanel.hidden = mode !== "guide";
    el.boardWrap.hidden = mode === "guide";
    el.side.hidden = mode === "guide";
    el.evalCol.hidden = mode !== "play";
  }

  function enterGuide() {
    if (state.mode === "guide") return;
    stopAnalysis();
    hideMini();
    if (state.mode === "puzzle") clearTimeout(state.puzzle.timer);
    state.guideFrom = state.mode;
    state.mode = "guide";
    setModeChrome("guide");
    setHash("#how");
  }

  function resumePuzzleView() {
    state.mode = "puzzle";
    setModeChrome("puzzle");
    const i = state.puzzle.index >= 0 ? state.puzzle.index : 0;
    setHash(puzzleList.length ? "#puzzles/" + (i + 1) : "#puzzles");
    if (state.puzzle.phase === "reply") schedulePuzzlePly(420);
  }

  function renderPuzzleProgress() {
    const solved = puzzleList.filter((p) => state.solved.has(p.id)).length;
    el.puzzleTabCount.textContent = puzzleList.length ? (solved + "/" + puzzleList.length) : "";
  }

  function renderPuzzleStatus() {
    if (state.winner === 1) el.puzzleStatus.textContent = "White wins";
    else if (state.winner === 2) el.puzzleStatus.textContent = "Black wins";
    else el.puzzleStatus.textContent = (state.stm === 0 ? "White" : "Black") + " to move";
    el.puzzleStatus.classList.remove("bad");
    const pos = parseKfen(state.kfen);
    el.puzzleCaps.textContent = "Reds — White " + pos.capW + " · Black " + pos.capB;
  }

  function enterPuzzles() {
    if (state.mode === "guide" && state.guideFrom === "puzzle") {
      state.mode = "puzzle";
      setModeChrome("puzzle");
      renderPuzzleProgress();
      return;
    }
    if (state.mode !== "puzzle") {
      stopAnalysis();
      hideMini();
      state.savedPlay = {
        kfen: state.history[state.history.length - 1] || state.kfen,
        history: state.history.slice(),
        moveList: state.moveList.slice(),
        lastMove: state.moveList[state.moveList.length - 1] || "",
        flipped: state.flipped,
      };
      state.mode = "puzzle";
    }
    setModeChrome("puzzle");
    renderPuzzleProgress();
  }

  function enterPlay() {
    if (state.mode === "guide" && state.guideFrom !== "puzzle") {
      state.mode = "play";
      setModeChrome("play");
      setHash("");
      maybeEngineTurn();
      return;
    }
    if (state.mode === "guide") state.mode = "puzzle";
    if (state.mode !== "puzzle") return;
    clearTimeout(state.puzzle.timer);
    state.puzzle.timer = 0;
    state.puzzle.revealing = false;
    state.mode = "play";
    setModeChrome("play");
    setHash("");
    const saved = state.savedPlay;
    if (!saved || !state.ready) return;
    state.history = saved.history.slice();
    state.moveList = saved.moveList.slice();
    state.lastMove = saved.lastMove;
    state.flipped = saved.flipped;
    state.selected = -1;
    state.pv = [];
    state.pendingMove = null;
    state.busy = true;
    state.expectPos = true;
    state.posToken += 1;
    renderPv("");
    renderMoves();
    worker.postMessage({ cmd: "set", kfen: saved.kfen, token: state.posToken });
  }

  function openPuzzle(index) {
    if (!puzzleList.length) return;
    if (state.mode !== "puzzle") enterPuzzles();
    const i = (index + puzzleList.length) % puzzleList.length;
    clearTimeout(state.puzzle.timer);
    state.puzzle.timer = 0;
    state.puzzle.index = i;
    state.puzzle.step = 0;
    state.puzzle.phase = "user";
    state.puzzle.revealing = false;
    const p = puzzleList[i];
    const pos = parseKfen(p.kfen);
    state.flipped = pos.stm === 1;
    state.kfen = p.kfen;
    state.legal = [];
    state.winner = 0;
    state.stm = pos.stm;
    state.selected = -1;
    state.lastMove = "";
    state.history = [p.kfen];
    state.moveList = [];
    setModeChrome("puzzle");
    renderPuzzleProgress();
    renderPuzzleStatus();
    renderMoves();
    setHash("#puzzles/" + (i + 1));
    renderBoard();
    if (!state.ready) return;
    stopAnalysis();
    state.pendingMove = null;
    state.busy = true;
    state.expectPos = true;
    state.posToken += 1;
    worker.postMessage({ cmd: "set", kfen: p.kfen, token: state.posToken });
  }

  function rejectPuzzleMove() {
    setFeedback("Wrong.", "bad");
    el.board.classList.remove("shake");
    void el.board.offsetWidth;
    el.board.classList.add("shake");
  }

  function finishSolved() {
    state.puzzle.revealing = false;
    state.puzzle.phase = "done";
    setFeedback("Solved.", "good");
    const p = currentPuzzle();
    if (p && !state.solved.has(p.id)) {
      state.solved.add(p.id);
      saveSolved();
    }
    renderPuzzleProgress();
    renderPuzzleStatus();
    setFeedback("Solved.");
  }

  function finishShown() {
    state.puzzle.revealing = false;
    state.puzzle.phase = "done";
    setFeedback("");
    renderPuzzleStatus();
  }

  function playNextPuzzlePly() {
    const p = currentPuzzle();
    if (!p || state.puzzle.step >= p.moves.length) {
      if (state.puzzle.revealing) finishShown();
      else finishSolved();
      return;
    }
    playMove(p.moves[state.puzzle.step][0]);
  }

  function schedulePuzzlePly(ms) {
    clearTimeout(state.puzzle.timer);
    const index = state.puzzle.index;
    const step = state.puzzle.step;
    state.puzzle.timer = setTimeout(() => {
      state.puzzle.timer = 0;
      if (state.mode !== "puzzle") return;
      if (state.puzzle.index !== index || state.puzzle.step !== step) return;
      playNextPuzzlePly();
    }, ms);
  }

  function afterPuzzlePos(fromMove, msg) {
    renderPuzzleStatus();
    if (!fromMove) {
      if (msg.ok === false) {
        state.puzzle.revealing = false;
        state.puzzle.phase = "user";
        setFeedback("Illegal.", "bad");
      }
      return;
    }
    const p = currentPuzzle();
    if (!p) return;
    state.puzzle.step += 1;
    if (state.puzzle.step >= p.moves.length) {
      if (state.puzzle.revealing) finishShown();
      else finishSolved();
      return;
    }
    if (state.puzzle.revealing) {
      schedulePuzzlePly(420);
      return;
    }
    if (state.puzzle.phase === "reply") {
      state.puzzle.phase = "user";
      setFeedback("");
      return;
    }
    state.puzzle.phase = "reply";
    setFeedback("");
    schedulePuzzlePly(420);
  }

  function showHint() {
    const p = currentPuzzle();
    if (!p || state.puzzle.phase !== "user") return;
    const mv = (p.moves[state.puzzle.step] || [])[0];
    if (!mv) return;
    state.selected = fromSq(mv);
    renderBoard();
  }

  function showSolution() {
    const p = currentPuzzle();
    if (!p || !state.ready || state.busy) return;
    if (state.puzzle.phase === "done" && state.puzzle.step >= p.moves.length) return;
    clearTimeout(state.puzzle.timer);
    state.puzzle.timer = 0;
    state.puzzle.revealing = true;
    state.puzzle.phase = "reply";
    setFeedback("");
    playNextPuzzlePly();
  }

  function puzzleIndexFromHash(hash) {
    if (!hash.startsWith("#puzzles/")) return state.puzzle.index >= 0 ? state.puzzle.index : 0;
    const n = Number(hash.slice("#puzzles/".length));
    return n >= 1 ? n - 1 : 0;
  }

  function applyHash() {
    const hash = location.hash || "";
    if (hash === "#how") {
      enterGuide();
      return;
    }
    if (hash === "#puzzles" || hash.startsWith("#puzzles/")) {
      const i = puzzleIndexFromHash(hash);
      if (state.mode === "guide" && state.guideFrom === "puzzle" && (hash === "#puzzles" || i === state.puzzle.index)) {
        resumePuzzleView();
        return;
      }
      enterPuzzles();
      if (puzzleList.length) openPuzzle(i);
      else {
        state.puzzle.index = i;
        el.puzzleStatus.textContent = "Loading…";
      }
      return;
    }
    if (state.mode === "puzzle" || state.mode === "guide") enterPlay();
  }

  function loadPuzzleFile() {
    fetch("puzzles.txt?v=4")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((text) => {
        puzzleList = parsePuzzleFile(text);
        renderPuzzleProgress();
        const hash = location.hash || "";
        if (state.mode === "puzzle" || hash === "#puzzles" || hash.startsWith("#puzzles/")) {
          const i = (hash === "#puzzles" || hash.startsWith("#puzzles/"))
            ? puzzleIndexFromHash(hash)
            : (state.puzzle.index >= 0 ? state.puzzle.index : 0);
          if (puzzleList.length) openPuzzle(i);
        }
      })
      .catch(() => {
        if (state.mode === "puzzle") el.puzzleStatus.textContent = "Could not load puzzles.";
      });
  }

  el.tabGuide.onclick = () => enterGuide();
  el.btnGuidePlay.onclick = () => enterPlay();
  el.tabPlay.onclick = () => enterPlay();
  el.tabPuzzles.onclick = () => {
    if (state.mode === "puzzle") return;
    if (state.mode === "guide" && state.guideFrom === "puzzle") {
      resumePuzzleView();
      return;
    }
    enterPuzzles();
    if (puzzleList.length) openPuzzle(state.puzzle.index >= 0 ? state.puzzle.index : 0);
    else el.puzzleStatus.textContent = "Loading…";
  };
  el.btnPuzzleNext.onclick = () => openPuzzle(state.puzzle.index + 1);
  el.btnPuzzleRetry.onclick = () => openPuzzle(state.puzzle.index);
  el.btnPuzzleFlip.onclick = toggleFlip;
  el.btnPuzzleHint.onclick = () => showHint();
  el.btnPuzzleSolution.onclick = () => showSolution();
  window.addEventListener("hashchange", () => {
    if (ignoreHash) {
      ignoreHash = false;
      return;
    }
    applyHash();
  });

  applyHash();
  loadPuzzleFile();
  renderBoard();
  worker.postMessage({
    cmd: "init",
    script: "kahu.js?v=" + ASSET_V,
    nnue: DEFAULT_NNUE,
    base: "./",
    v: ASSET_V,
  });
})();
