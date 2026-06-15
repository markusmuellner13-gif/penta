import { LANGUAGES, LANG_ORDER } from "./words.js";

/* ============================================================
   PENTA — a Wordle-like daily word game.
   Five letters. Six tries.
   ============================================================ */

const ROWS = 6;
const COLS = 5;
const EPOCH = Date.UTC(2026, 0, 1); // PENTA #1 = Jan 1, 2026 (local-day based)

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const create = (tag, cls) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  return el;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayDayNumber = () => {
  const n = new Date();
  return Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - EPOCH) / 86400000);
};

/* ---------- persistence ---------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} },
};

const defaultStats = () => ({
  played: 0, wins: 0, currentStreak: 0, maxStreak: 0,
  dist: [0, 0, 0, 0, 0, 0], lastDay: null,
});

/* ============================================================
   Game state
   ============================================================ */
const settings = store.get("penta-settings", { theme: "dark", hardMode: false, lang: "en" });
if (!settings.lang || !LANGUAGES[settings.lang]) settings.lang = "en";
document.documentElement.dataset.theme = settings.theme;

const state = {
  mode: "daily",          // "daily" | "practice"
  lang: settings.lang,    // "en" | "de" | "it"
  answer: "",
  dayNumber: todayDayNumber(),
  guesses: [],            // array of guessed words
  evals: [],              // array of arrays of "correct"|"present"|"absent"
  current: "",            // letters typed in active row
  over: false,
  won: false,
  busy: false,            // locked during reveal animation
  hardMode: settings.hardMode,
};

// Current language pack: { name, flag, answers[], valid:Set }.
const curLang = () => LANGUAGES[state.lang];

const keyState = {}; // letter -> best status

/* ============================================================
   Word evaluation — Wordle's two-pass duplicate-letter rule
   ============================================================ */
function evaluate(guess, answer) {
  const res = new Array(COLS).fill("absent");
  const counts = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;
  // Pass 1: exact matches (green) consume a copy.
  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) { res[i] = "correct"; counts[guess[i]]--; }
  }
  // Pass 2: present (yellow) only while an unmatched copy remains.
  for (let i = 0; i < COLS; i++) {
    if (res[i] === "correct") continue;
    const ch = guess[i];
    if (counts[ch] > 0) { res[i] = "present"; counts[ch]--; }
  }
  return res;
}

/* ============================================================
   DOM build
   ============================================================ */
const boardEl = $("#board");
const keyboardEl = $("#keyboard");

function buildBoard() {
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    const row = create("div", "row");
    row.dataset.row = r;
    for (let c = 0; c < COLS; c++) {
      const tile = create("div", "tile");
      tile.dataset.row = r;
      tile.dataset.col = c;
      row.appendChild(tile);
    }
    boardEl.appendChild(row);
  }
}

const KB_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
function buildKeyboard() {
  keyboardEl.innerHTML = "";
  KB_ROWS.forEach((line, idx) => {
    const row = create("div", "kb-row");
    if (idx === 2) row.appendChild(makeKey("enter", "ENTER", true));
    for (const ch of line) row.appendChild(makeKey(ch, ch.toUpperCase()));
    if (idx === 2) {
      const back = makeKey("backspace", "", true);
      back.innerHTML = `<svg viewBox="0 0 24 24"><path d="M22 3H7c-.7 0-1.3.3-1.7.9L0 12l5.3 8.1c.4.6 1 .9 1.7.9h15c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-3 12.6-1.4 1.4L14 13.4 10.4 17 9 15.6 12.6 12 9 8.4 10.4 7 14 10.6 17.6 7 19 8.4 15.4 12 19 15.6Z"/></svg>`;
      row.appendChild(back);
    }
    keyboardEl.appendChild(row);
  });
}
function makeKey(key, label, wide) {
  const b = create("button", "key" + (wide ? " wide" : ""));
  b.textContent = label;
  b.dataset.key = key;
  b.addEventListener("click", () => handleKey(key));
  return b;
}

/* ============================================================
   Responsive sizing — always fit perfectly, no scrolling.
   Computes the largest tile that fits BOTH the available width
   and the available height (after header + keyboard), on any device.
   ============================================================ */
// Read a CSS env() safe-area inset (px) that CSS resolved for us.
function readInset(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function fitToScreen() {
  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;

  const safeLeft = readInset("--safe-left");
  const safeRight = readInset("--safe-right");
  const safeBottom = readInset("--safe-bottom");
  const appW = Math.min(vw - safeLeft - safeRight, 600);

  // Measure the real header (it grows by the safe-area-inset-top on notched phones).
  const headerEl = document.querySelector(".header");
  const headerH = headerEl ? headerEl.getBoundingClientRect().height : 54;

  // Keyboard height scales with viewport but stays tappable.
  const keyH = Math.max(42, Math.min(58, Math.round(vh * 0.075)));
  document.documentElement.style.setProperty("--key-h", keyH + "px");
  const keyboardH = keyH * 3 + 6 * 2 + 12 + 16 + safeBottom; // 3 rows + gaps + padding + home indicator

  const gap = 5;
  // Available space for the 6x5 board.
  const availH = vh - headerH - keyboardH - 16;
  const availW = appW - 16;

  const sizeByH = (availH - gap * (ROWS - 1)) / ROWS;
  const sizeByW = (availW - gap * (COLS - 1)) / COLS;
  let tile = Math.floor(Math.min(sizeByH, sizeByW));
  tile = Math.max(24, Math.min(tile, 64)); // sane bounds — never below a legible/tappable size

  document.documentElement.style.setProperty("--tile-size", tile + "px");
  document.documentElement.style.setProperty("--gap", gap + "px");
}

/* ============================================================
   Rendering current state to the board / keyboard
   ============================================================ */
function tileAt(r, c) { return boardEl.querySelector(`.tile[data-row="${r}"][data-col="${c}"]`); }
function rowAt(r) { return boardEl.querySelector(`.row[data-row="${r}"]`); }

function renderActiveRow() {
  const r = state.guesses.length;
  for (let c = 0; c < COLS; c++) {
    const tile = tileAt(r, c);
    if (!tile) continue;
    const ch = state.current[c];
    tile.textContent = ch ? ch.toUpperCase() : "";
    tile.classList.toggle("filled", !!ch);
  }
}

function paintPastGuesses() {
  for (let r = 0; r < state.guesses.length; r++) {
    const word = state.guesses[r];
    const ev = state.evals[r];
    for (let c = 0; c < COLS; c++) {
      const tile = tileAt(r, c);
      tile.textContent = word[c].toUpperCase();
      tile.classList.add("filled", ev[c]);
    }
  }
}

function refreshKeyboardColors() {
  for (const k in keyState) {
    const btn = keyboardEl.querySelector(`.key[data-key="${k}"]`);
    if (btn) { btn.classList.remove("correct", "present", "absent"); btn.classList.add(keyState[k]); }
  }
}

function updateKeyStates(word, ev) {
  const rank = { absent: 0, present: 1, correct: 2 };
  for (let i = 0; i < COLS; i++) {
    const ch = word[i];
    const cur = keyState[ch];
    if (!cur || rank[ev[i]] > rank[cur]) keyState[ch] = ev[i];
  }
  refreshKeyboardColors();
}

/* ============================================================
   Toast
   ============================================================ */
let toastTimer;
function toast(msg, ms = 1100) {
  const wrap = $("#toast-wrap");
  const t = create("div", "toast");
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.classList.add("fade");
    t.addEventListener("animationend", () => t.remove());
  }, ms);
}

/* ============================================================
   Input handling
   ============================================================ */
function handleKey(key) {
  if (state.over || state.busy) return;
  if (key === "enter") return submitGuess();
  if (key === "backspace") {
    if (state.current.length > 0) {
      state.current = state.current.slice(0, -1);
      renderActiveRow();
    }
    return;
  }
  if (/^[a-z]$/.test(key) && state.current.length < COLS) {
    state.current += key;
    renderActiveRow();
  }
}

function hardModeViolation(guess) {
  // All previously revealed greens must stay; all yellows must be reused.
  for (let r = 0; r < state.guesses.length; r++) {
    const ev = state.evals[r], pastWord = state.guesses[r];
    for (let i = 0; i < COLS; i++) {
      if (ev[i] === "correct" && guess[i] !== pastWord[i]) {
        return `${ordinal(i + 1)} letter must be ${pastWord[i].toUpperCase()}`;
      }
    }
    for (let i = 0; i < COLS; i++) {
      if (ev[i] === "present" && !guess.includes(pastWord[i])) {
        return `Guess must contain ${pastWord[i].toUpperCase()}`;
      }
    }
  }
  return null;
}
const ordinal = (n) => ["1st", "2nd", "3rd", "4th", "5th"][n - 1] || n + "th";

async function submitGuess() {
  const guess = state.current;
  const r = state.guesses.length;

  if (guess.length < COLS) { shakeRow(r); toast("Not enough letters"); return; }
  if (!curLang().valid.has(guess) && guess !== state.answer) { shakeRow(r); toast("Not in word list"); return; }
  if (state.hardMode) {
    const v = hardModeViolation(guess);
    if (v) { shakeRow(r); toast(v); return; }
  }

  const ev = evaluate(guess, state.answer);
  state.busy = true;

  await revealRow(r, guess, ev);

  state.guesses.push(guess);
  state.evals.push(ev);
  state.current = "";
  updateKeyStates(guess, ev);
  persistGame();

  const won = guess === state.answer;
  if (won) {
    state.over = true; state.won = true;
    rowAt(r).classList.add("win");
    onGameEnd(true);
  } else if (state.guesses.length >= ROWS) {
    state.over = true;
    onGameEnd(false);
  }
  state.busy = false;
}

function shakeRow(r) {
  const row = rowAt(r);
  row.classList.add("shake");
  row.addEventListener("animationend", () => row.classList.remove("shake"), { once: true });
}

async function revealRow(r, word, ev) {
  for (let c = 0; c < COLS; c++) {
    const tile = tileAt(r, c);
    tile.classList.add("reveal");
    // Swap the color in at the midpoint of the 500ms flip (tile edge-on).
    setTimeout(() => { tile.classList.add(ev[c]); }, 250);
    await sleep(180); // stagger between tiles
  }
  await sleep(350);
}

/* ============================================================
   End of game
   ============================================================ */
const WIN_MSGS = ["Genius!", "Magnificent!", "Impressive!", "Splendid!", "Great!", "Phew!"];

function onGameEnd(won) {
  if (state.mode === "daily") {
    recordStats(won, state.guesses.length);
  }
  if (won) toast(WIN_MSGS[state.guesses.length - 1], 1600);
  else toast(state.answer.toUpperCase(), 2400);
  setTimeout(() => showStatsModal(), won ? 1700 : 1700);
}

function statsKey() { return `penta-stats-${state.lang}`; }

function recordStats(won, tries) {
  const stats = store.get(statsKey(), defaultStats());
  if (stats.lastDay === state.dayNumber) return; // already recorded today
  stats.played++;
  if (won) {
    stats.wins++;
    stats.dist[tries - 1]++;
    stats.currentStreak = (stats.lastDay === state.dayNumber - 1 || stats.lastDay == null)
      ? stats.currentStreak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.currentStreak);
  } else {
    stats.currentStreak = 0;
  }
  stats.lastDay = state.dayNumber;
  store.set(statsKey(), stats);
}

/* ============================================================
   Persistence of in-progress daily game
   ============================================================ */
function dailyKey() { return `penta-daily-${state.lang}-${state.dayNumber}`; }

function persistGame() {
  if (state.mode !== "daily") return;
  store.set(dailyKey(), {
    answer: state.answer, guesses: state.guesses, evals: state.evals,
    over: state.over, won: state.won,
  });
}

function cleanupOldDailies() {
  // Drop saved games from previous days, but keep every language's game for today.
  const suffix = `-${state.dayNumber}`;
  const stale = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("penta-daily-") && !k.endsWith(suffix)) stale.push(k);
  }
  stale.forEach(store.del);
}

/* ============================================================
   Game lifecycle
   ============================================================ */
function resetBoardUI() {
  for (const k in keyState) delete keyState[k];
  buildBoard();
  keyboardEl.querySelectorAll(".key").forEach((b) => b.classList.remove("correct", "present", "absent"));
}

function startDaily() {
  state.mode = "daily";
  state.dayNumber = todayDayNumber();
  const answers = curLang().answers;
  state.answer = answers[state.dayNumber % answers.length];
  $("#mode-label").textContent = `Daily · #${state.dayNumber + 1}`;
  resetBoardUI();
  cleanupOldDailies();

  const saved = store.get(dailyKey(), null);
  state.guesses = []; state.evals = []; state.current = ""; state.over = false; state.won = false;

  if (saved && saved.answer === state.answer) {
    state.guesses = saved.guesses;
    state.evals = saved.evals;
    state.over = saved.over;
    state.won = saved.won;
    paintPastGuesses();
    state.guesses.forEach((w, i) => updateKeyStates(w, state.evals[i]));
  }
  fitToScreen();
}

function startPractice() {
  state.mode = "practice";
  const answers = curLang().answers;
  state.answer = answers[Math.floor(Math.random() * answers.length)];
  $("#mode-label").textContent = "Practice";
  state.guesses = []; state.evals = []; state.current = ""; state.over = false; state.won = false;
  resetBoardUI();
  fitToScreen();
  toast("Practice round — good luck!");
}

/* ============================================================
   Modals
   ============================================================ */
const overlay = $("#modal-overlay");
const modalContent = $("#modal-content");

function openModal(html) {
  modalContent.innerHTML = html;
  overlay.hidden = false;
}
function closeModal() { overlay.hidden = true; }
$("#modal-close").addEventListener("click", closeModal);
overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });

function miniTiles(spec) {
  // spec: [["w",""],["o","correct"]...]
  return spec.map(([ch, st]) => `<div class="mini-tile ${st}">${ch}</div>`).join("");
}

function showHelpModal() {
  openModal(`
    <h2>How to play</h2>
    <p>Guess the <b>PENTA</b> in 6 tries. Each guess must be a valid 5-letter word.
       After each guess, the tiles show how close you were.</p>
    <h3>Examples</h3>
    <div class="example-row">${miniTiles([["c","correct"],["r",""],["a",""],["n",""],["e",""]])}</div>
    <p><b>C</b> is in the word and in the correct spot.</p>
    <div class="example-row">${miniTiles([["p",""],["i","present"],["l",""],["o",""],["t",""]])}</div>
    <p><b>I</b> is in the word but in the wrong spot.</p>
    <div class="example-row">${miniTiles([["v",""],["a",""],["g",""],["u","absent"],["e",""]])}</div>
    <p><b>U</b> is not in the word in any spot.</p>
    <hr class="divider" />
    <p>A new <b>Daily</b> puzzle appears every day — everyone gets the same word.
       Tap <b>↻</b> any time for unlimited <b>Practice</b> rounds, and the
       <b>flag</b> to switch between 🇬🇧 English, 🇩🇪 Deutsch and 🇮🇹 Italiano —
       each language keeps its own daily puzzle and stats.</p>
  `);
}

function showStatsModal() {
  const stats = store.get(statsKey(), defaultStats());
  const winPct = stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const maxDist = Math.max(1, ...stats.dist);
  const lastTries = state.won ? state.guesses.length : -1;

  const distRows = stats.dist.map((n, i) => {
    const w = Math.max(7, Math.round((n / maxDist) * 100));
    const cur = (i + 1 === lastTries && state.mode === "daily" && state.over) ? " current" : "";
    return `<div class="dist-row"><div class="dist-i">${i + 1}</div>
      <div class="dist-bar-wrap"><span class="dist-bar${cur}" style="width:${w}%">${n}</span></div></div>`;
  }).join("");

  const endBlock = state.over ? `
    <hr class="divider" />
    <div style="display:flex; gap:16px; align-items:center;">
      <div class="countdown" id="countdown" style="flex:1;">
        <div class="label">Next PENTA</div><div class="time" id="cd-time">--:--:--</div>
      </div>
      <button class="btn" id="share-btn" style="flex:1;">
        Share
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 16a3 3 0 0 0-2.2 1l-7-4a3 3 0 0 0 0-2l7-4A3 3 0 1 0 15 5l-7 4a3 3 0 1 0 0 6l7 4a3 3 0 1 0 3-3Z"/></svg>
      </button>
    </div>` : "";

  openModal(`
    <h2>Statistics</h2>
    <div class="stats-grid">
      <div><div class="stat-num">${stats.played}</div><div class="stat-lbl">Played</div></div>
      <div><div class="stat-num">${winPct}</div><div class="stat-lbl">Win %</div></div>
      <div><div class="stat-num">${stats.currentStreak}</div><div class="stat-lbl">Current Streak</div></div>
      <div><div class="stat-num">${stats.maxStreak}</div><div class="stat-lbl">Max Streak</div></div>
    </div>
    <h3>Guess Distribution</h3>
    ${stats.played ? distRows : '<p style="color:var(--muted)">Play a daily game to see your distribution.</p>'}
    ${endBlock}
    <p style="text-align:center;color:var(--muted);font-size:12px;margin-top:14px;">
      ${state.mode === "practice" ? "Practice rounds don't affect your stats." : ""}
    </p>
  `);

  if (state.over) {
    const sb = $("#share-btn");
    if (sb) sb.addEventListener("click", shareResult);
    startCountdown();
  }
}

function showSettingsModal() {
  openModal(`
    <h2>Settings</h2>
    <div class="toggle-row">
      <div class="info"><div class="t">Hard Mode</div><div class="d">Revealed hints must be used in later guesses</div></div>
      <label class="switch"><input type="checkbox" id="hard-toggle" ${state.hardMode ? "checked" : ""}/><span class="slider"></span></label>
    </div>
    <hr class="divider" />
    <div class="toggle-row">
      <div class="info"><div class="t">Dark Theme</div><div class="d">Easier on the eyes at night</div></div>
      <label class="switch"><input type="checkbox" id="theme-toggle" ${settings.theme === "dark" ? "checked" : ""}/><span class="slider"></span></label>
    </div>
    <hr class="divider" />
    <p style="color:var(--muted);font-size:12px;">PENTA · a daily word game. Five letters, six tries.
       Made with care. Words: Stanford GraphBase (EN, public domain) · FrequencyWords (DE, IT).</p>
  `);

  $("#hard-toggle").addEventListener("change", (e) => {
    // Hard mode can only change at the start of a round (Wordle rule).
    if (state.guesses.length > 0 && !state.over) {
      e.target.checked = state.hardMode;
      toast("Hard mode can't change mid-game");
      return;
    }
    state.hardMode = e.target.checked;
    settings.hardMode = state.hardMode;
    store.set("penta-settings", settings);
  });
  $("#theme-toggle").addEventListener("change", (e) => {
    settings.theme = e.target.checked ? "dark" : "light";
    document.documentElement.dataset.theme = settings.theme;
    store.set("penta-settings", settings);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", settings.theme === "dark" ? "#121213" : "#ffffff");
  });
}

/* ---------- Share ---------- */
function buildShareText() {
  const tag = state.mode === "daily" ? `#${state.dayNumber + 1}` : "Practice";
  const head = `PENTA ${curLang().flag} ${tag}`;
  const score = state.won ? state.guesses.length : "X";
  const hard = state.hardMode ? "*" : "";
  const emoji = { correct: "🟩", present: "🟨", absent: "⬛" };
  const grid = state.evals.map((ev) => ev.map((s) => emoji[s]).join("")).join("\n");
  return `${head} ${score}/6${hard}\n\n${grid}`;
}

async function shareResult() {
  const text = buildShareText();
  try {
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied results to clipboard");
  } catch {
    toast("Couldn't copy — long-press to select");
  }
}

/* ---------- Countdown ---------- */
let countdownTimer;
function startCountdown() {
  clearInterval(countdownTimer);
  const tick = () => {
    const el = $("#cd-time");
    if (!el) { clearInterval(countdownTimer); return; }
    const now = new Date();
    const next = new Date(now); next.setHours(24, 0, 0, 0);
    let diff = Math.max(0, next - now);
    const h = String(Math.floor(diff / 3.6e6)).padStart(2, "0");
    const m = String(Math.floor((diff % 3.6e6) / 6e4)).padStart(2, "0");
    const s = String(Math.floor((diff % 6e4) / 1000)).padStart(2, "0");
    el.textContent = `${h}:${m}:${s}`;
    if (diff === 0) { startDaily(); }
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ============================================================
   Wiring
   ============================================================ */
document.addEventListener("keydown", (e) => {
  if (!overlay.hidden) { if (e.key === "Escape") closeModal(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === "Enter") handleKey("enter");
  else if (k === "Backspace") handleKey("backspace");
  else if (/^[a-zA-Z]$/.test(k)) handleKey(k.toLowerCase());
});

$("#help-btn").addEventListener("click", showHelpModal);
$("#stats-btn").addEventListener("click", showStatsModal);
$("#theme-btn").addEventListener("click", showSettingsModal);
$("#practice-btn").addEventListener("click", () => startPractice());
// Click the PENTA title to return to today's Daily puzzle.
$(".title-wrap").addEventListener("click", () => { if (state.mode !== "daily") startDaily(); });
$(".title-wrap").style.cursor = "pointer";

/* ---------- Language toggle ---------- */
function updateLangBtn() {
  const btn = $("#lang-btn");
  if (btn) { btn.querySelector(".lang-flag").textContent = curLang().flag; btn.title = `Language: ${curLang().name}`; }
}
function setLang(code) {
  if (!LANGUAGES[code] || code === state.lang) return;
  state.lang = code;
  settings.lang = code;
  store.set("penta-settings", settings);
  updateLangBtn();
  if (state.mode === "practice") startPractice(); else startDaily();
  toast(curLang().name);
}
function cycleLang() {
  const i = LANG_ORDER.indexOf(state.lang);
  setLang(LANG_ORDER[(i + 1) % LANG_ORDER.length]);
}
$("#lang-btn").addEventListener("click", cycleLang);
updateLangBtn();

window.addEventListener("resize", fitToScreen);
window.addEventListener("orientationchange", () => setTimeout(fitToScreen, 200));
if (window.visualViewport) window.visualViewport.addEventListener("resize", fitToScreen);

/* ---------- splash ---------- */
function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  // Let the tile flip-in animation read before fading out.
  setTimeout(() => {
    splash.classList.add("hide");
    splash.addEventListener("transitionend", () => splash.remove(), { once: true });
    // Safety net in case transitionend doesn't fire.
    setTimeout(() => splash.remove(), 700);
  }, 1500);
}

/* ---------- boot ---------- */
buildBoard();
buildKeyboard();
fitToScreen();
startDaily();
dismissSplash();

// First-time visitors get the how-to (after the splash clears).
if (!store.get("penta-seen", false)) {
  store.set("penta-seen", true);
  setTimeout(showHelpModal, 2300);
}
