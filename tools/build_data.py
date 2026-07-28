# -*- coding: utf-8 -*-
"""
build_data.py — 產生 data.json（歌詞逐字時間軸 + 單字學習卡資料）。
時間戳來源：faster-whisper 在本地 chorus.mp3 上的逐字辨識（tools/align_words.py），
文字以正確歌詞為準、只取 whisper 的時間。輸出到 tools/_src/data.json（之後加密成 assets/data.bin）。
注音採台灣國語課本慣例：標本調（不、一 不標變調），輕聲用 ˙。
"""
import json, os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# ---- 單字卡：key -> (顯示原形, TTS唸法, 中文意思, 注音[逐字], 備註) ----
# 歌詞縮寫形（hidin'）顯示原樣，但發音教標準形（hiding）。
VOCAB = {
    "im":       ("I'm",      "I'm",      "我是",   ["ㄨㄛˇ", "ㄕˋ"]),
    "done":     ("done",     "done",     "不做了", ["ㄅㄨˋ", "ㄗㄨㄛˋ", "ㄌㄜ˙"]),
    "hiding":   ("hidin'",   "hiding",   "躲起來", ["ㄉㄨㄛˇ", "ㄑㄧˇ", "ㄌㄞˊ"]),
    "now":      ("now",      "now",      "現在",   ["ㄒㄧㄢˋ", "ㄗㄞˋ"]),
    "shining":  ("shinin'",  "shining",  "發光",   ["ㄈㄚ", "ㄍㄨㄤ"]),
    "like":     ("like",     "like",     "像",     ["ㄒㄧㄤˋ"]),
    "born":     ("born",     "born",     "出生",   ["ㄔㄨ", "ㄕㄥ"]),
    "to":       ("to",       "to",       "去",     ["ㄑㄩˋ"]),
    "be":       ("be",       "be",       "成為",   ["ㄔㄥˊ", "ㄨㄟˊ"]),
    "we":       ("we",       "we",       "我們",   ["ㄨㄛˇ", "ㄇㄣ˙"]),
    "dreaming": ("dreamin'", "dreaming", "做夢",   ["ㄗㄨㄛˋ", "ㄇㄥˋ"]),
    "hard":     ("hard",     "hard",     "很努力", ["ㄏㄣˇ", "ㄋㄨˇ", "ㄌㄧˋ"]),
    "came":     ("came",     "came",     "來了",   ["ㄌㄞˊ", "ㄌㄜ˙"]),
    "so":       ("so",       "so",       "這麼",   ["ㄓㄜˋ", "ㄇㄜ˙"]),
    "far":      ("far",      "far",      "遠",     ["ㄩㄢˇ"]),
    "i":        ("I",        "I",        "我",     ["ㄨㄛˇ"]),
    "believe":  ("believe",  "believe",  "相信",   ["ㄒㄧㄤ", "ㄒㄧㄣˋ"]),
    "were":     ("we're",    "we're",    "我們是", ["ㄨㄛˇ", "ㄇㄣ˙", "ㄕˋ"]),
    "going":    ("goin'",    "going",    "走",     ["ㄗㄡˇ"]),
    "up":       ("up",       "up",       "向上",   ["ㄒㄧㄤˋ", "ㄕㄤˋ"]),
    "its":      ("it's",     "it's",     "這是",   ["ㄓㄜˋ", "ㄕˋ"]),
    "our":      ("our",      "our",      "我們的", ["ㄨㄛˇ", "ㄇㄣ˙", "ㄉㄜ˙"]),
    "moment":   ("moment",   "moment",   "時刻",   ["ㄕˊ", "ㄎㄜˋ"]),
    "you":      ("you",      "you",      "你",     ["ㄋㄧˇ"]),
    "know":     ("know",     "know",     "知道",   ["ㄓ", "ㄉㄠˋ"]),
    "together": ("together", "together", "一起",   ["ㄧ", "ㄑㄧˇ"]),
    "glowing":  ("glowin'",  "glowing",  "發亮",   ["ㄈㄚ", "ㄌㄧㄤˋ"]),
    "gonna":    ("gonna",    "gonna",    "將要",   ["ㄐㄧㄤ", "ㄧㄠˋ"]),
    "golden":   ("golden",   "golden",   "金色的", ["ㄐㄧㄣ", "ㄙㄜˋ", "ㄉㄜ˙"]),
    "oh":       ("Oh-oh-oh", "oh",       "喔",     ["ㄛ"]),
    "with":     ("with",     "with",     "用",     ["ㄩㄥˋ"]),
    "voices":   ("voices",   "voices",   "聲音",   ["ㄕㄥ", "ㄧㄣ"]),
}

# ---- 逐字時間軸：(key, 顯示文字, start, end)；顯示文字保留歌詞原樣與標點 ----
W = lambda k, t, s, e: {"k": k, "t": t, "s": s, "e": e}
LINES = [
    {"words": [
        W("im", "I'm", 0.84, 1.30), W("done", "done", 1.30, 1.60), W("hiding", "hidin',", 1.60, 2.60),
        W("now", "now", 2.84, 3.22), W("im", "I'm", 3.22, 3.66), W("shining", "shinin'", 3.66, 4.24),
        W("like", "like", 4.24, 5.14), W("im", "I'm", 5.14, 5.68), W("born", "born", 5.68, 6.28),
        W("to", "to", 6.28, 6.52), W("be", "be", 6.52, 6.90),
    ]},
    {"words": [
        W("we", "We", 8.02, 8.78), W("dreaming", "dreamin'", 8.78, 9.60), W("hard", "hard,", 9.66, 10.06),
        W("we", "we", 10.18, 10.42), W("came", "came", 10.42, 10.94), W("so", "so", 10.94, 11.36),
        W("far", "far,", 11.36, 11.94), W("now", "now", 11.94, 12.42), W("i", "I", 12.56, 12.92),
        W("believe", "believe", 12.92, 13.75),
    ]},
    {"words": [
        W("were", "We're", 15.08, 15.84), W("going", "goin'", 15.84, 16.40), W("up", "up,", 16.50, 16.80),
        W("up", "up,", 17.04, 17.26), W("up", "up,", 17.26, 17.66), W("its", "it's", 17.66, 18.02),
        W("our", "our", 18.02, 18.24), W("moment", "moment", 18.24, 18.94),
    ]},
    {"words": [
        W("you", "You", 18.94, 19.52), W("know", "know", 19.52, 19.68), W("together", "together", 19.68, 19.94),
        W("were", "we're", 19.94, 20.32), W("glowing", "glowin'", 20.32, 21.26),
    ]},
    {"words": [
        W("gonna", "Gonna", 21.26, 21.52), W("be", "be,", 21.52, 21.80), W("gonna", "gonna", 21.84, 21.96),
        W("be", "be", 21.96, 22.26), W("golden", "golden", 22.26, 23.10),
    ]},
    {"words": [
        W("oh", "Oh-oh-oh,", 23.28, 24.30), W("up", "up,", 24.34, 24.86), W("up", "up,", 25.00, 25.38),
        W("up", "up", 25.46, 25.66), W("with", "with", 25.66, 25.78), W("our", "our", 25.78, 26.06),
        W("voices", "voices", 26.06, 26.76),
    ]},
    {"ko": True, "text": "영원히 깨질 수 없는", "zh": "（韓文）永遠不會破碎", "s": 26.76, "e": 28.70},
    {"words": [
        W("gonna", "Gonna", 28.70, 29.32), W("be", "be,", 29.32, 29.58), W("gonna", "gonna", 29.64, 29.80),
        W("be", "be", 29.80, 30.08), W("golden", "golden", 30.10, 31.30),
    ]},
]

def main():
    # 驗證：每個 key 都在 VOCAB、時間單調遞增
    last = 0.0
    for li, line in enumerate(LINES):
        if line.get("ko"):
            assert line["s"] >= last - 0.01, f"line{li} 時間倒退"
            last = line["e"]; continue
        for w in line["words"]:
            assert w["k"] in VOCAB, f"缺單字卡：{w['k']}"
            assert w["s"] < w["e"], f"{w['t']} 起訖顛倒"
            assert w["s"] >= last - 0.6, f"{w['t']} 時間大幅倒退 {w['s']} < {last}"
            last = max(last, w["e"])
        line["s"] = line["words"][0]["s"]
        line["e"] = line["words"][-1]["e"]

    vocab = {k: {"display": v[0], "say": v[1], "zh": v[2], "zy": v[3]} for k, v in VOCAB.items()}
    data = {"title": "Golden", "artist": "HUNTR/X", "duration": 30.85, "lines": LINES, "vocab": vocab}
    os.makedirs("tools/_src", exist_ok=True)
    with open("tools/_src/data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    used = {w["k"] for l in LINES if not l.get("ko") for w in l["words"]}
    print(f"OK data.json：{len(LINES)} 行、{sum(len(l.get('words',[])) for l in LINES)} 字、{len(used)} 個單字卡（VOCAB {len(vocab)} 項，未用到：{set(vocab)-used or '無'}）")

if __name__ == "__main__":
    main()
