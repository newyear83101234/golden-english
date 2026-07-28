# -*- coding: utf-8 -*-
"""對副歌剪輯跑 faster-whisper 取逐字時間戳，輸出 raw JSON 供後續對齊歌詞。"""
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    "tools/_src/chorus.mp3",
    language="en",
    word_timestamps=True,
    beam_size=5,
    condition_on_previous_text=False,
)

words = []
for seg in segments:
    for w in seg.words:
        words.append({"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)})

with open("tools/_src/whisper_words.json", "w", encoding="utf-8") as f:
    json.dump(words, f, ensure_ascii=False, indent=1)

for w in words:
    print(f"{w['start']:6.2f} {w['end']:6.2f}  {w['word']}")
