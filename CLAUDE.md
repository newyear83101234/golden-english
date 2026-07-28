# Golden 唱歌學英文

給阿葉 4-5 歲小孩在 iPad Safari 玩的互動學英文網頁。獨立於 GAME DIY（非體感遊戲）。

- **線上版**：https://newyear83101234.github.io/golden-english/ （GitHub Pages，master push 即自動部署，等 1-2 分鐘）
- **通關密碼**：000（同 GAME DIY 第四遊戲；保護版權歌曲不公開裸奔）
- **repo**：newyear83101234/golden-english（public）

## 功能（2026-07-28 MVP＝副歌 31 秒）

Golden（HUNTR/X）副歌逐字同步亮字 → 點任何英文單字：歌暫停＋彈學習卡（英文 TTS 發音 → 中文意思語音；注音直排在國字右側、台灣課本格式、標本調）→「歌裡怎麼唱」重播該字歌曲片段 →「繼續唱歌」從該字前 0.8 秒續播。新單字集星星（localStorage）。韓文行灰色不可點。

## 架構

- 純前端無框架：`index.html` + `css/style.css` + `js/app.js`（ES module）
- 音訊全走 Web Audio API（iOS 只需密碼門手勢 resume 一次 AudioContext，之後所有發音免手勢）
- `js/song-crypto.js`：AES-256-GCM＋PBKDF2 解密（與 GAME DIY 完全同格式）
- `assets/song.bin`＝加密副歌、`assets/data.bin`＝加密歌詞+時間軸+單字卡、`assets/w|z/*.mp3`＝單字英/中 TTS（明文，無版權疑慮）

## 素材管線（改資料時照順序跑）

1. `tools/align_words.py` — faster-whisper 對 `tools/_src/chorus.mp3` 取逐字時間戳
2. `tools/build_data.py` — 歌詞時間軸＋單字翻譯注音表（都在此檔手寫）→ `tools/_src/data.json`
3. `tools/gen_tts.py` — edge-tts 生成單字語音（en-US-Jenny -15%、zh-TW-HsiaoChen -10%）
4. `SONG_PW=000 python tools/encrypt_asset.py <src> <out.bin>` — 加密

## 關鍵事實與坑

- `tools/_src/` 不進 git（原曲、明文歌詞）。原曲來源：GAME DIY `tools/_src_song/GOLDEN.mp3`（198.8s 版）
- **本地 mp3 比 lrclib 網路歌詞時間軸慢約 3 秒**（版本剪輯不同）——時間戳一律以 whisper 在本地音檔的輸出為準，不可直接用 LRC 時間
- 副歌剪輯範圍＝原曲 49.4s–80.25s（頭尾有 fade）
- CSS 有 `[hidden]{display:none!important}`——screen 類用 flex，沒這行 hidden 會失效（踩過）
- 注音慣例：標本調（不＝ㄅㄨˋ、一＝ㄧ）、輕聲 ˙ 排注音欄頂端；「成為」的為＝ㄨㄟˊ（台灣讀音，pypinyin 會給錯）

## 待辦（第二期，小孩驗證買單後）

- 全曲版（管線同上，工作量主要在 build_data.py 的全曲時間軸＋約 100 個新單字卡）
- 段落選擇、星星獎勵擴充
