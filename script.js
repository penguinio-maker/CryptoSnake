import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { ReCaptchaV3Provider, initializeAppCheck } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app-check.js";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const firebaseConfig = window.__FIREBASE_CONFIG__;
if (!firebaseConfig) {
  throw new Error("Missing Firebase config. Define window.__FIREBASE_CONFIG__ in firebase-config.js");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const appCheckSiteKey = window.__FIREBASE_APPCHECK_SITE_KEY || "";
if (appCheckSiteKey) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

console.log("Firebase connected");

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const gameWrap = document.querySelector(".game-wrap");
const gameZoomBtn = document.getElementById("gameZoomBtn");

const startBtn = document.getElementById("startBtn");
const layoutToggleBtn = document.getElementById("layoutToggleBtn");
const playerNameInput = document.getElementById("playerName");
const resetNicknameBtn = document.getElementById("resetNicknameBtn");
const snakeColorInput = document.getElementById("snakeColor");
const colorPicker = document.getElementById("colorPicker");
const customColorBtn = document.getElementById("customColorBtn");
const colorModalBackdrop = document.getElementById("colorModalBackdrop");
const colorPreview = document.getElementById("colorPreview");
const colorValue = document.getElementById("colorValue");
const hueRange = document.getElementById("hueRange");
const satRange = document.getElementById("satRange");
const lightRange = document.getElementById("lightRange");
const audioToggleBtn = document.getElementById("audioToggleBtn");
const volumeSlider = document.getElementById("volumeSlider");
const cancelColorBtn = document.getElementById("cancelColorBtn");
const applyColorBtn = document.getElementById("applyColorBtn");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const playerViewEl = document.getElementById("playerView");
const overlay = document.getElementById("overlay");
const leaderboardBody = document.getElementById("leaderboardBody");
const playerRankInfo = document.getElementById("playerRankInfo");
const mobileStartBtn = document.getElementById("mobileStartBtn");
const joyUpBtn = document.getElementById("joyUpBtn");
const joyDownBtn = document.getElementById("joyDownBtn");
const joyLeftBtn = document.getElementById("joyLeftBtn");
const joyRightBtn = document.getElementById("joyRightBtn");
const toggleFullLeaderboardBtn = document.getElementById("toggleFullLeaderboardBtn");
const fullLeaderboardModalBackdrop = document.getElementById("fullLeaderboardModalBackdrop");
const closeFullLeaderboardBtn = document.getElementById("closeFullLeaderboardBtn");
const fullLeaderboardSearch = document.getElementById("fullLeaderboardSearch");
const fullLeaderboardList = document.getElementById("fullLeaderboardList");
const nicknameError = document.getElementById("nicknameError");

const GRID = 20;
const TILE = canvas.width / GRID;
const SPEED = 8;

const COINS = [
  { symbol: "BTC", color: "#f7931a", points: 5 },
  { symbol: "ETH", color: "#8c8c8c", points: 4 },
  { symbol: "SOL", color: "#67f9c3", points: 3 }
];

let snake;
let direction;
let pendingDirection;
let coin;
let score;
let highScore = Number(localStorage.getItem("cryptoSnakeHighScore") || 0);
let playing = false;
let loopId;
let draftColor = snakeColorInput.value;
let colorBeforeModal = snakeColorInput.value;
let musicStarted = false;
let musicIntervalId = null;
let gameOverMusicTimerId = null;
let audioCtx;
let musicMasterGain;
let gameOverMasterGain;
const MUSIC_LOOP_DURATION = 16;
let currentVolume = Number(volumeSlider.value) / 100;
let isMuted = false;
let isFullLeaderboardOpen = false;
let fullLeaderboardData = [];
const PLAYER_NAME_KEY = "cryptoSnakePlayerName";
const LAYOUT_MODE_KEY = "cryptoSnakeLayoutMode";
const SWIPE_MIN_DISTANCE = 28;
let currentUserUid = null;
const authReadyPromise = new Promise((resolve) => {
  let done = false;
  let unsub = () => {};
  const finish = (user) => {
    if (done) return;
    done = true;
    resolve(user);
  };

  unsub = onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUserUid = user.uid;
      finish(user);
      unsub();
      return;
    }

    try {
      const cred = await signInAnonymously(auth);
      currentUserUid = cred.user ? cred.user.uid : null;
      finish(cred.user || null);
    } catch (error) {
      console.error("Anonymous auth failed:", error);
      finish(null);
    } finally {
      unsub();
    }
  });
});

highScoreEl.textContent = highScore;

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function isMobileGameplayMode() {
  return document.body.classList.contains("mobile-layout") || window.matchMedia("(max-width: 950px), (pointer: coarse)").matches;
}

function setPendingDirection(nextX, nextY) {
  if (!playing) return;
  if (nextX === 0 && nextY === -1 && direction.y === 1) return;
  if (nextX === 0 && nextY === 1 && direction.y === -1) return;
  if (nextX === -1 && nextY === 0 && direction.x === 1) return;
  if (nextX === 1 && nextY === 0 && direction.x === -1) return;
  pendingDirection = { x: nextX, y: nextY };
}

function syncLayoutButtonText() {
  const mobileActive = document.body.classList.contains("mobile-layout");
  layoutToggleBtn.textContent = mobileActive ? "Switch to Desktop Layout" : "Switch to Mobile Layout";
}

function applySavedLayoutMode() {
  const savedMode = localStorage.getItem(LAYOUT_MODE_KEY);
  if (savedMode === "mobile") {
    document.body.classList.add("mobile-layout");
  } else {
    document.body.classList.remove("mobile-layout");
  }
  syncLayoutButtonText();
}

function lockNicknameInput() {
  playerNameInput.readOnly = true;
}

function unlockNicknameInput() {
  playerNameInput.readOnly = false;
}

function normalizeNickname(nick) {
  return (nick || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 _-]/g, "")
    .replace(/\s/g, "_")
    .slice(0, 24);
}

async function checkNicknameAvailability(name) {
  await authReadyPromise;
  const normalized = normalizeNickname(name);
  if (!normalized) {
    return { available: false, normalized };
  }

  try {
    const q = query(collection(db, "leaderboard"), where("normalizedNickname", "==", normalized), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return { available: true, normalized };
    }
    const takenDoc = snapshot.docs[0];
    return { available: takenDoc.id === currentUserUid, normalized };
  } catch (error) {
    console.error("Nickname check failed:", error);
    return { available: false, normalized };
  }
}

async function reserveNickname(name, normalized) {
  const safeName = (name || "").trim();
  if (!safeName || !normalized) return false;

  try {
    localStorage.setItem(PLAYER_NAME_KEY, safeName);
    lockNicknameInput();
    return true;
  } catch (error) {
    console.error("Nickname reserve failed:", error);
    return false;
  }
}

function getPlayerName() {
  const typed = playerNameInput.value.trim();
  if (typed) return typed;
  const saved = localStorage.getItem(PLAYER_NAME_KEY);
  return (saved && saved.trim()) || "Guest";
}

function initPlayerProfile() {
  const saved = localStorage.getItem(PLAYER_NAME_KEY);
  if (saved && saved.trim()) {
    playerNameInput.value = saved.trim();
    lockNicknameInput();
  } else {
    unlockNicknameInput();
  }
  setPlayerView();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderFullLeaderboard(filterValue = "") {
  if (!fullLeaderboardList) return;
  const term = (filterValue || "").trim().toLowerCase();
  const rows = fullLeaderboardData.filter((row) => row.nickname.toLowerCase().includes(term));

  if (!rows.length) {
    fullLeaderboardList.innerHTML = `<div class="full-leaderboard-empty">No matching players</div>`;
    return;
  }

  fullLeaderboardList.innerHTML = rows
    .map((row) => `<div class="full-leaderboard-row"><span>#${row.rank}</span><span>${escapeHtml(row.nickname)}</span><span>${row.score}</span></div>`)
    .join("");
}

function getCurrentPlayerRankInfo() {
  if (!fullLeaderboardData.length) return null;
  if (currentUserUid) {
    const byUid = fullLeaderboardData.find((row) => row.uid === currentUserUid);
    if (byUid) return byUid;
  }
  const currentNick = getPlayerName();
  const currentNormalized = normalizeNickname(currentNick);
  if (!currentNormalized) return null;
  const byNickname = fullLeaderboardData.find((row) => normalizeNickname(row.nickname) === currentNormalized);
  return byNickname || null;
}

function buildShareText(scoreValue) {
  const nick = getPlayerName();
  const rankInfo = getCurrentPlayerRankInfo();
  const rankPart = rankInfo && rankInfo.rank ? ` Rank: #${rankInfo.rank}.` : "";
  return `I scored ${scoreValue} points in Snake. Nickname: ${nick}.${rankPart} Can you beat me?`;
}

function buildResultCardCanvas(scoreValue) {
  const nick = getPlayerName();
  const rankInfo = getCurrentPlayerRankInfo();
  const canvasCard = document.createElement("canvas");
  canvasCard.width = 980;
  canvasCard.height = 560;
  const c = canvasCard.getContext("2d");

  const bg = c.createLinearGradient(0, 0, canvasCard.width, canvasCard.height);
  bg.addColorStop(0, "#08162f");
  bg.addColorStop(1, "#12305a");
  c.fillStyle = bg;
  c.fillRect(0, 0, canvasCard.width, canvasCard.height);

  // Subtle atmospheric glow
  const haze = c.createRadialGradient(260, 130, 40, 260, 130, 360);
  haze.addColorStop(0, "rgba(97, 216, 255, 0.15)");
  haze.addColorStop(1, "rgba(97, 216, 255, 0)");
  c.fillStyle = haze;
  c.fillRect(0, 0, canvasCard.width, canvasCard.height);

  // Faint pixel-art scene (watermark style)
  const px = (x, y, w, h, color) => {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  };
  const baseY = 420;

  // Distant mountains
  c.globalAlpha = 0.2;
  px(40, baseY - 40, 220, 40, "#5f82bd");
  px(120, baseY - 80, 160, 40, "#5f82bd");
  px(300, baseY - 55, 250, 55, "#7098d1");
  px(420, baseY - 95, 160, 40, "#7098d1");
  px(620, baseY - 50, 260, 50, "#5f82bd");
  px(760, baseY - 85, 150, 35, "#5f82bd");

  // Ground band
  c.globalAlpha = 0.22;
  px(0, 448, canvasCard.width, 70, "#173a63");
  px(0, 518, canvasCard.width, 42, "#0e2745");

  // Pixel tree (left)
  c.globalAlpha = 0.24;
  px(120, 390, 20, 58, "#2b4f40");
  px(86, 340, 88, 24, "#4db19a");
  px(74, 364, 112, 22, "#3d9f8a");
  px(92, 318, 76, 22, "#64cdb5");

  // Small pagoda silhouette (right)
  c.globalAlpha = 0.2;
  px(760, 384, 96, 12, "#6eb8d4");
  px(776, 372, 64, 12, "#6eb8d4");
  px(790, 360, 36, 12, "#6eb8d4");
  px(804, 332, 8, 40, "#6eb8d4");
  px(794, 396, 28, 44, "#5a8fb5");

  // Clouds
  c.globalAlpha = 0.18;
  px(180, 122, 78, 14, "#b5d8ff");
  px(210, 110, 42, 12, "#b5d8ff");
  px(640, 138, 90, 14, "#b5d8ff");
  px(676, 124, 46, 12, "#b5d8ff");
  c.globalAlpha = 1;

  c.strokeStyle = "#4fe7ff";
  c.lineWidth = 8;
  c.strokeRect(20, 20, canvasCard.width - 40, canvasCard.height - 40);
  c.strokeStyle = "rgba(129, 235, 255, 0.35)";
  c.lineWidth = 2;
  c.strokeRect(36, 36, canvasCard.width - 72, canvasCard.height - 72);

  c.fillStyle = "#dff8ff";
  c.font = '22px "Press Start 2P", monospace';
  c.fillText("CRYPTO SNAKE", 70, 86);
  c.fillStyle = "#8fc7ff";
  c.font = '14px "Press Start 2P", monospace';
  c.fillText("Achievement Card", 70, 114);

  c.fillStyle = "#9ad2ff";
  c.font = '16px "Press Start 2P", monospace';
  c.fillText(`Nickname: ${nick}`, 70, 176);
  c.fillText(`Best Score: ${highScore}`, 70, 212);
  if (rankInfo && rankInfo.rank) {
    c.fillText(`Rank: #${rankInfo.rank}`, 70, 248);
  }

  // Score hero area
  c.fillStyle = "rgba(17, 50, 94, 0.55)";
  c.fillRect(48, 264, canvasCard.width - 96, 140);
  c.strokeStyle = "rgba(85, 230, 255, 0.5)";
  c.lineWidth = 3;
  c.strokeRect(48, 264, canvasCard.width - 96, 140);

  c.fillStyle = "#57f1cd";
  c.font = '72px "Press Start 2P", monospace';
  c.fillText(`${scoreValue}`, 74, 357);
  c.fillStyle = "#9cf8e1";
  c.font = '24px "Press Start 2P", monospace';
  c.fillText("POINTS", 610, 357);

  c.fillStyle = "rgba(255,255,255,0.85)";
  c.font = '14px "Press Start 2P", monospace';
  c.fillText("Can you beat this score?", 70, 488);

  c.fillStyle = "rgba(125, 223, 255, 0.68)";
  c.font = '12px "Press Start 2P", monospace';
  c.fillText("created by @PenguinWeb3", 632, 520);

  return canvasCard;
}

async function copyResultImage(scoreValue) {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("IMAGE_COPY_NOT_SUPPORTED");
  }

  const canvasCard = buildResultCardCanvas(scoreValue);
  const blob = await new Promise((resolve) => canvasCard.toBlob(resolve, "image/png"));
  if (!blob) {
    throw new Error("IMAGE_BLOB_FAILED");
  }

  const item = new ClipboardItem({ "image/png": blob });
  await navigator.clipboard.write([item]);
}

async function loadLeaderboard() {
  try {
    await authReadyPromise;
    const topQuery = query(
      collection(db, "leaderboard"),
      orderBy("score", "desc"),
      limit(10)
    );

    const snapshot = await getDocs(topQuery);

    if (!leaderboardBody) {
      console.error("Елемент #leaderboardBody не знайдено");
      return;
    }

    leaderboardBody.innerHTML = "";

    if (snapshot.empty) {
      leaderboardBody.innerHTML = `<tr><td colspan="3">No scores yet</td></tr>`;
      return;
    }

    let place = 1;
    snapshot.forEach((doc, index) => {
      const data = doc.data();
      const nick = escapeHtml(data.nickname || data.name || data.nick || "Guest");
      const points = Number(data.score || 0);
      const rank = Number.isFinite(index) ? index + 1 : place++;
      leaderboardBody.insertAdjacentHTML("beforeend", `<tr><td>${rank}</td><td>${nick}</td><td>${points}</td></tr>`);
    });

    if (playerRankInfo) {
      playerRankInfo.textContent = "";
      const currentNick = getPlayerName();
      const currentNormalized = normalizeNickname(currentNick);
      if (currentNormalized) {
        const fullQuery = query(collection(db, "leaderboard"), orderBy("score", "desc"));
        const fullSnapshot = await getDocs(fullQuery);
        const fullDocs = fullSnapshot.docs;
        fullLeaderboardData = fullDocs.map((d, idx) => {
          const data = d.data();
          return {
            rank: idx + 1,
            uid: d.id,
            nickname: String(data.nickname || data.name || data.nick || "Guest"),
            score: Number(data.score || 0)
          };
        });
        if (isFullLeaderboardOpen) {
          renderFullLeaderboard(fullLeaderboardSearch ? fullLeaderboardSearch.value : "");
        }
        let playerIndex = currentUserUid ? fullDocs.findIndex((d) => d.id === currentUserUid) : -1;
        if (playerIndex < 0) {
          playerIndex = fullDocs.findIndex((d) => {
            const data = d.data();
            const nick = data.nickname || data.name || data.nick || "";
            return normalizeNickname(nick) === currentNormalized;
          });
        }

        if (playerIndex >= 10) {
          const data = fullDocs[playerIndex].data();
          const nick = data.nickname || data.name || data.nick || "Guest";
          const points = Number(data.score || 0);
          playerRankInfo.textContent = `Your rank: #${playerIndex + 1} — ${nick} — ${points}`;
        }
      }
    }
  } catch (error) {
    console.error("Помилка завантаження лідерборду:", error);
  }
}
async function submitScore(nick, points) {
  await authReadyPromise;
  if (!currentUserUid) {
    console.error("submitScore skipped: no authenticated uid");
    return false;
  }
  const safeName = (nick || "Guest").trim() || "Guest";
  const normalizedNick = normalizeNickname(safeName);
  if (!normalizedNick) {
    console.error("submitScore skipped: invalid nickname");
    return false;
  }

  const playerRef = doc(db, "leaderboard", currentUserUid);

  try {
    const existing = await getDoc(playerRef);
    if (existing.exists()) {
      const prev = Number(existing.data().score || 0);
      if (points <= prev) {
        console.log(`[leaderboard] skip update for ${safeName}: ${points} <= ${prev}`);
        return true;
      }
      await setDoc(
        playerRef,
        {
          uid: currentUserUid,
          nickname: safeName,
          normalizedNickname: normalizedNick,
          score: points,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
      console.log(`[leaderboard] updated best score for ${safeName}: ${prev} -> ${points}`);
      return true;
    }

    await setDoc(playerRef, {
      uid: currentUserUid,
      nickname: safeName,
      normalizedNickname: normalizedNick,
      score: points,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    console.log(`[leaderboard] created new player ${safeName}: ${points}`);
    return true;
  } catch (error) {
    console.error("Помилка запису лідерборду:", error);
    return false;
  }
}

function setSnakeColor(color, markCustom = false) {
  snakeColorInput.value = color;
  const presetSwatches = colorPicker.querySelectorAll(".color-swatch[data-color]");
  let hasPresetMatch = false;

  presetSwatches.forEach((swatch) => {
    const isActive = swatch.dataset.color.toLowerCase() === color.toLowerCase();
    swatch.classList.toggle("active", isActive);
    if (isActive) hasPresetMatch = true;
  });

  customColorBtn.classList.toggle("active", markCustom || !hasPresetMatch);
}

function isPresetColor(color) {
  const normalized = color.toLowerCase();
  const presetSwatches = colorPicker.querySelectorAll(".color-swatch[data-color]");
  return Array.from(presetSwatches).some((swatch) => swatch.dataset.color.toLowerCase() === normalized);
}

function hexToHsl(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / d) % 6);
        break;
      case g:
        h = 60 * ((b - r) / d + 2);
        break;
      default:
        h = 60 * ((r - g) / d + 4);
    }
  }

  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function updateModalPreview() {
  draftColor = hslToHex(Number(hueRange.value), Number(satRange.value), Number(lightRange.value));
  colorPreview.style.background = draftColor;
  colorValue.textContent = draftColor.toUpperCase();
}

function openColorModal() {
  colorBeforeModal = snakeColorInput.value;
  draftColor = colorBeforeModal;
  const hsl = hexToHsl(draftColor);
  hueRange.value = hsl.h;
  satRange.value = hsl.s;
  lightRange.value = hsl.l;
  updateModalPreview();
  colorModalBackdrop.classList.add("open");
  colorModalBackdrop.setAttribute("aria-hidden", "false");
}

function closeColorModal() {
  colorModalBackdrop.classList.remove("open");
  colorModalBackdrop.setAttribute("aria-hidden", "true");
}

function playTone(startTime, duration, freq, type, volume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(musicMasterGain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

function playToneTo(targetGain, startTime, duration, freq, type, volume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(targetGain);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.04);
}

function scheduleMusicBlock(blockStart) {
  const step = 0.25;
  const leadA = [659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25, 587.33];
  const leadB = [698.46, 783.99, 987.77, 880.0, 783.99, 698.46, 659.25, 587.33];
  const leadC = [659.25, 739.99, 783.99, 880.0, 783.99, 698.46, 659.25, 523.25];
  const leadD = [587.33, 659.25, 698.46, 783.99, 739.99, 659.25, 587.33, 523.25];
  const sections = [leadA, leadB, leadC, leadD];
  const bass = [130.81, 130.81, 146.83, 146.83, 164.81, 164.81, 146.83, 146.83];

  for (let i = 0; i < 64; i++) {
    const t = blockStart + i * step;
    const part = sections[Math.floor(i / 16) % sections.length];
    const leadNote = part[i % part.length];
    const bassNote = bass[Math.floor(i / 4) % bass.length];

    if (i % 2 === 0) {
      playTone(t, 0.18, leadNote, "square", 0.06);
    }
    if (i % 8 === 4) {
      // Soft supporting harmony to keep the loop lively but chill.
      playTone(t, 0.16, leadNote * 0.5, "triangle", 0.02);
    }
    if (i % 4 === 0) {
      playTone(t, 0.22, bassNote, "triangle", 0.062);
    }
    if (i % 2 === 1 && i % 8 !== 7) {
      playTone(t, 0.05, 2000 + (i % 6) * 60, "square", 0.013);
    }
    if (i % 16 === 12) {
      playTone(t, 0.08, 1046.5, "triangle", 0.015);
    }
  }
}

function ensureMusicStarted() {
  if (musicStarted) {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    if (!musicIntervalId) {
      scheduleMusicBlock(audioCtx.currentTime + 0.06);
      musicIntervalId = setInterval(() => {
        scheduleMusicBlock(audioCtx.currentTime + 0.05);
      }, MUSIC_LOOP_DURATION * 1000);
    }
    if (gameOverMusicTimerId) {
      clearTimeout(gameOverMusicTimerId);
      gameOverMusicTimerId = null;
    }
    if (gameOverMasterGain) {
      gameOverMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
      gameOverMasterGain.gain.setTargetAtTime(0.0001, audioCtx.currentTime, 0.05);
    }
    musicMasterGain.gain.cancelScheduledValues(audioCtx.currentTime);
    musicMasterGain.gain.setTargetAtTime(isMuted ? 0 : currentVolume, audioCtx.currentTime, 0.08);
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicMasterGain = audioCtx.createGain();
  musicMasterGain.gain.value = isMuted ? 0 : currentVolume;
  musicMasterGain.connect(audioCtx.destination);
  gameOverMasterGain = audioCtx.createGain();
  gameOverMasterGain.gain.value = 0.0001;
  gameOverMasterGain.connect(audioCtx.destination);

  scheduleMusicBlock(audioCtx.currentTime + 0.05);
  musicIntervalId = setInterval(() => {
    scheduleMusicBlock(audioCtx.currentTime + 0.05);
  }, MUSIC_LOOP_DURATION * 1000);

  musicStarted = true;
}

function playGameOverMusic() {
  if (!audioCtx || !gameOverMasterGain || isMuted) return;

  const start = audioCtx.currentTime + 0.03;
  const step = 0.24;
  const sadLead = [659.25, 587.33, 523.25, 493.88, 440.0, 392.0, 349.23, 329.63];
  const sadBass = [164.81, 146.83, 130.81, 123.47];

  gameOverMasterGain.gain.cancelScheduledValues(start);
  gameOverMasterGain.gain.setValueAtTime(0.0001, start);
  gameOverMasterGain.gain.exponentialRampToValueAtTime(Math.max(0.001, currentVolume * 0.75), start + 0.15);

  for (let i = 0; i < sadLead.length; i++) {
    const t = start + i * step;
    playToneTo(gameOverMasterGain, t, 0.2, sadLead[i], "square", 0.05);
    if (i % 2 === 0) {
      const bass = sadBass[Math.floor(i / 2) % sadBass.length];
      playToneTo(gameOverMasterGain, t, 0.22, bass, "triangle", 0.045);
    }
  }

  const end = start + sadLead.length * step + 0.15;
  gameOverMasterGain.gain.exponentialRampToValueAtTime(0.0001, end);
}

function transitionToGameOverMusic() {
  if (!musicStarted || !audioCtx || !musicMasterGain) return;
  if (musicIntervalId) {
    clearInterval(musicIntervalId);
    musicIntervalId = null;
  }

  const now = audioCtx.currentTime;
  musicMasterGain.gain.cancelScheduledValues(now);
  musicMasterGain.gain.setValueAtTime(Math.max(0.001, musicMasterGain.gain.value || currentVolume), now);
  musicMasterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

  if (gameOverMusicTimerId) {
    clearTimeout(gameOverMusicTimerId);
  }
  gameOverMusicTimerId = setTimeout(() => {
    playGameOverMusic();
  }, 250);
}

function applyMusicVolume() {
  if (!musicMasterGain) return;
  musicMasterGain.gain.setTargetAtTime(isMuted ? 0 : currentVolume, audioCtx.currentTime, 0.02);
}

function syncAudioUi() {
  audioToggleBtn.classList.toggle("muted", isMuted);
  audioToggleBtn.setAttribute("aria-pressed", isMuted ? "true" : "false");
}

function createCoin() {
  let x;
  let y;
  do {
    x = randomInt(GRID);
    y = randomInt(GRID);
  } while (snake.some((s) => s.x === x && s.y === y));

  const variant = COINS[randomInt(COINS.length)];
  return { ...variant, x, y };
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 }
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = { x: 1, y: 0 };
  score = 0;
  scoreEl.textContent = score;
  coin = createCoin();
}

function setPlayerView() {
  const name = getPlayerName();
  playerViewEl.textContent = name;
}

function drawBackground() {
  ctx.fillStyle = "#071225";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = "rgba(105, 140, 200, 0.08)";
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  }
}

function drawSnake() {
  const color = snakeColorInput.value;
  const mobileMode = isMobileGameplayMode();
  snake.forEach((part, i) => {
    const px = part.x * TILE;
    const py = part.y * TILE;
    const inset = mobileMode ? (i === 0 ? 1 : 2) : (i === 0 ? 2 : 3);

    ctx.fillStyle = i === 0 ? "#ffffff" : color;
    ctx.fillRect(px + inset, py + inset, TILE - inset * 2, TILE - inset * 2);

    if (i === 0) {
      ctx.fillStyle = color;
      const headInset = mobileMode ? 5 : 7;
      ctx.fillRect(px + headInset, py + headInset, TILE - headInset * 2, TILE - headInset * 2);
    }
  });
}

function drawCoin() {
  const mobileMode = isMobileGameplayMode();
  const x = coin.x * TILE + TILE / 2;
  const y = coin.y * TILE + TILE / 2;

  ctx.beginPath();
  ctx.arc(x, y, TILE * (mobileMode ? 0.46 : 0.42), 0, Math.PI * 2);
  ctx.fillStyle = coin.color;
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#0d1120";
  ctx.font = `bold ${mobileMode ? 11 : 10}px "Press Start 2P", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(coin.symbol, x, y + 1);
}

function endGame() {
  playing = false;
  clearInterval(loopId);
  transitionToGameOverMusic();
  overlay.classList.add("visible");
  overlay.innerHTML = `
    <h2>Game Over</h2>
    <p>Your score: ${score}</p>
    <button id="playAgainBtn" type="button">Play Again</button>
    <div class="result-actions">
      <button id="copyImageBtn" type="button">Copy Image</button>
    </div>
    <p id="shareResultStatus"></p>
    <p id="saveScoreStatus"></p>
    <p class="watermark overlay-watermark">created by @PenguinWeb3</p>
  `;

  const playAgainBtn = document.getElementById("playAgainBtn");
  const copyImageBtn = document.getElementById("copyImageBtn");
  const shareResultStatus = document.getElementById("shareResultStatus");
  const saveScoreStatus = document.getElementById("saveScoreStatus");
  const nick = getPlayerName();
  saveScoreStatus.textContent = "Saving...";

  playAgainBtn.addEventListener("click", async () => {
    playAgainBtn.disabled = true;
    await startGame();
    playAgainBtn.disabled = false;
  });
  copyImageBtn.addEventListener("click", async () => {
    try {
      await copyResultImage(score);
      shareResultStatus.textContent = "Result image copied.";
    } catch (error) {
      console.error("Result image copy failed:", error);
      shareResultStatus.textContent = "Image copy is not supported in this browser";
    }
  });
  (async () => {
    if (!db) {
      saveScoreStatus.textContent = "Firebase is not configured yet.";
      return;
    }
    const ok = await submitScore(nick, score);
    if (ok) {
      saveScoreStatus.textContent = `Saved for ${nick}`;
      await loadLeaderboard();
    } else {
      saveScoreStatus.textContent = "Save failed.";
    }
  })();
}

function tick() {
  direction = pendingDirection;
  const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };

  if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
    return endGame();
  }

  if (snake.some((part) => part.x === head.x && part.y === head.y)) {
    return endGame();
  }

  snake.unshift(head);

  if (head.x === coin.x && head.y === coin.y) {
    score += coin.points;
    scoreEl.textContent = score;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("cryptoSnakeHighScore", String(highScore));
      highScoreEl.textContent = highScore;
    }
    coin = createCoin();
  } else {
    snake.pop();
  }

  drawBackground();
  drawCoin();
  drawSnake();
}

async function startGame() {
  const typed = playerNameInput.value.trim() || localStorage.getItem(PLAYER_NAME_KEY) || "";
  const { available, normalized } = await checkNicknameAvailability(typed);
  if (!available) {
    nicknameError.textContent = "This nickname is already taken";
    return;
  }
  const saved = await reserveNickname(typed, normalized);
  if (!saved) {
    nicknameError.textContent = "Failed to save nickname";
    return;
  }
  nicknameError.textContent = "";

  ensureMusicStarted();
  setPlayerView();
  resetGame();
  overlay.classList.remove("visible");
  playing = true;
  clearInterval(loopId);
  drawBackground();
  drawCoin();
  drawSnake();
  loopId = setInterval(tick, 1000 / SPEED);
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  const isArrow = key === "arrowup" || key === "arrowdown" || key === "arrowleft" || key === "arrowright";
  if (isArrow && (playing || colorModalBackdrop.classList.contains("open"))) {
    e.preventDefault();
  }
  if (!playing) return;

  if ((key === "arrowup" || key === "w") && direction.y !== 1) {
    setPendingDirection(0, -1);
  }
  if ((key === "arrowdown" || key === "s") && direction.y !== -1) {
    setPendingDirection(0, 1);
  }
  if ((key === "arrowleft" || key === "a") && direction.x !== 1) {
    setPendingDirection(-1, 0);
  }
  if ((key === "arrowright" || key === "d") && direction.x !== -1) {
    setPendingDirection(1, 0);
  }
});

let touchStartX = 0;
let touchStartY = 0;
let touchMoved = false;

function applyTapDirection(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const dx = localX - centerX;
  const dy = localY - centerY;

  if (Math.abs(dx) > Math.abs(dy)) {
    setPendingDirection(dx < 0 ? -1 : 1, 0);
  } else {
    setPendingDirection(0, dy < 0 ? -1 : 1);
  }
}

canvas.addEventListener(
  "touchstart",
  (e) => {
    if (!e.touches.length) return;
    touchMoved = false;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    if (playing) e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchmove",
  (e) => {
    if (!e.touches.length) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) touchMoved = true;
    if (playing) e.preventDefault();
  },
  { passive: false }
);

canvas.addEventListener(
  "touchend",
  (e) => {
    if (!playing) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) >= SWIPE_MIN_DISTANCE) {
      if (absX > absY) {
        setPendingDirection(dx < 0 ? -1 : 1, 0);
      } else {
        setPendingDirection(0, dy < 0 ? -1 : 1);
      }
    } else {
      applyTapDirection(t.clientX, t.clientY);
    }

    e.preventDefault();
  },
  { passive: false }
);

startBtn.addEventListener("click", startGame);
mobileStartBtn.addEventListener("click", startGame);
joyUpBtn.addEventListener("click", () => setPendingDirection(0, -1));
joyDownBtn.addEventListener("click", () => setPendingDirection(0, 1));
joyLeftBtn.addEventListener("click", () => setPendingDirection(-1, 0));
joyRightBtn.addEventListener("click", () => setPendingDirection(1, 0));
colorPicker.addEventListener("click", (e) => {
  const swatch = e.target.closest(".color-swatch");
  if (!swatch) return;

  if (swatch.dataset.color) {
    setSnakeColor(swatch.dataset.color);
    return;
  }

  openColorModal();
});
hueRange.addEventListener("input", updateModalPreview);
satRange.addEventListener("input", updateModalPreview);
lightRange.addEventListener("input", updateModalPreview);
cancelColorBtn.addEventListener("click", () => {
  setSnakeColor(colorBeforeModal, !isPresetColor(colorBeforeModal));
  closeColorModal();
});
applyColorBtn.addEventListener("click", () => {
  setSnakeColor(draftColor, true);
  closeColorModal();
});
colorModalBackdrop.addEventListener("click", (e) => {
  if (e.target === colorModalBackdrop) {
    closeColorModal();
  }
});
audioToggleBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  syncAudioUi();
  if (musicStarted) applyMusicVolume();
});
volumeSlider.addEventListener("input", () => {
  currentVolume = Number(volumeSlider.value) / 100;
  if (currentVolume > 0 && isMuted) {
    isMuted = false;
    syncAudioUi();
  }
  if (musicStarted) applyMusicVolume();
});
playerNameInput.addEventListener("input", () => {
  if (playerNameInput.readOnly) return;
  nicknameError.textContent = "";
  setPlayerView();
});
resetNicknameBtn.addEventListener("click", () => {
  localStorage.removeItem(PLAYER_NAME_KEY);
  playerNameInput.value = "";
  nicknameError.textContent = "";
  unlockNicknameInput();
  setPlayerView();
});
layoutToggleBtn.addEventListener("click", () => {
  const mobileActive = document.body.classList.toggle("mobile-layout");
  localStorage.setItem(LAYOUT_MODE_KEY, mobileActive ? "mobile" : "desktop");
  syncLayoutButtonText();
});
gameZoomBtn.addEventListener("click", () => {
  const zoomed = gameWrap.classList.toggle("zoomed");
  gameZoomBtn.classList.toggle("active", zoomed);
});
toggleFullLeaderboardBtn.addEventListener("click", () => {
  isFullLeaderboardOpen = !isFullLeaderboardOpen;
  fullLeaderboardModalBackdrop.classList.toggle("open", isFullLeaderboardOpen);
  fullLeaderboardModalBackdrop.setAttribute("aria-hidden", isFullLeaderboardOpen ? "false" : "true");
  if (isFullLeaderboardOpen) {
    fullLeaderboardSearch.value = "";
    renderFullLeaderboard(fullLeaderboardSearch.value);
  }
});
fullLeaderboardSearch.addEventListener("input", () => {
  renderFullLeaderboard(fullLeaderboardSearch.value);
});
closeFullLeaderboardBtn.addEventListener("click", () => {
  isFullLeaderboardOpen = false;
  fullLeaderboardModalBackdrop.classList.remove("open");
  fullLeaderboardModalBackdrop.setAttribute("aria-hidden", "true");
});
fullLeaderboardModalBackdrop.addEventListener("click", (e) => {
  if (e.target === fullLeaderboardModalBackdrop) {
    isFullLeaderboardOpen = false;
    fullLeaderboardModalBackdrop.classList.remove("open");
    fullLeaderboardModalBackdrop.setAttribute("aria-hidden", "true");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isFullLeaderboardOpen) {
    isFullLeaderboardOpen = false;
    fullLeaderboardModalBackdrop.classList.remove("open");
    fullLeaderboardModalBackdrop.setAttribute("aria-hidden", "true");
  }
  if (e.key === "Escape" && colorModalBackdrop.classList.contains("open")) {
    closeColorModal();
  }
});

initPlayerProfile();
applySavedLayoutMode();
setSnakeColor(snakeColorInput.value);
syncAudioUi();
loadLeaderboard();
drawBackground();












