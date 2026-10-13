// Browser glue for Kahu. Compiled with Emscripten; not used in the native engine.
#include "engine.h"
#include "nnue.h"
#include "position.h"
#include "types.h"
#include "zobrist.h"

#include <cstdint>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#endif

namespace {

Position g_pos;
std::unique_ptr<Engine> g_engine;
std::string g_buf;

const char* cstr(std::string s) {
    g_buf = std::move(s);
    return g_buf.c_str();
}

#ifdef __EMSCRIPTEN__
EM_JS(void, kahu_js_info, (int depth, int score, int elapsed, int nodes_lo, int nodes_hi, const char* pv), {
    const pvStr = UTF8ToString(pv);
    const nodes = nodes_lo + nodes_hi * 4294967296;
    if (typeof Module.onInfo === "function") {
        Module.onInfo(depth, score, elapsed, nodes, pvStr);
    }
});
#endif

void info_bridge(int depth, int score, int elapsed, uint64_t nodes, const char* pv) {
#ifdef __EMSCRIPTEN__
    kahu_js_info(depth, score, elapsed, (int)(nodes & 0xffffffffu), (int)(nodes >> 32), pv);
#else
    (void)depth; (void)score; (void)elapsed; (void)nodes; (void)pv;
#endif
}

} // namespace

extern "C" {

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_init(void) {
    Zobrist::init();
    g_engine = std::make_unique<Engine>();
    g_pos.set_initial_state();
    engine_set_info_callback(info_bridge);
    return 1;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_load_nnue(const uint8_t* data, int size) {
    if (!nnue_load_memory(data, static_cast<size_t>(size))) return 0;
    if (g_engine) g_engine->clear_tt();
    return 1;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
void kahu_reset(void) {
    if (g_engine) g_engine->stop();
    g_pos.set_initial_state();
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_set_kfen(const char* kfen) {
    if (!kfen) return 0;
    g_pos.set_from_kfen(kfen);
    return 1;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
const char* kahu_kfen(void) {
    return cstr(g_pos.to_kfen());
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
const char* kahu_legal(void) {
    std::ostringstream os;
    auto moves = g_pos.generate_legal_moves();
    bool first = true;
    for (const Move& m : moves) {
        if (!first) os << ' ';
        first = false;
        os << move_to_string(m);
    }
    return cstr(os.str());
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_move(const char* move) {
    if (!move) return 0;
    Move m = string_to_move(move);
    if (m.sq == 255) return 0;
    return g_pos.do_move(m.sq, m.dir) ? 1 : 0;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_eval(void) {
    return nnue_evaluate(g_pos);
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_winner(void) {
    Color w = g_pos.get_winner();
    if (w == WHITE) return 1;
    if (w == BLACK) return 2;
    return 0;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
int kahu_stm(void) {
    return g_pos.side_to_move == WHITE ? 0 : 1;
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
void kahu_stop(void) {
    if (g_engine) g_engine->stop();
}

const char* format_search(const SearchResult& r) {
    std::ostringstream os;
    os << "bestmove " << move_to_string(r.move)
       << " score " << r.score
       << " depth " << r.depth
       << " nodes " << r.nodes;
    return cstr(os.str());
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
const char* kahu_search_ms(int millis) {
    if (!g_engine) return cstr("bestmove 000");
    if (g_pos.generate_legal_moves().empty()) return cstr("bestmove 000");
    return format_search(g_engine->search_time_ex(g_pos, millis, false));
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
void kahu_search_begin(void) {
    if (g_engine) g_engine->search_begin();
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
const char* kahu_search_ply(int depth) {
    if (!g_engine) return cstr("bestmove 000");
    if (g_pos.generate_legal_moves().empty()) return cstr("bestmove 000");
    return format_search(g_engine->search_one_depth(g_pos, depth, false));
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
const char* kahu_preview(const char* kfen, const char* moves) {
    Position p;
    p.set_from_kfen(kfen ? kfen : g_pos.to_kfen());
    if (moves && *moves) {
        std::istringstream iss(moves);
        std::string tok;
        while (iss >> tok) {
            Move m = string_to_move(tok);
            if (m.sq == 255) break;
            if (!p.do_move(m.sq, m.dir)) break;
        }
    }
    return cstr(p.to_kfen());
}

#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE
#endif
void kahu_clear_tt(void) {
    if (g_engine) g_engine->clear_tt();
}

} // extern "C"
