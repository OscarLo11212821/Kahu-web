#!/usr/bin/env node
// Smoke-test the WASM engine: load net, start position, legal, eval, short search, preview.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const createKahu = require("./kahu.js");

(async () => {
  const Module = await createKahu();
  const c = (n, r, a) => Module.cwrap(n, r, a);
  const init = c("kahu_init", "number", []);
  const load = c("kahu_load_nnue", "number", ["number", "number"]);
  const kfen = c("kahu_kfen", "string", []);
  const legal = c("kahu_legal", "string", []);
  const evalCp = c("kahu_eval", "number", []);
  const move = c("kahu_move", "number", ["string"]);
  const search = c("kahu_search_ms", "string", ["number"]);
  const preview = c("kahu_preview", "string", ["string", "string"]);
  const winner = c("kahu_winner", "number", []);

  init();
  const buf = fs.readFileSync(path.join(dir, "C16_C12_blind.nnue"));
  const ptr = Module._malloc(buf.length);
  Module.HEAPU8.set(buf, ptr);
  if (!load(ptr, buf.length)) throw new Error("nnue load failed");
  Module._free(ptr);

  const start = kfen();
  if (!start.startsWith("WW3BB/")) throw new Error("bad start kfen: " + start);
  const moves = legal().split(" ").filter(Boolean);
  if (moves.length !== 8) throw new Error("expected 8 legal, got " + moves.length + " " + legal());
  if (!moves.includes("a6E")) throw new Error("missing a6E");
  const ev = evalCp();
  if (!Number.isFinite(ev)) throw new Error("eval");

  if (!move("a6E")) throw new Error("a6E illegal");
  const after = kfen();
  if (after === start) throw new Error("move did not change position");

  const prev = preview(start, "a6E");
  if (prev !== after) throw new Error("preview mismatch " + prev + " vs " + after);

  const raw = search(250);
  if (!raw.startsWith("bestmove ")) throw new Error("search: " + raw);
  if (winner() !== 0) throw new Error("winner at ply 1");

  console.log("ok");
  console.log("start_legal", moves.length);
  console.log("eval", ev);
  console.log("after_a6E", after);
  console.log("search", raw);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
