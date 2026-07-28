# Golden 唱歌學英文

給小小孩的互動學英文網頁：Golden（HUNTR/X）副歌逐字同步亮字，點單字暫停並教發音、中文意思與注音。

- 歌曲與歌詞資料以 AES-256-GCM 加密（`assets/*.bin`），需通關密碼才能播放。
- 原始音檔與明文資料在 `tools/_src/`，不進 git。
- 素材管線：`tools/align_words.py`（逐字時間戳）→ `tools/build_data.py` → `tools/gen_tts.py` → `tools/encrypt_asset.py`。
