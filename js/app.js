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
let srcNode = null, playing = false, offset = 0, ctxStart = 0, manualStop = false;
let segNode = null;      // 「歌裡怎麼唱」的片段播放節點
let seqToken = 0;        // 取消過期的語音序列
const learned = new Set(JSON.parse(localStorage.getItem(LS_KEY) || "[]"));

const now = () => (playing ? offset + ctx.currentTime - ctxStart : offset);

function play(from = offset) {
  stopSeg();
  if (playing) return;
  offset = Math.max(0, Math.min(from, songBuf.duration - 0.05));
  srcNode = ctx.createBufferSource();
  srcNode.buffer = songBuf;
  srcNode.connect(ctx.destination);
  srcNode.onended = () => {
    if (manualStop) { manualStop = false; return; }
    playing = false;
    offset = songBuf.duration;
    onSongEnd();
  };
  srcNode.start(0, offset);
  ctxStart = ctx.currentTime;
  playing = true;
  $("#playBtn").textContent = "❚❚";
  $("#playBtn").classList.add("playing");
  requestAnimationFrame(tick);
}

function pause() {
  if (!playing) return;
  offset = now();
  manualStop = true;
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

/** 播單字/中文語音，回傳 Promise（播完 resolve；被新序列取代則不 resolve 也無妨） */
function playVoice(kind, key) {
  return new Promise((res) => {
    const buf = voiceBuf[`${kind}/${key}`];
    if (!buf) { res(); return; }
    const n = ctx.createBufferSource();
    n.buffer = buf;
    n.connect(ctx.destination);
    n.onended = res;
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
  await playVoice("w", w.k);
  $("#cardWord").classList.remove("speaking");
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
async function loadAll(pw) {
  const fill = $("#loadFill");
  let done = 0;
  const total = 2 + 64; // data+song 解密 + 64 個語音
  const step = () => { done++; fill.style.width = `${Math.round((done / total) * 100)}%`; };

  // 1) 解密資料（同時就是密碼驗證，失敗會 throw）
  const dataRaw = await fetch("assets/data.bin").then((r) => r.arrayBuffer());
  const dataPlain = await decryptSong(dataRaw, pw);
  data = JSON.parse(new TextDecoder().decode(dataPlain));
  step();

  // 密碼對了才切到載入畫面
  $("#gate").hidden = true;
  $("#loading").hidden = false;

  // 2) 解密 + 解碼歌曲
  const songRaw = await fetch("assets/song.bin").then((r) => r.arrayBuffer());
  const songPlain = await decryptSong(songRaw, pw);
  songBuf = await ctx.decodeAudioData(songPlain);
  step();

  // 3) 單字語音（英文 + 中文），失敗的個別跳過不擋全場
  const keys = Object.keys(data.vocab);
  await Promise.all(
    keys.flatMap((k) => ["w", "z"].map(async (kind) => {
      try {
        const raw = await fetch(`assets/${kind}/${k}.mp3`).then((r) => {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        });
        voiceBuf[`${kind}/${k}`] = await ctx.decodeAudioData(raw);
      } catch (e) {
        console.warn(`語音載入失敗 ${kind}/${k}`, e);
      }
      step();
    }))
  );
}

// --- 事件 ---
$("#gateForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const pw = $("#pw").value.trim();
  if (!pw) return;
  // iOS：必須在使用者手勢裡建立/喚醒 AudioContext
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  $("#gateErr").hidden = true;
  try {
    await loadAll(pw);
  } catch (e) {
    console.warn("解鎖失敗", e);
    const box = document.querySelector(".gate-box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    $("#gateErr").hidden = false;
    $("#pw").value = "";
    $("#loading").hidden = true;
    $("#gate").hidden = false;
    return;
  }
  renderLyrics();
  updateStars(false);
  $("#loading").hidden = true;
  $("#stage").hidden = false;
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
