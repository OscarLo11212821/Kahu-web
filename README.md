# Kahu

Play **Kuba** in the browser against **Kahu**, a WebAssembly build of the engine with the `C16_C12_blind` network.

This folder is a static site. The page, the engine (`kahu.wasm`), and the network (`C16_C12_blind.nnue`) are all ordinary files. Any static host can serve them; nothing needs to run on a server.

## Play

The published site is [https://oscarlo11212821.github.io/Kahu-web/](https://oscarlo11212821.github.io/Kahu-web/).

Locally:

```bash
python3 -m http.server -d . 8765
```

Then open `http://127.0.0.1:8765/`. Workers and WebAssembly are blocked from `file://`, so use a static server.

## Files

| File | Role |
|---|---|
| `index.html`, `style.css`, `app.js`, `worker.js` | Board, play, and puzzles |
| `kahu.js`, `kahu.wasm` | Engine |
| `C16_C12_blind.nnue` | Network loaded at startup |
| `puzzles.txt` | Tactical positions |

The settings menu can replace the network with another `.nnue` file in the browser. That file stays on the machine; it is not uploaded.

## Rebuild the engine

Emscripten (`em++`) and a C++20 compiler:

```bash
./scripts/build.sh
node verify.mjs
```

`verify.mjs` loads the network, checks the starting position, and runs a short search.

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
