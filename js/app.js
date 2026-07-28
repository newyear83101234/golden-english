/**
 * app.js — Golden 唱歌學英文（4-5 歲、iPad Safari 為主要目標）。
 * 音訊全走 Web Audio API：iOS 的自動播放限制只需在密碼門手勢裡 resume 一次，
 * 之後的單字發音、片段重播都不再需要新手勢。
 */
import { decryptSong } from "./song-crypto.js";

const $ = (s) => document.querySelector(s);
const LS_KEY = "golden-learned-v1";

let ctx = null;          // AudioContext
let songBuf = null;      // 整首副歌 AudioBuffer
let voiceBuf = {};       // { "w/key": AudioBuffer, "z/key": AudioBuffer }
let data = null;         // 歌詞 + 單字卡資料
let wordEls = [];        // [{el, s, e, k}] 依時間排序
let lineEls = [];        // [{el, s, e}]

// --- 歌曲播放器（手動記 offset 才能暫停/續播/跳段）---
let srcNode = null, playing = false, offset = 0, ctxStart = 0;
let segNode = null;      // 「歌裡怎麼唱」的片段播放節點
let seqToken = 0;        // 取消過期的語音序列
const learned = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));

const now = () => (playing ? offset + ctx.currentTime - ctxStart : offset);

function play(from = offset) {
  stopSeg();
  if (playing) return;
  offset = Math.max(0, Math.min(from, songBuf.duration - 0.05));
  const node = ctx.createBufferSource();
  node.buffer = songBuf;
  node.connect(ctx.destination);
  // 旗標綁在節點自己身上：快速連點時舊節點的 onended 不會誤傷新節點的狀態
  node.onended = () => {
    if (srcNode !== node || node._manual) return;
    playing = false;
    offset = songBuf.duration;
    onSongEnd();
  };
  srcNode = node;
  node.start(0, offset);
  ctxStart = ctx.currentTime;
  playing = true;
  $("#playBtn").textContent = "❚❚";
  $("#playBtn").classList.add("playing");
  requestAnimationFrame(tick);
}

function pause() {
  if (!playing) return;
  offset = now();
  srcNode._manual = true;
  try { srcNode.stop(); } catch { /* 已停止 */ }
  playing = false;
  $("#playBtn").textContent = "▶";
  $("#playBtn").classList.remove("playing");
}

function stopSeg() {
  if (segNode) { try { segNode.stop(); } catch { } segNode = null; }
}

/** 播一段歌（點「歌裡怎麼唱」用），前後各留一點餘裕 */
function playSegment(s, e) {
  stopSeg();
  segNode = ctx.createBufferSource();
  segNode.buffer = songBuf;
  segNode.connect(ctx.destination);
  const from = Math.max(0, s - 0.12);
  segNode.start(0, from, Math.min(e + 0.3, songBuf.duration) - from);
}

/** 播單字/中文語音；resolve(true)=有播、resolve(false)=該語音缺檔 */
function playVoice(kind, key) {
  return new Promise((res) => {
    const buf = voiceBuf[`${kind}/${key}`];
    if (!buf) { res(false); return; }
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.connect(ctx.destination);
    n.onended = () => res(true);
    n.start();
  });
}

// --- 歌詞渲染 ---
function renderLyrics() {
  const box = $("#lyrics");
  box.innerHTML = "";
  data.lines.forEach((line) => {
    const div = document.createElement("div");
    if (line.ko) {
      div.className = "line line-ko";
      div.innerHTML = `<span class="kotext"></span><span class="kozh"></span>`;
      div.querySelector(".kotext").textContent = line.text;
      div.querySelector(".kozh").textContent = line.zh;
    } else {
      div.className = "line";
      line.words.forEach((w) => {
        const b = document.createElement("button");
        b.className = "w";
        b.textContent = w.t;
        b.dataset.k = w.k;
        if (learned.has(w.k)) b.classList.add("learned");
        b.addEventListener("click", () => openCard(w));
        div.appendChild(b);
        wordEls.push({ el: b, s: w.s, e: w.e, k: w.k });
      });
    }
    box.appendChild(div);
    lineEls.push({ el: div, s: line.s, e: line.e });
  });
}

// --- 亮字循環 ---
let lastLineIdx = -1;
function tick() {
  if (!playing) return;
  const t = now();
  let lineIdx = -1;
  lineEls.forEach((l, i) => {
    const active = t >= l.s - 0.25 && t <= l.e + 0.25;
    l.el.classList.toggle("active", active);
    l.el.classList.toggle("passed", t > l.e + 0.25);
    if (active) lineIdx = i;
  });
  if (lineIdx >= 0 && lineIdx !== lastLineIdx) {
    lastLineIdx = lineIdx;
    lineEls[lineIdx].el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  wordEls.forEach((w) => w.el.classList.toggle("on", t >= w.s && t <= w.e + 0.06));
  requestAnimationFrame(tick);
}

// --- 學習卡 ---
let cardWord = null, resumeAt = 0;

async function openCard(w) {
  pause();
  stopSeg();
  cardWord = w;
  resumeAt = Math.max(0, w.s - 0.8);
  const v = data.vocab[w.k];

  $("#cardWord").textContent = v.display;
  const zhBtn = $("#cardZh");
  zhBtn.innerHTML = "";
  [...v.zh].forEach((ch, i) => {
    const zc = document.createElement("span");
    zc.className = "zc";
    const chSpan = document.createElement("span");
    chSpan.className = "ch";
    chSpan.textContent = ch;
    zc.appendChild(chSpan);
    const zyStr = v.zy[i] || "";
    if (zyStr) {
      const zy = document.createElement("span");
      zy.className = "zy";
      const TONES = "ˊˇˋ˙";
      [...zyStr].forEach((c) => {
        const s = document.createElement(TONES.includes(c) ? "b" : "i");
        if (TONES.includes(c)) s.className = c === "˙" ? "tone tone-top" : "tone";
        s.textContent = c;
        zy.appendChild(s);
      });
      zc.appendChild(zy);
    }
    zhBtn.appendChild(zc);
  });

  // 集星星：第一次點到的新單字
  const isNew = !learned.has(w.k);
  if (isNew) {
    learned.add(w.k);
    localStorage.setItem(LS_KEY, JSON.stringify([...learned]));
    document.querySelectorAll(`.w[data-k="${w.k}"]`).forEach((el) => el.classList.add("learned"));
    updateStars(true);
  }
  $("#cardStar").hidden = !isNew;

  $("#cardWrap").hidden = false;

  // 自動：英文 → 停一下 → 中文
  const token = ++seqToken;
  $("#cardWord").classList.add("speaking");
  const spoke = await playVoice("w", w.k);
  $("#cardWord").classList.remove("speaking");
  // 語音缺檔時給小孩看得懂的提示，不要靜默沒聲音
  document.querySelector(".card-tap-hint").textContent =
    spoke ? "點單字再聽一次 🔊" : "🔇 這個字的聲音沒載到，重新整理網頁再試";
  if (token !== seqToken) return;
  await new Promise((r) => setTimeout(r, 280));
  if (token !== seqToken) return;
  await playVoice("z", w.k);
}

function closeCard(resume) {
  seqToken++;
  stopSeg();
  $("#cardWrap").hidden = true;
  $("#cardWord").classList.remove("speaking");
  if (resume) play(resumeAt);
}

function updateStars(pop) {
  $("#starCount").textContent = learned.size;
  if (pop) {
    const box = $("#starbox");
    box.classList.remove("pop");
    void box.offsetWidth; // 重新觸發動畫
    box.classList.add("pop");
  }
}

// --- 唱完 ---
function onSongEnd() {
  $("#playBtn").textContent = "▶";
  $("#playBtn").classList.remove("playing");
  $("#finStars").textContent = learned.size;
  $("#fin").hidden = false;
}

// --- 載入流程 ---
/** fetch 二進位檔：檢查 HTTP 狀態 + 15 秒逾時（弱網不讓小孩死等） */
function fetchBin(url) {
  const opt = "timeout" in AbortSignal ? { signal: AbortSignal.timeout(15000) } : {};
  return fetch(url, opt).then((r) => {
    if (!r.ok) throw new Error(`NET:${r.status} ${url}`);
    return r.arrayBuffer();
  });
}

async function loadAll(pw) {
  const fill = $("#loadFill");
  let done = 0;
  const total = 2 + 64; // data+song 解密 + 64 個語音
  const step = () => { done++; fill.style.width = `${Math.round((done / total) * 100)}%`; };

  // 1) 解密資料——只有「解密失敗」才是密碼錯，網路失敗要分開講
  const dataRaw = await fetchBin("assets/data.bin");
  let dataPlain;
  try {
    dataPlain = await decryptSong(dataRaw, pw);
  } catch {
    throw new Error("PW_WRONG");
  }
  data = JSON.parse(new TextDecoder().decode(dataPlain));
  step();

  // 密碼對了才切到載入畫面
  $("#gate").hidden = true;
  $("#loading").hidden = false;

  // 2) 解密 + 解碼歌曲（此時密碼已驗證過，這裡失敗一律當載入問題）
  const songRaw = await fetchBin("assets/song.bin");
  const songPlain = await decryptSong(songRaw, pw);
  songBuf = await ctx.decodeAudioData(songPlain);
  step();

  // 3) 單字語音（英文 + 中文），失敗的個別跳過不擋全場
  const keys = Object.keys(data.vocab);
  await Promise.all(
    keys.flatMap((k) => ["w", "z"].map(async (kind) => {
      try {
        const raw = await fetchBin(`assets/${kind}/${k}.mp3`);
        voiceBuf[`${kind}/${k}`] = await ctx.decodeAudioData(raw);
      } catch (e) {
        console.warn(`語音載入失敗 ${kind}/${k}`, e);
      }
      step();
    }))
  );
}

// --- 事件 ---
let submitting = false;
$("#gateForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  if (submitting) return; // 網路慢時小孩連點「進場」不重複載入
  const pw = $("#pw").value.trim();
  if (!pw) return;
  // iOS：必須在使用者手勢裡建立/喚醒 AudioContext
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  $("#gateErr").hidden = true;
  submitting = true;
  try {
    await loadAll(pw);
  } catch (e) {
    console.warn("解鎖失敗", e);
    const isPw = e && e.message === "PW_WRONG";
    $("#gateErr").textContent = isPw
      ? "密碼不對喔，再試一次！"
      : "網路好像怪怪的，檢查一下 WiFi 再按一次進場！";
    const box = document.querySelector(".gate-box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    $("#gateErr").hidden = false;
    if (isPw) $("#pw").value = "";
    $("#loading").hidden = true;
    $("#gate").hidden = false;
    return;
  } finally {
    submitting = false;
  }
  renderLyrics();
  updateStars(false);
  $("#loading").hidden = true;
  $("#stage").hidden = false;
});

// 旋轉/改變視窗大小時，把目前這行重新捲到畫面中間
window.addEventListener("resize", () => {
  if (lastLineIdx >= 0 && !$("#stage").hidden) {
    lineEls[lastLineIdx].el.scrollIntoView({ block: "center" });
  }
});

$("#playBtn").addEventListener("click", () => {
  if (playing) { pause(); return; }
  if (offset >= songBuf.duration - 0.1) offset = 0; // 播完後按 ▶ 從頭
  play();
});

$("#cardWord").addEventListener("click", async () => {
  if (!cardWord) return;
  const token = ++seqToken;
  $("#cardWord").classList.add("speaking");
  await playVoice("w", cardWord.k);
  if (token === seqToken) $("#cardWord").classList.remove("speaking");
});
$("#cardZh").addEventListener("click", () => { seqToken++; playVoice("z", cardWord.k); });
$("#btnSung").addEventListener("click", () => { seqToken++; playSegment(cardWord.s, cardWord.e); });
$("#btnResume").addEventListener("click", () => closeCard(true));
$("#cardBackdrop").addEventListener("click", () => closeCard(false));

$("#btnAgain").addEventListener("click", () => {
  $("#fin").hidden = true;
  lastLineIdx = -1;
  play(0);
});
