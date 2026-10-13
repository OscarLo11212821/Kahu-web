/* Kahu WASM worker. Messages: init, set, legal, move, eval, winner, search, preview, stop */
let Module = null;
let ready = false;
let halt = false;

function wrap() {
  const c = (name, ret, args) => Module.cwrap(name, ret, args);
  return {
    init: c("kahu_init", "number", []),
    loadNnue: c("kahu_load_nnue", "number", ["number", "number"]),
    reset: c("kahu_reset", null, []),
    setKfen: c("kahu_set_kfen", "number", ["string"]),
    kfen: c("kahu_kfen", "string", []),
    legal: c("kahu_legal", "string", []),
    move: c("kahu_move", "number", ["string"]),
    eval: c("kahu_eval", "number", []),
    winner: c("kahu_winner", "number", []),
    stm: c("kahu_stm", "number", []),
    stop: c("kahu_stop", null, []),
    searchMs: c("kahu_search_ms", "string", ["number"]),
    searchBegin: c("kahu_search_begin", null, []),
    searchPly: c("kahu_search_ply", "string", ["number"]),
    preview: c("kahu_preview", "string", ["string", "string"]),
    clearTt: c("kahu_clear_tt", null, []),
  };
}

let api = null;

function snapshot() {
  const legal = api.legal() || "";
  return {
    kfen: api.kfen(),
    legal: legal ? legal.split(" ").filter(Boolean) : [],
    eval: api.eval(),
    winner: api.winner(),
    stm: api.stm(),
  };
}

function yieldTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.cmd === "init") {
      importScripts(msg.script || "kahu.js");
      Module = await createKahu({
        locateFile: (f) => (msg.base || "./") + f + (msg.v ? "?v=" + msg.v : ""),
      });
      Module.onInfo = (depth, score, elapsed, nodes, pv) => {
        postMessage({ type: "info", depth, score, elapsed, nodes, pv });
      };
      api = wrap();
      api.init();
      const res = await fetch(msg.nnue || "C16_C12_blind.nnue");
      const buf = new Uint8Array(await res.arrayBuffer());
      const ptr = Module._malloc(buf.length);
      Module.HEAPU8.set(buf, ptr);
      const ok = api.loadNnue(ptr, buf.length);
      Module._free(ptr);
      if (!ok) throw new Error("NNUE load failed");
      ready = true;
      postMessage({ type: "ready", ...snapshot() });
      return;
    }

    if (!ready) {
      postMessage({ type: "error", error: "engine not ready" });
      return;
    }

    if (msg.cmd === "stop") {
      halt = true;
      api.stop();
      return;
    }

    if (msg.cmd === "set") {
      halt = true;
      api.stop();
      api.setKfen(msg.kfen);
      postMessage({ type: "pos", token: msg.token, ...snapshot() });
    } else if (msg.cmd === "reset") {
      halt = true;
      api.stop();
      api.reset();
      postMessage({ type: "pos", token: msg.token, ...snapshot() });
    } else if (msg.cmd === "move") {
      const ok = api.move(msg.move);
      postMessage({ type: "pos", ok, token: msg.token, ...snapshot() });
    } else if (msg.cmd === "eval") {
      postMessage({ type: "eval", eval: api.eval(), ...snapshot() });
    } else if (msg.cmd === "search") {
      halt = false;
      const endless = !!(msg.endless || msg.ms === 0);
      if (endless) {
        api.searchBegin();
        let raw = "bestmove 000";
        for (let d = 1; d <= 120 && !halt; d++) {
          raw = api.searchPly(d);
          if (halt) break;
          await yieldTick();
        }
        postMessage({ type: "search", raw, gen: msg.gen, endless: true, done: true, ...snapshot() });
      } else {
        const raw = api.searchMs(msg.ms || 1000);
        postMessage({ type: "search", raw, gen: msg.gen, ...snapshot() });
      }
    } else if (msg.cmd === "preview") {
      const kfen = api.preview(msg.kfen, msg.moves || "");
      postMessage({ type: "preview", kfen, id: msg.id });
    } else if (msg.cmd === "line") {
      halt = true;
      api.stop();
      const toks = (msg.moves || "").trim().split(/\s+/).filter(Boolean);
      const applied = [];
      for (const tok of toks) {
        if (!api.move(tok)) break;
        applied.push({ move: tok, kfen: api.kfen() });
      }
      postMessage({ type: "line", applied, token: msg.token, ...snapshot() });
    } else if (msg.cmd === "loadNnue") {
      halt = true;
      api.stop();
      const raw = msg.buf;
      const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      const ptr = Module._malloc(buf.length);
      Module.HEAPU8.set(buf, ptr);
      const ok = api.loadNnue(ptr, buf.length);
      Module._free(ptr);
      if (!ok) {
        postMessage({ type: "nnue", ok: false, error: "Engine rejected this file" });
        return;
      }
      postMessage({ type: "nnue", ok: true, name: msg.name || "nnue", ...snapshot() });
    } else if (msg.cmd === "clearTt") {
      api.clearTt();
    }
  } catch (err) {
    postMessage({ type: "error", error: String(err && err.message ? err.message : err) });
  }
};
