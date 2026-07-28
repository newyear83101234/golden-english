# -*- coding: utf-8 -*-
"""
gen_tts.py — 用 edge-tts 生成單字英文發音（assets/w/<key>.mp3）與中文意思語音（assets/z/<key>.mp3）。
英文：en-US-JennyNeural 放慢 15%（給 4-5 歲小孩聽清楚）；中文：zh-TW-HsiaoChenNeural。
已存在的檔案跳過（可中斷續跑）；每項獨立 try/except。
"""
import asyncio, json, os, io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
import edge_tts

EN_VOICE = "en-US-JennyNeural"
ZH_VOICE = "zh-TW-HsiaoChenNeural"
KO_VOICE = "ko-KR-SunHiNeural"

async def gen(text, voice, rate, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        return "skip"
    await edge_tts.Communicate(text, voice, rate=rate).save(out)
    return "ok"

async def main():
    data = json.load(open("tools/_src/data.json", encoding="utf-8"))
    os.makedirs("assets/w", exist_ok=True)
    os.makedirs("assets/z", exist_ok=True)
    jobs = []
    os.makedirs("assets/s", exist_ok=True)
    for key, v in data["vocab"].items():
        voice = KO_VOICE if v.get("lang") == "ko" else EN_VOICE
        jobs.append((v["say"], voice, "-15%", f"assets/w/{key}.mp3"))
        jobs.append((v["say"], voice, "-45%", f"assets/s/{key}.mp3"))  # 🐢 慢慢唸版
        jobs.append((v["zh"], ZH_VOICE, "-10%", f"assets/z/{key}.mp3"))
    sem = asyncio.Semaphore(4)
    results = {"ok": 0, "skip": 0, "fail": []}
    async def run(j):
        text, voice, rate, out = j
        async with sem:
            try:
                r = await gen(text, voice, rate, out)
                results[r] += 1
            except Exception as e:
                results["fail"].append(f"{out}: {e}")
    await asyncio.gather(*[run(j) for j in jobs])
    print(f"OK 生成 {results['ok']}、跳過 {results['skip']}、失敗 {len(results['fail'])}")
    for f in results["fail"]:
        print("FAIL", f)

if __name__ == "__main__":
    asyncio.run(main())
