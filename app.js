/* =============================================================================
   New Year Page — app.js (re-organized)
   - Clear sections
   - Fixes a few “gotchas”:
     1) bg.onload was calling updateSingaporeTime() even after you stopWaitingLoops()
        -> now it only refreshes the UI in WAITING/COUNTDOWN phases.
     2) stopWaitingLoops() would stop orchestration because it relies on updateSingaporeTime()
        -> now BLACKOUT/BELLS/DONE use their own timers and do not need SG polling.
     3) Defensive DOM checks for optional audio elements.
     4) Centralized sky element lookup once.
   ========================================================================== */

/* =============================================================================
   0) CONFIG
   ========================================================================== */

/** Scenes */
const SCENES = [
  { id: "Hug", src: "assets/scene_1.png" },
  { id: "Kiss", src: "assets/scene_2.png" },
];

/** Photo rotator */
const PHOTO_URLS = [
  "assets/photos/1.jpg",
  "assets/photos/3.jpg",
  "assets/photos/4.jpg",
  "assets/photos/5.jpg",
  "assets/photos/6.jpg",
  "assets/photos/7.jpg",
  "assets/photos/8.jpg",
  "assets/photos/9.jpg",
  "assets/photos/10.jpg",
  "assets/photos/11.jpg",
  "assets/photos/12.jpg",
  "assets/photos/13.jpg",
  "assets/photos/14.jpg",
  "assets/photos/15.jpg",
];

/** Orchestrated phases */
const PHASE = {
  WAITING: "waiting",
  COUNTDOWN_MUSIC: "countdown_music",
  BLACKOUT: "blackout",
  BELLS: "bells",
  DONE: "done",
};

let phase = PHASE.WAITING;

/** Timing (tune COUNTDOWN_TRIGGER_SEC) */
const COUNTDOWN_TRIGGER_SEC = 218; // fine-tune
const BLACKOUT_WAIT_MS = 5000;
const BELLS_COUNT = 12;
const BELLS_INTERVAL_MS = 5000;
const AFTER_BELLS_WAIT_MS = 2000;

const SECRET_WORDS = [
  "I", "LOVE", "YOU", "SO", "MUCH", "HONEY", "HAPPY", "NEW", "YEAR", "WITH", "ME", "♥",
];

/** Geometry in BACKGROUND IMAGE PIXELS (natural image size).
    Corner order for quads: TL, TR, BR, BL. */
const GEOMETRY_PX = {
  billboards: {
    left: [
      { x: 62, y: 561 },  // TL
      { x: 244, y: 607 }, // TR
      { x: 244, y: 937 }, // BR
      { x: 62, y: 943 },  // BL
    ],
    right: [
      { x: 780, y: 607 }, // TL
      { x: 967, y: 560 }, // TR
      { x: 967, y: 944 }, // BR
      { x: 781, y: 938 }, // BL
    ],
  },
};

/** Wind overlay animation config */
const WIND_FPS = 20;
const WIND_TOGGLE_EVERY_MS = 6000;
const WIND_FRAME_COUNT = 15;
const WIND_EXT = "png"; // update if needed

function makeWindSeq(folder, count) {
  const out = [];
  for (let i = 1; i <= count; i++) {
    out.push(`${folder}/frame_${String(i).padStart(6, "0")}.${WIND_EXT}`);
  }
  return out;
}

const WIND_SEQS = [
  makeWindSeq("assets/wind1", WIND_FRAME_COUNT),
  makeWindSeq("assets/wind2", WIND_FRAME_COUNT),
];

/* =============================================================================
   1) DOM REFERENCES
   ========================================================================== */

const bg = document.getElementById("bg");

const debugBtn = document.getElementById("debugBtn");

const bgm = document.getElementById("bgm");
const countdownBgm = document.getElementById("countdownBgm"); // optional if you added it
const bellSfx = document.getElementById("bellSfx");           // optional if you added it
const outroBgm = document.getElementById("outroBgm");

const audioBtn = document.getElementById("audioBtn");

const bbLeft = document.getElementById("bbLeft");
const bbRight = document.getElementById("bbRight");
const bbLeftInner = document.getElementById("bbLeftInner");
const bbRightInner = document.getElementById("bbRightInner");

const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const sceneLabel = document.getElementById("sceneLabel");

const sky = document.getElementById("skyText");

// =========================
// Fireworks.js integration
// =========================
const fxCanvas = document.getElementById("fx");

let fireworks = null;

function initFireworks() {
  if (!fxCanvas || fireworks) return;
  if (!window.Fireworks || !window.Fireworks.default) {
    console.warn("Fireworks.js not loaded");
    return;
  }

  fireworks = new window.Fireworks.default(fxCanvas, {
    autoresize: true,

    // Distant feel
    opacity: 0.35,

    // Launch zone (keep it centered so it reads far away)
    rocketsPoint: { min: 48, max: 52 },

    // Warm gold palette
    hue: { min: 45, max: 55 },

    // Make ascent subtle (far away)
    intensity: 0.5,
    gravity: 1.05,
    friction: 0.99,

    // Big bloom
    explosion: 5,
    particles: 130,

    // Very subtle trails
    traceLength: 4,
    traceSpeed: 2,

    // No sound
    sound: { enabled: true },
  });
}

/* =============================================================================
   2) WIND OVERLAY CONTROLLER
   ========================================================================== */

let windImg = document.getElementById("windOverlay");
if (!windImg) {
  windImg = document.createElement("img");
  windImg.id = "windOverlay";
  windImg.alt = "";
  windImg.style.position = "absolute";
  windImg.style.inset = "0";
  windImg.style.width = "100%";
  windImg.style.height = "100%";
  windImg.style.objectFit = "contain";
  windImg.style.pointerEvents = "none";
  windImg.style.zIndex = "40";
  windImg.style.display = "block";
  document.body.appendChild(windImg);
}

function preloadImages(list) {
  for (const src of list) {
    const im = new Image();
    im.src = src;
  }
}
preloadImages(WIND_SEQS[0]);
preloadImages(WIND_SEQS[1]);

let windSeqIdx = 0;
let windFrameTimer = null;
let windToggleTimer = null;

function stopWindPlayback() {
  if (windFrameTimer) {
    clearInterval(windFrameTimer);
    windFrameTimer = null;
  }
  if (windToggleTimer) {
    clearInterval(windToggleTimer);
    windToggleTimer = null;
  }
}

function playWindOnce(frames) {
  if (!frames?.length) return;

  if (windFrameTimer) {
    clearInterval(windFrameTimer);
    windFrameTimer = null;
  }

  windImg.style.opacity = "1";
  let i = 0;
  windImg.src = frames[0];

  windFrameTimer = setInterval(() => {
    i++;
    if (i >= frames.length) {
      clearInterval(windFrameTimer);
      windFrameTimer = null;
      windImg.removeAttribute("src");
      windImg.style.opacity = "0";
      return;
    }
    windImg.src = frames[i];
  }, 1000 / WIND_FPS);
}

function startWindLoop() {
  stopWindPlayback();

  windSeqIdx = 0;
  playWindOnce(WIND_SEQS[windSeqIdx]);

  windToggleTimer = setInterval(() => {
    windSeqIdx = 1 - windSeqIdx;
    playWindOnce(WIND_SEQS[windSeqIdx]);
  }, WIND_TOGGLE_EVERY_MS);
}

/* =============================================================================
   3) WAITING LOOPS (SG countdown + photo rotator)
   ========================================================================== */

let sgTimer = null;
let photoTimer = null;

const FIREWORK_LEAD_MS = 650; // try 500–900 depending on your settings

function startWaitingLoops() {
  stopWaitingLoops();
  sgTimer = setInterval(updateSingaporeTime, 250);
  photoTimer = setInterval(nextPhoto, 10000);
}

function stopWaitingLoops() {
  if (sgTimer) { clearInterval(sgTimer); sgTimer = null; }
  if (photoTimer) { clearInterval(photoTimer); photoTimer = null; }
}

/* =============================================================================
   4) SCENE + BILLBOARD CONTENT
   ========================================================================== */

let sceneIndex = 0;
let photoIdx = 0;

function currentScene() {
  return SCENES[sceneIndex];
}

function setBillboardContent() {
  // LEFT billboard: photo loop
  bbLeftInner.innerHTML = `
    <div class="photo-rotator">
      <div class="photo-fade" id="photoFade">
        <img id="photoImg" src="${PHOTO_URLS[photoIdx % PHOTO_URLS.length]}" alt="photo" />
      </div>
    </div>
  `;

  // RIGHT billboard: Countdown (Singapore)
  bbRightInner.innerHTML = `
    <div class="sg-time" id="sgTime">
      <div class="sg-header" id="sgHeader">Countdown:</div>
      <div class="sg-row" id="sgH">00</div>
      <div class="sg-row" id="sgM">00</div>
      <div class="sg-row" id="sgS">00</div>
    </div>
  `;
}

function nextPhoto() {
  const fade = document.getElementById("photoFade");
  const img = document.getElementById("photoImg");
  if (!fade || !img) return;

  fade.classList.add("fade-out");

  setTimeout(() => {
    photoIdx++;
    img.src = PHOTO_URLS[photoIdx % PHOTO_URLS.length];
    fade.classList.remove("fade-out");
  }, 600); // must match CSS transition
}

/* =============================================================================
   5) SINGAPORE COUNTDOWN (DRIVES ORCHESTRATION UNTIL BLACKOUT)
   ========================================================================== */
// --- Countdown target (absolute time in ms since epoch, UTC-based) ---
let targetTimeMs = 0;

// Normal mode: set to next midnight in Singapore, computed once on load
function computeNextSingaporeMidnightMs(now = new Date()) {
  // Get Singapore date parts for "today" in SG
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const y = Number(map.year);
  const mo = Number(map.month);
  const d = Number(map.day);

  // Singapore is UTC+8, no DST
  const SG_OFFSET_MIN = 8 * 60;

  // "tomorrow 00:00:00" SG time -> UTC ms
  return Date.UTC(y, mo - 1, d + 1, 0, 0, 0) - SG_OFFSET_MIN * 60 * 1000;
}

function initTargetTime() {
  targetTimeMs = computeNextSingaporeMidnightMs(new Date());
}

function updateSingaporeTime() {
  const nowMs = Date.now();
  let diffMs = targetTimeMs - nowMs;
  if (diffMs < 0) diffMs = 0;

  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  // Only update the visible countdown UI during relevant phases
  const shouldUpdateUi =
    phase === PHASE.WAITING || phase === PHASE.COUNTDOWN_MUSIC;

  if (shouldUpdateUi) {
    const elH = document.getElementById("sgH");
    const elM = document.getElementById("sgM");
    const elS = document.getElementById("sgS");
    if (elH && elM && elS) {
      elH.textContent = String(h).padStart(2, "0");
      elM.textContent = String(m).padStart(2, "0");
      elS.textContent = String(s).padStart(2, "0");
    }
  }

  orchestrate(totalSec);
}



/* =============================================================================
   6) ORCHESTRATION: WAITING -> COUNTDOWN_MUSIC -> BLACKOUT -> BELLS -> DONE
   ========================================================================== */

let bellsTimer = null;
let bellsIndex = 0;
let secretSoFar = "";

function orchestrate(remainingSec) {
  // WAITING -> COUNTDOWN_MUSIC
  if (phase === PHASE.WAITING && remainingSec <= COUNTDOWN_TRIGGER_SEC && remainingSec > 0) {
    startCountdownMusicPhase();
    return;
  }

  // COUNTDOWN_MUSIC -> BLACKOUT
  if (phase === PHASE.COUNTDOWN_MUSIC && remainingSec === 0) {
    startBlackoutPhase();
    return;
  }
}

async function startCountdownMusicPhase() {
  phase = PHASE.COUNTDOWN_MUSIC;

  // Switch music track if provided
  try {
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
    }

    if (countdownBgm) {
      countdownBgm.currentTime = 0;
      countdownBgm.loop = false;
      await countdownBgm.play();
    }
  } catch (e) {
    // Autoplay may be blocked until user gesture; visuals still continue.
  }
}

let skyFadeTimer = null;

function startBlackoutPhase() {
  phase = PHASE.BLACKOUT;

  try {
    if (countdownBgm) {
      countdownBgm.pause();
      countdownBgm.currentTime = 0;
    }
  } catch (e) {}

  setBillboardsBlack(true);

  // Clear sky message until bells start
  if (sky) {
    sky.classList.remove("show");
    sky.textContent = "";
  }

  if (skyFadeTimer) {
    clearTimeout(skyFadeTimer);
    skyFadeTimer = null;
  }

  // We no longer need SG polling once blackout begins.
  // (BELLS + DONE are driven by their own timers)
  stopWaitingLoops();

  setTimeout(startBellsPhase, BLACKOUT_WAIT_MS);
}

function startBellsPhase() {
  phase = PHASE.BELLS;

  bellsIndex = 0;
  secretSoFar = "";
  setBillboardsWhite();

  // First bell immediately
  doOneBell();

  // Then every interval
  if (bellsTimer) clearInterval(bellsTimer);
  bellsTimer = setInterval(doOneBell, BELLS_INTERVAL_MS);
}

function fireGoldenFirework() {
  if (!fireworks) return;

  // Launch exactly one rocket
  fireworks.launch(4);
}

function doOneBell() {
  bellsIndex++;

  if (bellsIndex > BELLS_COUNT) {
    if (bellsTimer) clearInterval(bellsTimer);
    bellsTimer = null;

    phase = PHASE.DONE;

    setTimeout(async () => {
      if (sky) {
        sky.classList.remove("show");
        sky.classList.remove("fade");
        sky.textContent = "";
      }

      stopAllAudio();
      renderFinalBillboards();
      await playOutro();
    }, AFTER_BELLS_WAIT_MS);

    return;
  }

  // 1) Launch first (so explosion can land on the bell)
  fireGoldenFirework();

  // 2) Bell + number + word slightly later
  setTimeout(() => {
    playBell();
    setBillboardsWhite();
    renderBellNumber(bellsIndex);

    const nextWord = SECRET_WORDS[bellsIndex - 1] ?? "";
    showSkyWord(nextWord);
  }, FIREWORK_LEAD_MS);
}

/* =============================================================================
   7) UI HELPERS (billboards + sky + bell)
   ========================================================================== */

function setBillboardsBlack(on) {
  [bbLeftInner, bbRightInner].forEach(el => {
    if (!el) return;

    // Force a paint so transitions always trigger
    // (works especially well on Safari/iOS)
    void el.offsetWidth;

    el.classList.toggle("is-black", !!on);
    el.classList.toggle("is-white", !on);
  });
}

function setBillboardsWhite() {
  setBillboardsBlack(false);
}

function renderBellNumber(n) {
  if (!bbLeftInner || !bbRightInner) return;
  bbLeftInner.innerHTML = `<div class="bb-number">${n}</div>`;
  bbRightInner.innerHTML = `<div class="bb-number">${n}</div>`;
}

function showSkyWord(word) {
  if (!sky) return;

  // Clear any scheduled fade from previous word
  if (skyFadeTimer) {
    clearTimeout(skyFadeTimer);
    skyFadeTimer = null;
  }

  // 1) Set word and show instantly (no fade-in)
  sky.textContent = word;
  sky.classList.remove("fade");

  // Temporarily disable transition so it "pops" in
  const prevTransition = sky.style.transition;
  sky.style.transition = "none";
  sky.classList.add("show");
  // force reflow so transition removal applies
  void sky.offsetWidth;
  sky.style.transition = prevTransition || "";

  // 2) Fade out before next bell
  // We fade out a bit before the next bell so it’s gone when the bell hits.
  const FADE_OUT_MS = 450; // match CSS transition (opacity 450ms)
  const HOLD_MS = 1000; // 150ms buffer

  skyFadeTimer = setTimeout(() => {
    sky.classList.add("fade"); // opacity -> 0 via CSS
  }, HOLD_MS);
}

function playBell() {
  if (!bellSfx) return;
  try {
    bellSfx.currentTime = 0;
    bellSfx.play();
    audioOn = true; 
    audioBtn.textContent = "𝆕 On";
  } catch (e) {}
}

/* =============================================================================
   8) BACKGROUND IMAGE -> SCREEN MAPPING (object-fit: cover)
   ========================================================================== */

function getCoverTransform(imgEl) {
  const cw = window.innerWidth;
  const ch = window.innerHeight;

  const iw = imgEl.naturalWidth;
  const ih = imgEl.naturalHeight;
  if (!iw || !ih) return null;

  const s = Math.max(cw / iw, ch / ih); // cover scale
  const dw = iw * s;
  const dh = ih * s;

  const offsetX = (cw - dw) / 2;
  const offsetY = (ch - dh) / 2;

  return { s, offsetX, offsetY };
}

function imgPxToScreenPx(pt, T) {
  return { x: T.offsetX + pt.x * T.s, y: T.offsetY + pt.y * T.s };
}

function imgPolyToScreen(poly, T) {
  return poly.map(p => imgPxToScreenPx(p, T));
}

/* =============================================================================
   9) PERSPECTIVE TRANSFORM (homography -> CSS matrix3d)
   ========================================================================== */

function computeCssHomography(dest) {
  const minX = Math.min(...dest.map(p => p.x));
  const minY = Math.min(...dest.map(p => p.y));
  const maxX = Math.max(...dest.map(p => p.x));
  const maxY = Math.max(...dest.map(p => p.y));

  const w = Math.max(200, maxX - minX);
  const h = Math.max(120, maxY - minY);

  const src = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  const H = solveHomography(src, dest);

  const a = H[0][0], b = H[0][1], c = H[0][2];
  const d = H[1][0], e = H[1][1], f = H[1][2];
  const g = H[2][0], h2 = H[2][1], i = H[2][2];

  const matrix3d = `matrix3d(${[
    a, d, 0, g,
    b, e, 0, h2,
    0, 0, 1, 0,
    c, f, 0, i,
  ].map(v => Number(v.toFixed(10))).join(",")})`;

  return { matrix3d, width: w, height: h };
}

function solveHomography(src, dest) {
  const A = [];
  const B = [];

  for (let k = 0; k < 4; k++) {
    const x = src[k].x, y = src[k].y;
    const u = dest[k].x, v = dest[k].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    B.push(u);

    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    B.push(v);
  }

  const h = solveLinearSystem(A, B);
  return [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], 1],
  ];
}

function solveLinearSystem(A, b) {
  const n = A.length;
  const M = A.map((row, i) => row.concat([b[i]]));
  const m = M[0].length;

  for (let col = 0; col < m - 1; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];

    const denom = M[col][col] || 1e-12;
    for (let c = col; c < m; c++) M[col][c] /= denom;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let c = col; c < m; c++) M[r][c] -= factor * M[col][c];
    }
  }

  return M.map(row => row[m - 1]).slice(0, 8);
}

/* =============================================================================
   10) APPLY GEOMETRY TO BILLBOARDS
   ========================================================================== */

function applyBillboard(el, innerEl, quad) {
  const { matrix3d, width, height } = computeCssHomography(quad);

  innerEl.style.width = `${width}px`;
  innerEl.style.height = `${height}px`;

  el.style.left = "0px";
  el.style.top = "0px";
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  el.style.transform = matrix3d;
}

function applyAllTransforms() {
  const T = getCoverTransform(bg);
  if (!T) return;

  const leftQuad = imgPolyToScreen(GEOMETRY_PX.billboards.left, T);
  const rightQuad = imgPolyToScreen(GEOMETRY_PX.billboards.right, T);

  applyBillboard(bbLeft, bbLeftInner, leftQuad);
  applyBillboard(bbRight, bbRightInner, rightQuad);
}

/* =============================================================================
   11) SCENE LOADING + NAV
   ========================================================================== */

function setScene(index) {
  sceneIndex = (index + SCENES.length) % SCENES.length;
  const s = currentScene();

  bg.src = s.src;
  sceneLabel.textContent = s.id;

  // Restore billboard UI only if we're not in blackout/bells/done
  if (phase === PHASE.WAITING || phase === PHASE.COUNTDOWN_MUSIC) {
    setBillboardContent();
  }
}

prevBtn.onclick = () => setScene(sceneIndex - 1);
nextBtn.onclick = () => setScene(sceneIndex + 1);

bg.onload = () => {
  applyAllTransforms();

  // Only refresh countdown UI when it still matters.
  if (phase === PHASE.WAITING || phase === PHASE.COUNTDOWN_MUSIC) {
    updateSingaporeTime();
  }
};

window.addEventListener("resize", applyAllTransforms);

/* =============================================================================
   12) AUDIO TOGGLE (tap anywhere outside HUD)
   ========================================================================== */

let audioOn = false;

/**
 * Start background music in a mobile-safe way.
 * Called directly from user gesture handlers (no async/await there).
 */
function startAudio() {
  if (!bgm) return;

  try {
    const p = bgm.play();

    if (p && p.then) {
      p.then(() => {
        audioOn = true;
        audioBtn.textContent = "𝆕 On";
        console.log("[AUDIO] bgm started");
      }).catch(err => {
        console.warn("[AUDIO] bgm.play() failed:", err);
        audioOn = false;
        audioBtn.textContent = "𝆕 Off";
      });
    } else {
      // Non-promise browsers
      audioOn = true;
      audioBtn.textContent = "𝆕 On";
      console.log("[AUDIO] bgm started (no promise)");
    }
  } catch (err) {
    console.warn("[AUDIO] bgm.play() threw:", err);
    audioOn = false;
    audioBtn.textContent = "𝆕 Off";
  }
}

function stopAudio() {
  if (bgm) {
    try {
      bgm.pause();
    } catch (e) {
      console.warn("[AUDIO] bgm.pause() failed:", e);
    }
  }
  audioOn = false;
  audioBtn.textContent = "𝆕 Off";
}

/**
 * Returns true if the click/tap was on HUD controls
 * (so we don't toggle audio for those in the global pointer handler).
 */
function isSceneControl(target) {
  return (
    target === prevBtn ||
    target === nextBtn ||
    target === audioBtn ||
    target.closest?.("#hud")
  );
}

/**
 * Explicit audio button: toggles bgm directly.
 * NO async/await here so bgm.play() is seen as user-gesture on mobile.
 */
audioBtn.addEventListener("click", () => {
  if (!audioOn) {
    startAudio();
  } else {
    stopAudio();
  }
});

/**
 * Global tap anywhere outside HUD also toggles audio.
 * Again: handler is sync, no await, so mobile considers play() user-initiated.
 */
window.addEventListener("pointerdown", (e) => {
  if (isSceneControl(e.target)) return;

  if (!audioOn) {
    startAudio();
  } else {
    stopAudio();
  }
});

/* The rest of your audio helpers stay the same: stopAllAudio(), renderFinalBillboards(), playOutro() */
function stopAllAudio() {
  try { if (bgm) { bgm.pause(); bgm.currentTime = 0; } } catch {}
  try { if (countdownBgm) { countdownBgm.pause(); countdownBgm.currentTime = 0; } } catch {}
  try { if (outroBgm) { outroBgm.pause(); outroBgm.currentTime = 0; } } catch {}
}

function renderFinalBillboards() {
  setBillboardsWhite();

  if (bbLeftInner) {
    bbLeftInner.innerHTML = `
      <div class="bb-final">
        Happy New Year 2026
      </div>
    `;
  }

  if (bbRightInner) {
    bbRightInner.innerHTML = `
      <div class="bb-final">
        <span class="sub">I love you <span class="heart">♥</span><br>-Eu</span>
      </div>
    `;
  }
}

async function playOutro() {
  if (!outroBgm) return;
  try {
    outroBgm.currentTime = 0;
    outroBgm.loop = false;
    await outroBgm.play();
  } catch (e) {
    console.warn("Outro audio blocked until user gesture:", e);
  }
}
/* =============================================================================
   13) INIT
   ========================================================================== */

function setTargetSecondsFromNow(seconds) {
  targetTimeMs = Date.now() + seconds * 1000;
  console.warn(`[DEBUG] targetTimeMs set to now + ${seconds}s`);
}

if (debugBtn) {
  // Show debug button during development; hide on deploy
  debugBtn.style.display = "inline-block";

  debugBtn.addEventListener("click", () => {
    rebuildFireworks();
    const seconds = 5;
    setTargetSecondsFromNow(seconds);

    if (!sgTimer) startWaitingLoops();

    if (phase === PHASE.DONE || phase === PHASE.BELLS || phase === PHASE.BLACKOUT) {
        console.warn("[DEBUG] Already past WAITING/COUNTDOWN phases; reload page to retest cleanly.");
    } else {
        updateSingaporeTime();
    }
  });
}

function rebuildFireworks() {
  try {
    fireworks?.stop?.();   // some builds support stop()
    fireworks?.clear?.();  // clears particles/canvas
  } catch {}

  fireworks = null;
  initFireworks();
  console.warn("[FW] Rebuilt fireworks with latest options");
}

setScene(0);
initTargetTime();
startWaitingLoops();
startWindLoop();
initFireworks();