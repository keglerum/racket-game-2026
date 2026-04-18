const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const isEmbeddedBrowser = /electron|vscode/i.test(navigator.userAgent);
const urlParams = new URLSearchParams(window.location.search);

function hashStringToSeed(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeSeed(seedLike) {
  if (seedLike === null || seedLike === undefined || seedLike === "") {
    return 20260416;
  }
  const asNumber = Number(seedLike);
  if (Number.isFinite(asNumber)) {
    return (Math.floor(asNumber) >>> 0) || 1;
  }
  return hashStringToSeed(String(seedLike)) || 1;
}

let poleRngState = 1;

function setPoleSeed(seed) {
  poleRngState = (seed >>> 0) || 1;
}

function poleRandom() {
  poleRngState ^= poleRngState << 13;
  poleRngState ^= poleRngState >>> 17;
  poleRngState ^= poleRngState << 5;
  return (poleRngState >>> 0) / 4294967296;
}

function poleRandomRange(min, max) {
  return min + poleRandom() * (max - min);
}

// Clamp DPR to 1 so Retina displays don't render at 4× pixel count
canvas.width = 1280;
canvas.height = 720;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const timeEl = document.getElementById("time");
const moveModeEl = document.getElementById("moveMode");
const levelEl = document.getElementById("level");
const ballsEl = document.getElementById("balls");
const tipEl = document.getElementById("tip");
const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
const moveObstaclesToggleEl = document.getElementById("moveObstaclesToggle");
const layoutModeSelectEl = document.getElementById("layoutModeSelect");
const obstacleSetSelectEl = document.getElementById("obstacleSetSelect");
const challengeModeSelectEl = document.getElementById("challengeModeSelect");
const settingsHintEl = document.getElementById("settingsHint");
const applySettingsBtn = document.getElementById("applySettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const scoreboardBodyEl = document.getElementById("scoreboardBody");
const scoreboardSubEl = document.getElementById("scoreboardSub");

const SETTINGS_STORAGE_KEY = "racket-drift-settings-v1";
const SCOREBOARD_STORAGE_KEY = "racket-drift-scoreboard-v1";
const API_CONFIG_ENDPOINT = "/api/config";
const API_SCORES_ENDPOINT = "/api/scores";
const SCORE_TIME_WEIGHT = 2.5;
const MIN_BALL_RADIUS = 5;
const BALL_GROW_DELAY_STEPS = 130;
const BALL_GROW_RATE = 0.012;
const CHALLENGE_MODES = {
  normal: { label: "Normal", turbulenceBands: 0, fatigueThreshold: 999, oneWaySplitters: false, planeWind: false },
  hard: { label: "Hard", turbulenceBands: 1, fatigueThreshold: 34, oneWaySplitters: true, planeWind: true },
  expert: { label: "Expert", turbulenceBands: 2, fatigueThreshold: 24, oneWaySplitters: true, planeWind: true },
};

let OBSTACLE_DATABASE = {
  "season-1": { label: "Season 1", seed: 20260416 },
  "season-2": { label: "Season 2", seed: 20260701 },
};

function hasRemoteApi() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

function isDevHost() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

const LEVELS = [
  {
    label: 1,
    thresholdMass: 0,
    scrollSpeed: 2.45,
    gravity: 0.17,
    openingMin: 280,
    openingMax: 340,
    poleSpacingMin: 380,
    poleSpacingMax: 480,
    tipWidthMin: 18,
    tipWidthMax: 30,
    dragCoeff: 0.0018,
  },
  {
    label: 2,
    thresholdMass: 170,
    scrollSpeed: 2.75,
    gravity: 0.182,
    openingMin: 260,
    openingMax: 325,
    poleSpacingMin: 360,
    poleSpacingMax: 450,
    tipWidthMin: 20,
    tipWidthMax: 34,
    dragCoeff: 0.002,
  },
  {
    label: 3,
    thresholdMass: 390,
    scrollSpeed: 3.05,
    gravity: 0.194,
    openingMin: 240,
    openingMax: 300,
    poleSpacingMin: 340,
    poleSpacingMax: 430,
    tipWidthMin: 22,
    tipWidthMax: 38,
    dragCoeff: 0.0022,
  },
  {
    label: 4,
    thresholdMass: 700,
    scrollSpeed: 3.35,
    gravity: 0.205,
    openingMin: 220,
    openingMax: 285,
    poleSpacingMin: 320,
    poleSpacingMax: 410,
    tipWidthMin: 24,
    tipWidthMax: 42,
    dragCoeff: 0.00245,
  },
  {
    label: 5,
    thresholdMass: 1120,
    scrollSpeed: 3.65,
    gravity: 0.218,
    openingMin: 205,
    openingMax: 265,
    poleSpacingMin: 305,
    poleSpacingMax: 390,
    tipWidthMin: 26,
    tipWidthMax: 46,
    dragCoeff: 0.00265,
  },
];

function defaultLayoutMode() {
  const modeFromQuery = urlParams.get("layout");
  if (modeFromQuery === "public-fixed" || modeFromQuery === "dev-random") {
    return modeFromQuery;
  }
  return isDevHost() ? "dev-random" : "public-fixed";
}

function loadSettings() {
  const fallback = {
    obstaclesMove: true,
    layoutMode: defaultLayoutMode(),
    obstacleSetId: "season-1",
    challengeMode: "normal",
  };

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    const layoutMode = parsed.layoutMode === "dev-random" ? "dev-random" : "public-fixed";
    const obstacleSetId = OBSTACLE_DATABASE[parsed.obstacleSetId] ? parsed.obstacleSetId : "season-1";
    const challengeMode = CHALLENGE_MODES[parsed.challengeMode] ? parsed.challengeMode : "normal";
    return {
      obstaclesMove: parsed.obstaclesMove !== false,
      layoutMode,
      obstacleSetId,
      challengeMode,
    };
  } catch (_err) {
    return fallback;
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function loadScoreboard() {
  try {
    const raw = localStorage.getItem(SCOREBOARD_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_err) {
    return [];
  }
}

function saveScoreboard(rows) {
  localStorage.setItem(SCOREBOARD_STORAGE_KEY, JSON.stringify(rows));
}

async function loadRemoteConfigIfAvailable() {
  if (!hasRemoteApi()) {
    return;
  }

  try {
    const payload = await fetchJson(API_CONFIG_ENDPOINT);
    if (!payload || !Array.isArray(payload.obstacleSets)) {
      return;
    }

    const nextDatabase = {};
    payload.obstacleSets.forEach((setRow) => {
      if (!setRow || !setRow.setId) {
        return;
      }
      nextDatabase[setRow.setId] = {
        label: String(setRow.label || setRow.setId),
        seed: normalizeSeed(setRow.seed),
      };
    });

    if (Object.keys(nextDatabase).length > 0) {
      OBSTACLE_DATABASE = nextDatabase;
      if (!OBSTACLE_DATABASE[state.settings.obstacleSetId]) {
        const firstSetId = Object.keys(OBSTACLE_DATABASE)[0];
        state.settings.obstacleSetId = firstSetId;
      }
      saveSettings(state.settings);
    }
  } catch (_err) {
    // Keep local defaults when API/config is unavailable.
  }
}

async function loadRemoteScoreboardIfAvailable() {
  if (!hasRemoteApi()) {
    return;
  }

  try {
    const mode = encodeURIComponent(state.settings.challengeMode || "normal");
    const payload = await fetchJson(`${API_SCORES_ENDPOINT}?limit=50&mode=${mode}`);
    if (!payload || !Array.isArray(payload.scores)) {
      return;
    }

    state.scoreboard = payload.scores.map((row) => ({
      mass: Number(row.mass || 0),
      timeSec: Number(row.timeSec || 0),
      obstaclesMove: Boolean(row.obstaclesMove),
      layoutLabel: String(row.layoutLabel || "-"),
      rankScore: Number(row.rankScore || calculateRankScore(Number(row.mass || 0), Number(row.timeSec || 0))),
      challengeMode: CHALLENGE_MODES[row.challengeMode] ? row.challengeMode : "normal",
      seed: normalizeSeed(row.seed),
      createdAt: Number(row.createdAt || Date.now()),
    }));
    saveScoreboard(state.scoreboard);
    renderScoreboard();
  } catch (_err) {
    // Fall back to local scoreboard only.
  }
}

async function submitScoreIfAvailable(entry) {
  if (!hasRemoteApi()) {
    return false;
  }

  try {
    await fetchJson(API_SCORES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry),
    });
    return true;
  } catch (_err) {
    return false;
  }
}

function formatDuration(seconds) {
  return `${seconds.toFixed(1)}s`;
}

function calculateRankScore(mass, timeSec) {
  return mass + timeSec * SCORE_TIME_WEIGHT;
}

function currentChallengeMode() {
  return CHALLENGE_MODES[state.settings.challengeMode] ? state.settings.challengeMode : "normal";
}

function currentChallengeConfig() {
  return CHALLENGE_MODES[currentChallengeMode()];
}

function getCurrentObstacleSet() {
  return OBSTACLE_DATABASE[state.settings.obstacleSetId] || OBSTACLE_DATABASE["season-1"];
}

function getRunLayoutLabel() {
  if (state.settings.layoutMode === "dev-random") {
    return "Dev Random";
  }
  return `${getCurrentObstacleSet().label} (${state.poleSeed})`;
}

function chooseRunSeed() {
  const forcedSeed = urlParams.get("seed");
  if (forcedSeed !== null) {
    return normalizeSeed(forcedSeed);
  }

  if (state.settings.layoutMode === "dev-random") {
    const seed = Math.floor(Math.random() * 4294967296) >>> 0;
    return seed || 1;
  }

  return getCurrentObstacleSet().seed;
}

function renderScoreboard() {
  if (!scoreboardBodyEl) {
    return;
  }

  const mode = currentChallengeMode();
  const modeLabel = currentChallengeConfig().label;
  if (scoreboardSubEl) {
    scoreboardSubEl.textContent = `Rank Score = Mass + (Time x 2.5) • Mode: ${modeLabel}`;
  }

  const visibleRows = state.scoreboard.filter((row) => {
    const rowMode = CHALLENGE_MODES[row.challengeMode] ? row.challengeMode : "normal";
    return rowMode === mode;
  });

  if (visibleRows.length === 0) {
    scoreboardBodyEl.innerHTML = '<tr><td colspan="6">No runs yet. Finish a run to create score entries.</td></tr>';
    return;
  }

  scoreboardBodyEl.innerHTML = visibleRows
    .slice(0, 12)
    .map((row, index) => {
      const obstacles = row.obstaclesMove ? "Moving" : "Static";
      const rankScore = Number.isFinite(row.rankScore)
        ? row.rankScore
        : calculateRankScore(Number(row.mass || 0), Number(row.timeSec || 0));
      return `<tr>
        <td>${index + 1}</td>
        <td>${rankScore.toFixed(1)}</td>
        <td>${Number(row.mass || 0).toFixed(1)}</td>
        <td>${formatDuration(Number(row.timeSec || 0))}</td>
        <td>${obstacles}</td>
        <td>${row.layoutLabel || "-"}</td>
      </tr>`;
    })
    .join("");
}

function recordRunResult() {
  const rankScore = calculateRankScore(state.massScore, state.survivalTimeSec);
  const entry = {
    mass: state.massScore,
    timeSec: state.survivalTimeSec,
    rankScore,
    challengeMode: currentChallengeMode(),
    obstaclesMove: state.settings.obstaclesMove,
    layoutLabel: getRunLayoutLabel(),
    seed: state.poleSeed,
    createdAt: Date.now(),
  };

  state.scoreboard.push(entry);
  state.scoreboard.sort((a, b) => {
    const rankA = Number.isFinite(a.rankScore)
      ? a.rankScore
      : calculateRankScore(Number(a.mass || 0), Number(a.timeSec || 0));
    const rankB = Number.isFinite(b.rankScore)
      ? b.rankScore
      : calculateRankScore(Number(b.mass || 0), Number(b.timeSec || 0));
    if (rankB !== rankA) {
      return rankB - rankA;
    }
    if (b.mass !== a.mass) {
      return b.mass - a.mass;
    }
    return b.timeSec - a.timeSec;
  });
  state.scoreboard = state.scoreboard.slice(0, 50);
  saveScoreboard(state.scoreboard);
  renderScoreboard();

  void submitScoreIfAvailable(entry).then((savedRemotely) => {
    if (savedRemotely) {
      void loadRemoteScoreboardIfAvailable();
    }
  });
}

const state = {
  width: canvas.width,
  height: canvas.height,
  gravity: LEVELS[0].gravity,
  drag: 0.997,
  dragCoefficient: LEVELS[0].dragCoeff,
  scrollSpeed: LEVELS[0].scrollSpeed,
  pointerX: canvas.width * 0.5,
  pointerY: canvas.height * 0.62,
  pointerPrevX: canvas.width * 0.5,
  balls: [],
  poles: [],
  particles: [],
  score: 0,
  massScore: 0,
  best: Number(localStorage.getItem("racket-drift-best-mass") || 0),
  lost: false,
  time: 0,
  nextPoleAt: 250,
  levelIndex: 0,
  poleSerial: 0,
  tipFadeAt: 300,
  lowPerfMode: !isEmbeddedBrowser,
  frameDtMs: 16.7,
  lastTs: 0,
  stepScale: 1,
  poleSeed: 20260416,
  survivalTimeSec: 0,
  resultRecorded: false,
  settings: loadSettings(),
  scoreboard: loadScoreboard(),
  streakCount: 0,
  streakTimer: 0,
  massMultiplier: 1,
  hazardTimer: 0,
  hazardCooldown: 540,
  hazardSpeedBoost: 1,
  bossWaveTimer: 0,
  bossWaveCooldown: 0,
  bossWaveActive: false,
  bossWaveCount: 0,
  trailVariantUnlocked: false,
  planeSpawnTimer: 320,
  planes: [],
  turbulenceZones: [],
  racketStrain: 0,
  racketFatigueTimer: 0,
};

const racket = {
  x: canvas.width * 0.5,
  y: canvas.height * 0.72,
  width: 178,
  thickness: 16,
  angle: 0,
  glow: 0,
};

let audioCtx = null;
let musicStarted = false;
let musicStepTimer = null;

function ensureAudioContext() {
  if (audioCtx) {
    return audioCtx;
  }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  audioCtx = new Ctor();
  return audioCtx;
}

function unlockAudio() {
  const ctxRef = ensureAudioContext();
  if (!ctxRef) {
    return;
  }
  if (ctxRef.state === "suspended") {
    void ctxRef.resume();
  }
  startBackgroundMusic();
}

function startBackgroundMusic() {
  if (musicStarted) {
    return;
  }
  const ctxRef = ensureAudioContext();
  if (!ctxRef || ctxRef.state !== "running") {
    return;
  }

  musicStarted = true;

  const bassGain = ctxRef.createGain();
  bassGain.gain.value = 0.02;
  bassGain.connect(ctxRef.destination);

  const bassOsc = ctxRef.createOscillator();
  bassOsc.type = "sine";
  bassOsc.frequency.value = 73.42;
  bassOsc.connect(bassGain);
  bassOsc.start();

  const pattern = [0, 3, 7, 10, 7, 3, 12, 10];
  let step = 0;
  const base = 220;

  musicStepTimer = window.setInterval(() => {
    const t = ctxRef.currentTime;
    const noteGain = ctxRef.createGain();
    const noteOsc = ctxRef.createOscillator();
    const semitone = pattern[step % pattern.length];
    const freq = base * Math.pow(2, semitone / 12);

    noteOsc.type = "triangle";
    noteOsc.frequency.setValueAtTime(freq, t);
    noteGain.gain.setValueAtTime(0.0001, t);
    noteGain.gain.exponentialRampToValueAtTime(0.018, t + 0.02);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    noteOsc.connect(noteGain);
    noteGain.connect(ctxRef.destination);
    noteOsc.start(t);
    noteOsc.stop(t + 0.3);

    step += 1;
  }, 280);
}

function playBonk(strength = 1) {
  const ctxRef = ensureAudioContext();
  if (!ctxRef || ctxRef.state !== "running") {
    return;
  }

  const now = ctxRef.currentTime;
  const osc = ctxRef.createOscillator();
  const noise = ctxRef.createOscillator();
  const gain = ctxRef.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(160 + strength * 60, now);
  osc.frequency.exponentialRampToValueAtTime(74, now + 0.14);

  noise.type = "square";
  noise.frequency.setValueAtTime(220 + strength * 90, now);
  noise.frequency.exponentialRampToValueAtTime(110, now + 0.08);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16 * strength, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

  osc.connect(gain);
  noise.connect(gain);
  gain.connect(ctxRef.destination);

  osc.start(now);
  noise.start(now);
  osc.stop(now + 0.2);
  noise.stop(now + 0.12);
}

function playPlaneWhoosh(pan = 0, speed = 1) {
  const ctxRef = ensureAudioContext();
  if (!ctxRef || ctxRef.state !== "running") {
    return;
  }

  const now = ctxRef.currentTime;
  const osc = ctxRef.createOscillator();
  const gain = ctxRef.createGain();
  const panner = ctxRef.createStereoPanner();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(220 * speed, now);
  osc.frequency.exponentialRampToValueAtTime(120 * speed, now + 0.65);
  panner.pan.setValueAtTime(clamp(pan, -1, 1), now);
  panner.pan.linearRampToValueAtTime(clamp(-pan, -1, 1), now + 0.65);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.022, now + 0.06);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);

  osc.connect(gain);
  gain.connect(panner);
  panner.connect(ctxRef.destination);

  osc.start(now);
  osc.stop(now + 0.72);
}

function playBossCue() {
  const ctxRef = ensureAudioContext();
  if (!ctxRef || ctxRef.state !== "running") {
    return;
  }

  const now = ctxRef.currentTime;
  const gain = ctxRef.createGain();
  gain.gain.value = 0.03;
  gain.connect(ctxRef.destination);

  const a = ctxRef.createOscillator();
  a.type = "square";
  a.frequency.setValueAtTime(330, now);
  a.frequency.exponentialRampToValueAtTime(180, now + 0.18);
  a.connect(gain);
  a.start(now);
  a.stop(now + 0.2);

  const b = ctxRef.createOscillator();
  b.type = "square";
  b.frequency.setValueAtTime(392, now + 0.24);
  b.frequency.exponentialRampToValueAtTime(220, now + 0.44);
  b.connect(gain);
  b.start(now + 0.24);
  b.stop(now + 0.48);
}

function updateModeSystems() {
  const modeCfg = currentChallengeConfig();

  if (state.turbulenceZones.length !== modeCfg.turbulenceBands) {
    state.turbulenceZones = [];
    for (let i = 0; i < modeCfg.turbulenceBands; i += 1) {
      state.turbulenceZones.push({
        y: state.height * (0.26 + i * 0.22),
        h: 90,
        strength: 0.02 + i * 0.008,
      });
    }
  }
}

function spawnPlane() {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const y = randomRange(110, state.height * 0.46);
  const speed = randomRange(3.4, 5.2);
  const x = dir > 0 ? -80 : state.width + 80;
  const plane = {
    x,
    y,
    dir,
    speed,
    wing: randomRange(14, 22),
    color: randomRange(0, 1) > 0.5 ? "#d8f4ff" : "#ffe7af",
  };
  state.planes.push(plane);
  playPlaneWhoosh(dir > 0 ? -0.85 : 0.85, speed * 0.24);
}

function updatePlanes() {
  const modeCfg = currentChallengeConfig();
  state.planeSpawnTimer -= state.stepScale;
  if (state.planeSpawnTimer <= 0) {
    spawnPlane();
    state.planeSpawnTimer = randomRange(420, 760);
  }

  state.planes.forEach((plane) => {
    plane.x += plane.speed * plane.dir * state.stepScale;

    if (modeCfg.planeWind && currentLevel().label >= 3) {
      state.balls.forEach((ball) => {
        const nearX = Math.abs(ball.x - plane.x) < 120;
        const nearY = Math.abs(ball.y - plane.y) < 80;
        if (nearX && nearY) {
          ball.vx += plane.dir * 0.014 * state.stepScale;
          ball.vy += Math.sin(state.time * 0.16 + plane.x * 0.02) * 0.006 * state.stepScale;
        }
      });
    }
  });

  state.planes = state.planes.filter((plane) => plane.x > -120 && plane.x < state.width + 120);
}

function drawPlanes() {
  state.planes.forEach((plane) => {
    ctx.save();
    ctx.translate(plane.x, plane.y);
    if (plane.dir < 0) {
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = plane.color;
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(20, -5);
    ctx.lineTo(20, 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(190, 241, 255, 0.82)";
    ctx.fillRect(-4, -plane.wing * 0.2, 14, plane.wing * 0.4);
    ctx.restore();
  });
}

function updateHazardsAndBoss() {
  if (state.bossWaveActive) {
    state.bossWaveTimer -= state.stepScale;
    if (state.bossWaveTimer <= 0) {
      state.bossWaveActive = false;
      state.bossWaveCooldown = 900;
      state.massScore += 95;
      state.trailVariantUnlocked = true;
      emitParticles(racket.x, racket.y - 24, 36, 188);
    }
    return;
  }

  state.bossWaveCooldown = Math.max(0, state.bossWaveCooldown - state.stepScale);
  if (state.bossWaveCooldown <= 0 && currentLevel().label >= 3 && currentLevel().label % 2 === 1) {
    state.bossWaveActive = true;
    state.bossWaveTimer = 620;
    state.bossWaveCount += 1;
    playBossCue();
  }

  if (state.hazardTimer > 0) {
    state.hazardTimer -= state.stepScale;
    if (state.hazardTimer <= 0) {
      state.hazardSpeedBoost = 1;
      state.massScore += 24;
      emitParticles(racket.x, racket.y - 12, 14, 144);
    }
  } else {
    state.hazardCooldown -= state.stepScale;
    if (state.hazardCooldown <= 0 && currentLevel().label >= 2) {
      state.hazardTimer = randomRange(280, 430);
      state.hazardCooldown = randomRange(520, 760);
      state.hazardSpeedBoost = currentChallengeMode() === "expert" ? 1.58 : 1.34;
      playBossCue();
    }
  }
}

function drawChallengeOverlays() {
  if (state.turbulenceZones.length > 0 && currentChallengeMode() !== "normal") {
    state.turbulenceZones.forEach((zone, idx) => {
      const alpha = 0.03 + Math.sin(state.time * 0.04 + idx) * 0.01;
      ctx.fillStyle = `rgba(154, 220, 255, ${alpha})`;
      ctx.fillRect(0, zone.y, state.width, zone.h);
    });
  }

  if (state.bossWaveActive) {
    const pulse = 0.1 + 0.08 * Math.sin(state.time * 0.14);
    ctx.fillStyle = `rgba(255, 96, 114, ${pulse})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function currentLevel() {
  return LEVELS[state.levelIndex];
}

function refreshLevelFromMass() {
  let nextIndex = state.levelIndex;
  for (let i = LEVELS.length - 1; i >= 0; i -= 1) {
    if (state.massScore >= LEVELS[i].thresholdMass) {
      nextIndex = i;
      break;
    }
  }

  if (nextIndex !== state.levelIndex) {
    state.levelIndex = nextIndex;
    emitParticles(racket.x, racket.y - 16, 34, 160 + nextIndex * 12);
  }

  const level = currentLevel();
  const levelLerp = 1 - Math.pow(1 - 0.06, state.stepScale);
  state.gravity += (level.gravity - state.gravity) * levelLerp;
  state.scrollSpeed += (level.scrollSpeed - state.scrollSpeed) * levelLerp;
}

function spawnBall(x, y, vx = 0, vy = -2.2, radius = 12, splitCooldown = 10) {
  const hue = Math.floor(randomRange(70, 88));
  const mass = Math.PI * radius * radius * 0.026;
  const targetRadius = Math.min(12, radius * 1.45);
  state.balls.push({
    x,
    y,
    prevX: x,
    prevY: y,
    vx,
    vy,
    radius,
    mass,
    area: Math.PI * radius * radius,
    hue,
    alive: true,
    splitCooldown,
    trail: [],
    spin: randomRange(-0.05, 0.05),
    spinAngle: randomRange(0, Math.PI * 2),
    z: 0,
    vz: 0,
    bonkCooldown: 0,
    growthTimer: 0,
    targetRadius,
    minFxCooldown: randomRange(8, 18),
    scoredPoles: new Set(),
  });
}

function spawnPole() {
  const level = currentLevel();
  const tipHeight = 82;
  const x = state.width + 120;
  const tipWidth = poleRandomRange(level.tipWidthMin, level.tipWidthMax);
  const bodyWidth = poleRandomRange(44, 86);
  const opening = poleRandomRange(level.openingMin, level.openingMax);
  let driftAmp = poleRandomRange(10, 22);
  const driftSpeed = poleRandomRange(0.018, 0.03);
  const driftPhase = poleRandomRange(0, Math.PI * 2);

  const openHalf = opening * 0.5;
  const margin = tipHeight + openHalf + 16;

  let minGapY = margin + driftAmp + 2;
  let maxGapY = state.height - margin - driftAmp - 2;

  if (minGapY >= maxGapY) {
    driftAmp = Math.max(3, Math.min(10, state.height * 0.5 - margin - 4));
    minGapY = margin + driftAmp + 2;
    maxGapY = state.height - margin - driftAmp - 2;
  }

  const gapY = minGapY < maxGapY ? poleRandomRange(minGapY, maxGapY) : state.height * 0.5;

  state.poles.push({
    id: state.poleSerial,
    x,
    passed: false,
    bodyWidth,
    tipWidth,
    opening,
    baseGapY: gapY,
    gapY,
    driftAmp,
    driftSpeed,
    driftPhase,
    pulsePhase: poleRandomRange(0, Math.PI * 2),
    oneWayDir: currentChallengeConfig().oneWaySplitters ? (Math.random() < 0.5 ? -1 : 1) : 0,
  });
  state.poleSerial += 1;
}

function getPoleOpening(pole) {
  if (!pole) {
    return 260;
  }
  const base = pole.opening;
  if (currentChallengeMode() === "normal") {
    return base;
  }
  const pulse = 0.85 + Math.sin(state.time * 0.03 + pole.pulsePhase) * 0.14;
  return clamp(base * pulse, 150, base + 14);
}

function resetGame() {
  updateModeSystems();
  state.poleSeed = chooseRunSeed();
  setPoleSeed(state.poleSeed);
  state.balls.length = 0;
  state.poles.length = 0;
  state.particles.length = 0;
  state.score = 0;
  state.massScore = 0;
  state.time = 0;
  state.levelIndex = 0;
  state.gravity = LEVELS[0].gravity;
  state.scrollSpeed = LEVELS[0].scrollSpeed;
  state.dragCoefficient = LEVELS[0].dragCoeff;
  state.nextPoleAt = 260;
  state.poleSerial = 0;
  state.lost = false;
  state.survivalTimeSec = 0;
  state.resultRecorded = false;
  state.streakCount = 0;
  state.streakTimer = 0;
  state.massMultiplier = 1;
  state.hazardTimer = 0;
  state.hazardCooldown = 540;
  state.hazardSpeedBoost = 1;
  state.bossWaveTimer = 0;
  state.bossWaveActive = false;
  state.planes.length = 0;
  state.planeSpawnTimer = randomRange(220, 420);
  state.racketStrain = 0;
  state.racketFatigueTimer = 0;
  spawnBall(state.width * 0.5, state.height * 0.48);
  for (let i = 0; i < 3; i += 1) {
    spawnPole();
    state.poles[i].x += i * 360;
  }
}

function drawBackground() {
  const levelMix = state.levelIndex / Math.max(1, LEVELS.length - 1);
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#1c4a66");
  gradient.addColorStop(0.56, "#1a4942");
  gradient.addColorStop(1, "#0f273b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

  const aurora = ctx.createRadialGradient(
    state.width * 0.22,
    state.height * 0.16,
    40,
    state.width * 0.22,
    state.height * 0.16,
    state.width * 0.62,
  );
  aurora.addColorStop(0, "rgba(255, 236, 177, 0.28)");
  aurora.addColorStop(0.5, "rgba(116, 242, 214, 0.14)");
  aurora.addColorStop(1, "rgba(116, 242, 214, 0)");
  ctx.fillStyle = aurora;
  ctx.fillRect(0, 0, state.width, state.height);

  const sun = ctx.createRadialGradient(
    state.width * (0.76 - levelMix * 0.08),
    state.height * (0.18 + levelMix * 0.02),
    20,
    state.width * (0.76 - levelMix * 0.08),
    state.height * (0.18 + levelMix * 0.02),
    180,
  );
  sun.addColorStop(0, "rgba(255, 216, 156, 0.45)");
  sun.addColorStop(1, "rgba(255, 216, 156, 0)");
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, state.width, state.height);

  const beamCount = state.lowPerfMode ? 1 : 3;
  for (let i = 0; i < beamCount; i += 1) {
    const beamY = (state.time * (0.34 + i * 0.08) + i * 190) % (state.height + 220) - 110;
    const beamH = 80 + i * 18;
    const beam = ctx.createLinearGradient(0, beamY, 0, beamY + beamH);
    beam.addColorStop(0, "rgba(166, 245, 236, 0)");
    beam.addColorStop(0.5, "rgba(166, 245, 236, 0.055)");
    beam.addColorStop(1, "rgba(166, 245, 236, 0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, beamY, state.width, beamH);
  }

  const starCount = state.lowPerfMode ? 12 : 28;
  for (let i = 0; i < starCount; i += 1) {
    const sx = (i * 311 + state.time * (0.06 + i * 0.002)) % (state.width + 40) - 20;
    const sy = 45 + (i * 71) % Math.floor(state.height * 0.5);
    ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 4) * 0.02})`;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }

  for (let i = 0; i < 8; i += 1) {
    const y = state.height * (0.22 + i * 0.06) + Math.sin(state.time * 0.01 + i * 0.9) * 6;
    ctx.fillStyle = `rgba(255,255,255,${0.03 + i * 0.004})`;
    ctx.fillRect(0, y, state.width, 1.2);
  }

  if (!state.lowPerfMode) {
    for (let i = 0; i < 6; i += 1) {
      const cloudX = (state.width - ((state.time * (0.22 + i * 0.07)) % (state.width + 340))) - 170;
      const cloudY = 110 + i * 56 + Math.sin(state.time * 0.008 + i * 0.6) * 8;
      const cloudW = 220 + i * 18;
      const cloudH = 46 + i * 5;
      const cloud = ctx.createRadialGradient(cloudX, cloudY, 24, cloudX, cloudY, cloudW * 0.7);
      cloud.addColorStop(0, "rgba(230, 255, 250, 0.08)");
      cloud.addColorStop(1, "rgba(230, 255, 250, 0)");
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.ellipse(cloudX, cloudY, cloudW, cloudH, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "rgba(8, 25, 36, 0.34)";
  ctx.beginPath();
  ctx.moveTo(0, state.height * 0.78);
  for (let x = 0; x <= state.width; x += 60) {
    const y = state.height * 0.8 + Math.sin((x + state.time * 0.9) * 0.01) * 18;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(state.width, state.height);
  ctx.lineTo(0, state.height);
  ctx.closePath();
  ctx.fill();

  if (!state.lowPerfMode) {
    for (let i = 0; i < 26; i += 1) {
      const stripeY = state.height * 0.62 + i * 6;
      const alpha = 0.022 - i * 0.0005;
      if (alpha <= 0) {
        continue;
      }
      ctx.fillStyle = `rgba(154, 226, 224, ${alpha})`;
      ctx.fillRect(0, stripeY, state.width, 1);
    }
  }

  if (!state.lowPerfMode) {
    const vignette = ctx.createRadialGradient(
      state.width * 0.5,
      state.height * 0.46,
      state.width * 0.18,
      state.width * 0.5,
      state.height * 0.46,
      state.width * 0.62,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(5, 10, 18, 0.38)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, state.width, state.height);
  }
}

function drawRacket() {
  const speedX = state.pointerX - state.pointerPrevX;
  const targetAngle = Math.max(-0.46, Math.min(0.46, speedX * 0.045));
  const modeCfg = currentChallengeConfig();

  if (Math.abs(targetAngle) > 0.41) {
    state.racketStrain += 0.95 * state.stepScale;
  } else {
    state.racketStrain = Math.max(0, state.racketStrain - 0.55 * state.stepScale);
  }

  if (state.racketFatigueTimer <= 0 && state.racketStrain >= modeCfg.fatigueThreshold) {
    state.racketFatigueTimer = 180;
    state.racketStrain = modeCfg.fatigueThreshold * 0.4;
  }
  state.racketFatigueTimer = Math.max(0, state.racketFatigueTimer - state.stepScale);

  const fatigueFactor = state.racketFatigueTimer > 0 ? 0.64 : 1;
  const angleLerp = (1 - Math.pow(1 - 0.32, state.stepScale)) * fatigueFactor;
  const xLerp = (1 - Math.pow(1 - 0.38, state.stepScale)) * fatigueFactor;
  const yLerp = (1 - Math.pow(1 - 0.18, state.stepScale)) * fatigueFactor;
  racket.angle += (targetAngle - racket.angle) * angleLerp;
  racket.x += (state.pointerX - racket.x) * xLerp;
  racket.y += (state.pointerY - racket.y) * yLerp;
  racket.glow = Math.min(1, Math.abs(targetAngle) * 2.2);

  ctx.save();
  ctx.translate(racket.x, racket.y);
  ctx.rotate(racket.angle);

  if (!state.lowPerfMode) {
    ctx.shadowColor = `rgba(71, 232, 194, ${0.26 + racket.glow * 0.4})`;
    ctx.shadowBlur = 18 + racket.glow * 30;
  }

  const paddleGradient = ctx.createLinearGradient(-racket.width * 0.5, 0, racket.width * 0.5, 0);
  paddleGradient.addColorStop(0, "#dfb152");
  paddleGradient.addColorStop(0.48, "#fff4cc");
  paddleGradient.addColorStop(1, "#e18f3f");

  ctx.fillStyle = paddleGradient;
  roundRect(-racket.width * 0.5, -racket.thickness * 0.5, racket.width, racket.thickness, racket.thickness * 0.5);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";
  ctx.lineWidth = 1.2;
  roundRect(
    -racket.width * 0.49,
    -racket.thickness * 0.39,
    racket.width * 0.98,
    racket.thickness * 0.78,
    racket.thickness * 0.44,
  );
  ctx.stroke();

  ctx.fillStyle = "rgba(86, 48, 17, 0.32)";
  for (let i = -3; i <= 3; i += 1) {
    const x = (i / 3) * (racket.width * 0.4);
    ctx.fillRect(x - 1.2, -racket.thickness * 0.28, 2.4, racket.thickness * 0.56);
  }

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(18, 49, 69, 0.65)";
  ctx.beginPath();
  ctx.ellipse(0, 8, racket.width * 0.48, racket.thickness * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawPoles() {
  state.poles.forEach((pole) => {
    drawPoleSegment(pole, true);
    drawPoleSegment(pole, false);
    drawGoalGate(pole);
  });
}

function drawGoalGate(pole) {
  const opening = getPoleOpening(pole);
  const gapTop = pole.gapY - opening * 0.5;
  const gapBottom = pole.gapY + opening * 0.5;
  const gateX = pole.x + pole.bodyWidth + 7;
  const glow = 8 + Math.sin(state.time * 0.08 + pole.id) * 2;

  const gateGlow = ctx.createLinearGradient(gateX - 3, gapTop, gateX + 3, gapBottom);
  gateGlow.addColorStop(0, "rgba(173, 255, 238, 0.18)");
  gateGlow.addColorStop(0.5, "rgba(120, 255, 234, 0.78)");
  gateGlow.addColorStop(1, "rgba(173, 255, 238, 0.18)");

  ctx.strokeStyle = gateGlow;
  ctx.lineWidth = 2;
  if (!state.lowPerfMode) {
    ctx.shadowColor = "rgba(120, 255, 234, 0.8)";
    ctx.shadowBlur = glow;
  }
  ctx.beginPath();
  ctx.moveTo(gateX, gapTop + 7);
  ctx.lineTo(gateX, gapBottom - 7);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.fillStyle = "rgba(152, 255, 241, 0.24)";
  ctx.beginPath();
  ctx.arc(gateX, gapTop + 8, 2.4, 0, Math.PI * 2);
  ctx.arc(gateX, gapBottom - 8, 2.4, 0, Math.PI * 2);
  ctx.fill();

  if (gateX > state.width * 0.32 && gateX < state.width - 70 && state.time < 1300) {
    ctx.fillStyle = "rgba(194, 255, 240, 0.9)";
    ctx.font = "700 14px Avenir Next";
    ctx.textAlign = "left";
    ctx.fillText("MASS GATE", gateX + 8, gapTop + 20);
  }

  if (pole.oneWayDir !== 0 && gateX > -80 && gateX < state.width + 40) {
    ctx.fillStyle = "rgba(255, 240, 208, 0.82)";
    ctx.font = "700 13px Avenir Next";
    ctx.textAlign = "left";
    ctx.fillText(pole.oneWayDir < 0 ? "SPLIT ↓" : "SPLIT ↑", gateX + 8, pole.gapY + (pole.oneWayDir < 0 ? -12 : 16));
  }
}

function drawPoleSegment(pole, top) {
  const tipH = 82;
  const centerY = pole.gapY;
  const openHalf = getPoleOpening(pole) * 0.5;

  const bodyTop = top ? 0 : centerY + openHalf + tipH;
  const bodyBottom = top ? centerY - openHalf - tipH : state.height;
  const bodyHeight = bodyBottom - bodyTop;
  if (bodyHeight > 0) {
    const bodyGradient = ctx.createLinearGradient(pole.x, 0, pole.x + pole.bodyWidth, 0);
    bodyGradient.addColorStop(0, "#1f565e");
    bodyGradient.addColorStop(0.5, "#79c2af");
    bodyGradient.addColorStop(1, "#234850");
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(pole.x, bodyTop, pole.bodyWidth, bodyHeight);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(pole.x + 4, bodyTop, 5, bodyHeight);

    ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
    for (let y = bodyTop + 8; y < bodyBottom; y += 18) {
      ctx.fillRect(pole.x + 1, y, pole.bodyWidth - 2, 2);
    }
  }

  const tipBaseY = top ? centerY - openHalf - tipH : centerY + openHalf + tipH;
  const tipPointY = top ? centerY - openHalf : centerY + openHalf;
  const tipLeft = pole.x + pole.bodyWidth * 0.5 - pole.tipWidth * 0.5;
  const tipRight = pole.x + pole.bodyWidth * 0.5 + pole.tipWidth * 0.5;

  ctx.beginPath();
  ctx.moveTo(tipLeft, tipBaseY);
  ctx.lineTo(tipRight, tipBaseY);
  ctx.lineTo(pole.x + pole.bodyWidth * 0.5, tipPointY);
  ctx.closePath();

  const tipGradient = ctx.createLinearGradient(0, top ? tipBaseY : tipPointY, 0, top ? tipPointY : tipBaseY);
  tipGradient.addColorStop(0, "#ffd7a9");
  tipGradient.addColorStop(0.55, "#ff9868");
  tipGradient.addColorStop(1, "#ff5f56");
  ctx.fillStyle = tipGradient;
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 249, 224, 0.42)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pole.x + pole.bodyWidth * 0.5, tipPointY + (top ? 5 : -5));
  ctx.lineTo(tipLeft + 3, tipBaseY + (top ? -3 : 3));
  ctx.moveTo(pole.x + pole.bodyWidth * 0.5, tipPointY + (top ? 5 : -5));
  ctx.lineTo(tipRight - 3, tipBaseY + (top ? -3 : 3));
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(pole.x + pole.bodyWidth * 0.5 - 1, bodyTop, 2, bodyHeight);

  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  ctx.fillRect(pole.x + pole.bodyWidth - 6, bodyTop, 6, bodyHeight);
}

function drawBalls() {
  state.balls.forEach((ball) => {
    const renderScale = 1 + ball.z * 0.075;
    const renderRadius = ball.radius * renderScale;
    const renderY = ball.y + ball.z * 0.55;
    const minPulse = 0.5 + 0.5 * Math.sin(state.time * 0.2 + ball.x * 0.03);
    const isAtMin = ball.radius <= MIN_BALL_RADIUS + 0.06;

    if (state.lowPerfMode) {
      const simpleGlow = ctx.createRadialGradient(
        ball.x - renderRadius * 0.24,
        renderY - renderRadius * 0.28,
        renderRadius * 0.22,
        ball.x,
        renderY,
        renderRadius * 1.2,
      );
      simpleGlow.addColorStop(0, `hsla(${ball.hue - 4}, 94%, 72%, 0.98)`);
      simpleGlow.addColorStop(0.68, `hsla(${ball.hue}, 90%, 56%, 0.96)`);
      simpleGlow.addColorStop(1, `hsla(${ball.hue + 4}, 80%, 40%, 0.22)`);
      ctx.fillStyle = simpleGlow;
      ctx.beginPath();
      ctx.arc(ball.x, renderY, renderRadius, 0, Math.PI * 2);
      ctx.fill();

      if (isAtMin) {
        ctx.strokeStyle = `rgba(170, 255, 227, ${0.28 + minPulse * 0.3})`;
        ctx.lineWidth = Math.max(0.8, renderRadius * 0.12);
        ctx.beginPath();
        ctx.arc(ball.x, renderY, renderRadius * (1.18 + minPulse * 0.08), 0, Math.PI * 2);
        ctx.stroke();
      }

      const seamTilt = ball.spinAngle + Math.atan2(ball.vy, ball.vx) * 0.1;
      ctx.save();
      ctx.translate(ball.x, renderY);
      ctx.rotate(seamTilt);

      ctx.strokeStyle = "rgba(16, 20, 15, 0.74)";
      ctx.lineWidth = Math.max(0.9, renderRadius * 0.15);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(0, -renderRadius * 0.03, renderRadius * 0.84, Math.PI * 0.14, Math.PI * 1.22);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, renderRadius * 0.03, renderRadius * 0.84, -Math.PI * 1.22, -Math.PI * 0.14);
      ctx.stroke();

      ctx.strokeStyle = "rgba(56, 62, 48, 0.52)";
      ctx.lineWidth = Math.max(0.7, renderRadius * 0.09);
      ctx.beginPath();
      ctx.arc(0, -renderRadius * 0.03, renderRadius * 0.84, Math.PI * 0.17, Math.PI * 1.19);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, renderRadius * 0.03, renderRadius * 0.84, -Math.PI * 1.19, -Math.PI * 0.17);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (ball.trail.length > 1) {
      for (let i = 0; i < ball.trail.length; i += 1) {
        const t = ball.trail[i];
        const alpha = (i + 1) / ball.trail.length;
        const trailHue = state.trailVariantUnlocked ? ball.hue + 94 : ball.hue + 16;
        const trailSat = state.trailVariantUnlocked ? 92 : 90;
        const trailLight = state.trailVariantUnlocked ? 72 : 66;
        ctx.fillStyle = `hsla(${trailHue}, ${trailSat}%, ${trailLight}%, ${alpha * 0.08})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, Math.max(1.2, ball.radius * alpha * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const glow = ctx.createRadialGradient(
      ball.x - renderRadius * 0.3,
      renderY - renderRadius * 0.36,
      renderRadius * 0.18,
      ball.x,
      renderY,
      renderRadius * 1.55,
    );
    glow.addColorStop(0, `hsla(${ball.hue - 5}, 96%, 74%, 0.98)`);
    glow.addColorStop(0.62, `hsla(${ball.hue}, 90%, 57%, 0.95)`);
    glow.addColorStop(1, `hsla(${ball.hue + 4}, 84%, 34%, 0.18)`);
    ctx.fillStyle = glow;

    ctx.beginPath();
    ctx.arc(ball.x, renderY, renderRadius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    if (isAtMin) {
      ctx.strokeStyle = `rgba(154, 255, 226, ${0.3 + minPulse * 0.34})`;
      ctx.lineWidth = Math.max(1, renderRadius * 0.13);
      ctx.beginPath();
      ctx.arc(ball.x, renderY, renderRadius * (1.22 + minPulse * 0.12), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(250, 255, 214, 0.62)";
    ctx.beginPath();
    ctx.arc(ball.x - renderRadius * 0.28, renderY - renderRadius * 0.32, renderRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Draw classic tennis seams clipped to the sphere for a realistic look.
    const seamTilt = ball.spinAngle + Math.atan2(ball.vy, ball.vx) * 0.1;
    ctx.save();
    ctx.translate(ball.x, renderY);
    ctx.rotate(seamTilt);
    ctx.beginPath();
    ctx.arc(0, 0, renderRadius * 1.26, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = "rgba(18, 23, 16, 0.78)";
    ctx.lineWidth = Math.max(2.2, renderRadius * 0.24);
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(-renderRadius * 1.1, -renderRadius * 0.46);
    ctx.bezierCurveTo(
      -renderRadius * 0.2,
      -renderRadius * 0.92,
      renderRadius * 0.2,
      -renderRadius * 0.92,
      renderRadius * 1.1,
      -renderRadius * 0.46,
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-renderRadius * 1.1, renderRadius * 0.46);
    ctx.bezierCurveTo(
      -renderRadius * 0.2,
      renderRadius * 0.92,
      renderRadius * 0.2,
      renderRadius * 0.92,
      renderRadius * 1.1,
      renderRadius * 0.46,
    );
    ctx.stroke();

    ctx.strokeStyle = "rgba(60, 67, 50, 0.55)";
    ctx.lineWidth = Math.max(1.2, renderRadius * 0.14);

    ctx.beginPath();
    ctx.moveTo(-renderRadius * 1.06, -renderRadius * 0.46);
    ctx.bezierCurveTo(
      -renderRadius * 0.18,
      -renderRadius * 0.86,
      renderRadius * 0.18,
      -renderRadius * 0.86,
      renderRadius * 1.06,
      -renderRadius * 0.46,
    );
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-renderRadius * 1.06, renderRadius * 0.46);
    ctx.bezierCurveTo(
      -renderRadius * 0.18,
      renderRadius * 0.86,
      renderRadius * 0.18,
      renderRadius * 0.86,
      renderRadius * 1.06,
      renderRadius * 0.46,
    );
    ctx.stroke();
    ctx.restore();
  });
}

function emitParticles(x, y, n, hue = 28) {
  for (let i = 0; i < n; i += 1) {
    state.particles.push({
      x,
      y,
      vx: randomRange(-2.4, 2.4),
      vy: randomRange(-2.8, 1.6),
      life: randomRange(18, 44),
      hue: hue + randomRange(-16, 20),
    });
  }
}

function updateParticles() {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= state.stepScale;
    p.x += p.vx * state.stepScale;
    p.y += p.vy * state.stepScale;
    p.vy += 0.06 * state.stepScale;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  state.particles.forEach((p) => {
    const a = Math.min(1, p.life / 40);
    ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1 + a * 2.1, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updatePoles() {
  const level = currentLevel();
  const bossBoost = state.bossWaveActive ? 1.35 : 1;
  const speedFactor = state.hazardSpeedBoost * bossBoost;
  const scroll = state.scrollSpeed * speedFactor;

  state.poles.forEach((pole) => {
    pole.x -= scroll * state.stepScale;

    if (!pole.passed && pole.x + pole.bodyWidth < racket.x) {
      pole.passed = true;
      state.score += 1;
    }
  });

  state.poles = state.poles.filter((pole) => pole.x + pole.bodyWidth + 80 > 0);

  state.nextPoleAt -= scroll * state.stepScale;
  if (state.nextPoleAt <= 0) {
    spawnPole();
    const spacingScale = state.bossWaveActive ? 0.78 : 1;
    state.nextPoleAt = poleRandomRange(level.poleSpacingMin * spacingScale, level.poleSpacingMax * spacingScale);
  }
}

function animatePoleDrift() {
  const tipHeight = 82;
  state.poles.forEach((pole) => {
    if (!state.settings.obstaclesMove) {
      pole.gapY = pole.baseGapY;
      return;
    }

    const openHalf = pole.opening * 0.5;
    const margin = tipHeight + openHalf + 16;
    pole.gapY = clamp(
      pole.baseGapY + Math.sin(state.time * pole.driftSpeed + pole.driftPhase) * pole.driftAmp,
      margin,
      state.height - margin,
    );
  });
}

function ballIntersectsSpike(ball, pole) {
  const opening = getPoleOpening(pole);
  const gapTop = pole.gapY - opening * 0.5;
  const gapBottom = pole.gapY + opening * 0.5;
  const tipHeight = 82;

  const topTip = {
    ax: pole.x + pole.bodyWidth * 0.5 - pole.tipWidth * 0.5,
    ay: gapTop - tipHeight,
    bx: pole.x + pole.bodyWidth * 0.5 + pole.tipWidth * 0.5,
    by: gapTop - tipHeight,
    cx: pole.x + pole.bodyWidth * 0.5,
    cy: gapTop,
  };

  const bottomTip = {
    ax: pole.x + pole.bodyWidth * 0.5 - pole.tipWidth * 0.5,
    ay: gapBottom + tipHeight,
    bx: pole.x + pole.bodyWidth * 0.5 + pole.tipWidth * 0.5,
    by: gapBottom + tipHeight,
    cx: pole.x + pole.bodyWidth * 0.5,
    cy: gapBottom,
  };

  const samples = [
    { x: ball.x, y: ball.y },
    { x: ball.x + ball.radius * 0.55, y: ball.y },
    { x: ball.x - ball.radius * 0.55, y: ball.y },
    { x: ball.x, y: ball.y + ball.radius * 0.55 },
    { x: ball.x, y: ball.y - ball.radius * 0.55 },
  ];

  return samples.some((s) => pointInTriangle(s.x, s.y, topTip) || pointInTriangle(s.x, s.y, bottomTip));
}

function pointInTriangle(px, py, t) {
  const denominator = (t.by - t.cy) * (t.ax - t.cx) + (t.cx - t.bx) * (t.ay - t.cy);
  if (Math.abs(denominator) < 1e-6) {
    return false;
  }
  const a = ((t.by - t.cy) * (px - t.cx) + (t.cx - t.bx) * (py - t.cy)) / denominator;
  const b = ((t.cy - t.ay) * (px - t.cx) + (t.ax - t.cx) * (py - t.cy)) / denominator;
  const c = 1 - a - b;
  return a >= 0 && b >= 0 && c >= 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveCircleRectCollision(ball, left, top, right, bottom, bounce = 0.45) {
  const closestX = clamp(ball.x, left, right);
  const closestY = clamp(ball.y, top, bottom);
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const distSq = dx * dx + dy * dy;
  const rSq = ball.radius * ball.radius;

  if (distSq >= rSq) {
    return false;
  }

  let nx;
  let ny;

  if (distSq > 1e-7) {
    const invDist = 1 / Math.sqrt(distSq);
    nx = dx * invDist;
    ny = dy * invDist;
  } else {
    const toLeft = Math.abs(ball.x - left);
    const toRight = Math.abs(right - ball.x);
    const toTop = Math.abs(ball.y - top);
    const toBottom = Math.abs(bottom - ball.y);
    const minEdge = Math.min(toLeft, toRight, toTop, toBottom);

    if (minEdge === toLeft) {
      nx = -1;
      ny = 0;
    } else if (minEdge === toRight) {
      nx = 1;
      ny = 0;
    } else if (minEdge === toTop) {
      nx = 0;
      ny = -1;
    } else {
      nx = 0;
      ny = 1;
    }
  }

  const penetration = ball.radius - Math.sqrt(Math.max(distSq, 1e-8));
  ball.x += nx * (penetration + 0.25);
  ball.y += ny * (penetration + 0.25);

  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + bounce) * vn * nx;
    ball.vy -= (1 + bounce) * vn * ny;
  }

  return true;
}

function splitBall(ball) {
  if (ball.splitCooldown > 0) {
    return;
  }

  if (ball.radius < 6) {
    // Tiny balls should still be affected by splitters: remove them on spike hit.
    ball.alive = false;
    emitParticles(ball.x, ball.y, 14, ball.hue + 12);
    return;
  }

  ball.alive = false;
  emitParticles(ball.x, ball.y, 22, ball.hue + 8);

  const newRadius = Math.max(MIN_BALL_RADIUS, ball.radius * 0.72);
  const speed = Math.hypot(ball.vx, ball.vy) + 0.8;

  spawnBall(ball.x - 4, ball.y, -Math.abs(speed * 0.52), -2.5, newRadius, 14);
  spawnBall(ball.x + 4, ball.y, Math.abs(speed * 0.52), -2.5, newRadius, 14);
}

function worldToRacketLocal(x, y) {
  const dx = x - racket.x;
  const dy = y - racket.y;
  return {
    x: dx * Math.cos(-racket.angle) - dy * Math.sin(-racket.angle),
    y: dx * Math.sin(-racket.angle) + dy * Math.cos(-racket.angle),
  };
}

function racketLocalToWorld(x, y) {
  return {
    x: racket.x + x * Math.cos(racket.angle) - y * Math.sin(racket.angle),
    y: racket.y + x * Math.sin(racket.angle) + y * Math.cos(racket.angle),
  };
}

function updateBalls() {
  const maxY = state.height + 120;
  const dragScale = Math.pow(state.drag, state.stepScale);
  const spinDamping = Math.pow(0.992, state.stepScale);
  const zDamping = Math.pow(0.982, state.stepScale);

  state.balls.forEach((ball) => {
    ball.splitCooldown = Math.max(0, ball.splitCooldown - state.stepScale);
    ball.bonkCooldown = Math.max(0, ball.bonkCooldown - state.stepScale);
    ball.minFxCooldown = Math.max(0, ball.minFxCooldown - state.stepScale);
    ball.prevX = ball.x;
    ball.prevY = ball.y;

    ball.spin *= spinDamping;
    ball.spinAngle += ball.spin * state.stepScale;

    ball.vy += state.gravity * state.stepScale;
    // Mild magnus force from spin so angled hits can curve in flight.
    ball.vx += -ball.vy * ball.spin * 0.006 * state.stepScale;

    for (let z = 0; z < state.turbulenceZones.length; z += 1) {
      const zone = state.turbulenceZones[z];
      if (ball.y > zone.y && ball.y < zone.y + zone.h) {
        ball.vx += Math.sin(state.time * 0.18 + ball.x * 0.04 + z) * zone.strength * state.stepScale;
        ball.vy += Math.cos(state.time * 0.14 + ball.y * 0.05 + z) * zone.strength * 0.7 * state.stepScale;
      }
    }

    ball.vx *= dragScale;
    ball.vy *= dragScale;

    ball.x += ball.vx * state.stepScale;
    ball.y += ball.vy * state.stepScale;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) {
      ball.trail.shift();
    }

    const hasRoomToGrow = ball.radius < ball.targetRadius - 1e-3;
    if (hasRoomToGrow) {
      ball.growthTimer += state.stepScale;
      if (ball.growthTimer >= BALL_GROW_DELAY_STEPS) {
        const nextRadius = Math.min(ball.targetRadius, ball.radius + BALL_GROW_RATE * state.stepScale);
        if (nextRadius !== ball.radius) {
          ball.radius = nextRadius;
          ball.area = Math.PI * ball.radius * ball.radius;
          ball.mass = ball.area * 0.026;
        }
      }
    }

    if (ball.radius <= MIN_BALL_RADIUS + 0.06 && ball.minFxCooldown <= 0) {
      emitParticles(ball.x, ball.y, 1, 158);
      ball.minFxCooldown = randomRange(9, 22);
    }

    const local = worldToRacketLocal(ball.x, ball.y);
    const prevLocal = worldToRacketLocal(ball.prevX, ball.prevY);
    const localX = local.x;
    const localY = local.y;
    const prevLocalX = prevLocal.x;
    const prevLocalY = prevLocal.y;
    const contactY = -racket.thickness * 0.5 - ball.radius;

    let hasRacketHit = false;
    let hitLocalX = localX;

    const isOverlappingRacket =
      Math.abs(localX) <= racket.width * 0.53 &&
      localY > -ball.radius - racket.thickness &&
      localY < ball.radius + racket.thickness;

    if (isOverlappingRacket && ball.vy > -8) {
      hasRacketHit = true;
    } else if (ball.vy > 0 && prevLocalY < contactY && localY >= contactY) {
      const dy = localY - prevLocalY;
      if (Math.abs(dy) > 1e-6) {
        const t = (contactY - prevLocalY) / dy;
        if (t >= 0 && t <= 1) {
          const crossX = prevLocalX + (localX - prevLocalX) * t;
          if (Math.abs(crossX) <= racket.width * 0.53) {
            hasRacketHit = true;
            hitLocalX = crossX;
            const hitWorld = racketLocalToWorld(crossX, contactY);
            ball.x = hitWorld.x;
            ball.y = hitWorld.y;
          }
        }
      }
    }

    if (hasRacketHit) {
      const edgeRatio = hitLocalX / (racket.width * 0.5);
      const mouseSteer = clamp((state.pointerX - state.pointerPrevX) * 0.12, -2.1, 2.1);
      const desiredVX = Math.sin(racket.angle) * 7.2 + edgeRatio * 4.2 + mouseSteer;
      const impulse = Math.max(7.8, 9.9 - Math.abs(hitLocalX) * 0.014);

      ball.vx = ball.vx * 0.28 + desiredVX * 0.72;
      if (Math.abs(edgeRatio) < 0.18 && Math.abs(racket.angle) < 0.08) {
        ball.vx *= 0.74;
      }
      ball.vx = clamp(ball.vx, -10, 10);
      ball.vy = -impulse;
      ball.y -= 4;

      const spinKick = clamp(edgeRatio * 0.35 + racket.angle * 0.75 + mouseSteer * 0.08, -0.75, 0.75);
      ball.spin += spinKick;

      if (Math.random() < 0.58) {
        const towardScreen = (2.3 + Math.abs(edgeRatio) * 2.2 + Math.abs(mouseSteer) * 0.28) * randomRange(0.9, 1.35);
        ball.vz += towardScreen;
      }

      emitParticles(ball.x, ball.y + 5, 3, ball.hue);
    }

    ball.vz *= zDamping;
    ball.z += ball.vz * state.stepScale;
    const zMax = 14.5;
    if (ball.z > zMax) {
      const impact = Math.abs(ball.vz);
      ball.z = zMax;
      if (ball.vz > 0) {
        ball.vz = -Math.abs(ball.vz) * 0.7;
      }
      if (ball.bonkCooldown <= 0) {
        ball.bonkCooldown = 22;
        playBonk(clamp(impact * 0.24, 0.8, 1.35));
      }
    }
    if (ball.z < 0) {
      ball.z = 0;
      ball.vz = Math.max(0, ball.vz);
    }

    state.poles.forEach((pole) => {
      const inXRange = ball.x + ball.radius > pole.x && ball.x - ball.radius < pole.x + pole.bodyWidth;
      const opening = getPoleOpening(pole);
      const gapTop = pole.gapY - opening * 0.5;
      const gapBottom = pole.gapY + opening * 0.5;
      const tipHeight = 82;
      const topBodyBottom = gapTop - tipHeight;
      const bottomBodyTop = gapBottom + tipHeight;
      const gateX = pole.x + pole.bodyWidth + 7;
      const crossedGate = ball.prevX <= gateX && ball.x > gateX;
      const inGateBand = ball.y > gapTop + ball.radius * 0.55 && ball.y < gapBottom - ball.radius * 0.55;

      if (crossedGate && inGateBand && !ball.scoredPoles.has(pole.id)) {
        ball.scoredPoles.add(pole.id);
        const hazardFactor = state.hazardTimer > 0 ? 1.28 : 1;
        const massGain = ball.mass * state.massMultiplier * hazardFactor;
        state.massScore += massGain;

        if (state.streakTimer > 0) {
          state.streakCount += 1;
        } else {
          state.streakCount = 1;
        }
        state.streakTimer = 160;
        if (state.streakCount >= 3) {
          state.massMultiplier = Math.min(2.65, 1 + (state.streakCount - 2) * 0.2);
        }

        emitParticles(gateX, ball.y, 8, 168);
      }

      if (inXRange) {
        const splitterDirectionOkay = pole.oneWayDir === 0 || Math.sign(ball.vy || 0.001) === pole.oneWayDir;
        if (ballIntersectsSpike(ball, pole) && splitterDirectionOkay) {
          splitBall(ball);
          return;
        }

        const hitTopBody = resolveCircleRectCollision(ball, pole.x, 0, pole.x + pole.bodyWidth, topBodyBottom, 0.35);
        const hitBottomBody = resolveCircleRectCollision(
          ball,
          pole.x,
          bottomBodyTop,
          pole.x + pole.bodyWidth,
          state.height,
          0.35,
        );

        if (hitTopBody || hitBottomBody) {
          emitParticles(ball.x, ball.y, 2, ball.hue);
        }
      }
    });

    if (ball.x < -100 || ball.x > state.width + 100 || ball.y > maxY || ball.y < -180) {
      ball.alive = false;
    }
  });

  state.balls = state.balls.filter((ball) => ball.alive);

  if (state.balls.length === 0) {
    state.lost = true;
  }
}

function updateHud() {
  if (state.massScore > state.best) {
    state.best = state.massScore;
    localStorage.setItem("racket-drift-best-mass", String(state.best));
  }

  scoreEl.textContent = `Mass: ${state.massScore.toFixed(1)}`;
  if (state.massMultiplier > 1.01) {
    scoreEl.textContent += `  x${state.massMultiplier.toFixed(2)}`;
  }
  bestEl.textContent = `Best Mass: ${state.best.toFixed(1)}`;
  timeEl.textContent = `Time: ${formatDuration(state.survivalTimeSec)}`;
  moveModeEl.textContent = `Obstacles: ${state.settings.obstaclesMove ? "Moving" : "Static"} • ${currentChallengeConfig().label}`;
  levelEl.textContent = `Level: ${currentLevel().label}`;
  ballsEl.textContent = `Balls: ${state.balls.length}`;
}

function drawGameOver() {
  const y = state.height * 0.42;
  ctx.fillStyle = "rgba(3, 8, 12, 0.58)";
  ctx.fillRect(0, y - 100, state.width, 220);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff4d2";
  ctx.font = "700 58px Avenir Next";
  ctx.fillText("All Balls Lost", state.width * 0.5, y - 8);

  ctx.font = "500 26px Avenir Next";
  ctx.fillStyle = "#defbe8";
  ctx.fillText(`Mass Collected: ${state.massScore.toFixed(1)} | Level ${currentLevel().label}`, state.width * 0.5, y + 34);
  ctx.fillText(`Time Endured: ${formatDuration(state.survivalTimeSec)}`, state.width * 0.5, y + 68);
  ctx.fillText("Click to restart", state.width * 0.5, y + 102);
}

function updateTip() {
  tipEl.style.opacity = "1";
  if (state.bossWaveActive) {
    tipEl.textContent = `BOSS WAVE: Survive ${(state.bossWaveTimer / 60).toFixed(1)}s for bonus + trail unlock!`;
    return;
  }
  if (state.hazardTimer > 0) {
    tipEl.textContent = `HAZARD BURST: Pole speed up ${(state.hazardTimer / 60).toFixed(1)}s`;
    return;
  }
  if (state.massMultiplier > 1.01) {
    tipEl.textContent = `STREAK BONUS ACTIVE x${state.massMultiplier.toFixed(2)}`;
    return;
  }
  if (state.time > state.tipFadeAt) {
    tipEl.style.opacity = "0";
  } else {
    tipEl.textContent = "Cross the cyan MASS GATE line to score mass.";
  }
}

function updateSettingsHint() {
  const modeLabel = currentChallengeConfig().label;
  if (state.settings.layoutMode === "public-fixed") {
    const setMeta = getCurrentObstacleSet();
    settingsHintEl.textContent = `Mode: ${modeLabel}. Public fixed set: ${setMeta.label} (seed ${setMeta.seed}). Same obstacle positions for all players.`;
    obstacleSetSelectEl.disabled = false;
  } else {
    settingsHintEl.textContent = `Mode: ${modeLabel}. Development randomized mode uses a fresh obstacle seed each run.`;
    obstacleSetSelectEl.disabled = true;
  }
}

function renderObstacleSetOptions() {
  const optionsHtml = Object.entries(OBSTACLE_DATABASE)
    .map(([setId, setMeta]) => `<option value="${setId}">${setMeta.label}</option>`)
    .join("");
  obstacleSetSelectEl.innerHTML = optionsHtml;
}

function syncSettingsUI() {
  renderObstacleSetOptions();
  moveObstaclesToggleEl.checked = state.settings.obstaclesMove;
  layoutModeSelectEl.value = state.settings.layoutMode;
  obstacleSetSelectEl.value = state.settings.obstacleSetId;
  challengeModeSelectEl.value = currentChallengeMode();
  updateSettingsHint();
}

function applySettingsFromUI() {
  state.settings.obstaclesMove = moveObstaclesToggleEl.checked;
  state.settings.layoutMode = layoutModeSelectEl.value === "dev-random" ? "dev-random" : "public-fixed";
  state.settings.obstacleSetId = OBSTACLE_DATABASE[obstacleSetSelectEl.value] ? obstacleSetSelectEl.value : "season-1";
  state.settings.challengeMode = CHALLENGE_MODES[challengeModeSelectEl.value] ? challengeModeSelectEl.value : "normal";
  saveSettings(state.settings);
  syncSettingsUI();
  void loadRemoteScoreboardIfAvailable();
  resetGame();
}

function setSettingsPanelOpen(isOpen) {
  settingsPanel.hidden = !isOpen;
  settingsBtn.setAttribute("aria-expanded", String(isOpen));
}

function tick(ts = 0) {
  let dt = 16.6667;
  if (state.lastTs > 0) {
    dt = Math.max(1, Math.min(60, ts - state.lastTs));
    state.frameDtMs += (dt - state.frameDtMs) * 0.12;
    state.stepScale = Math.max(0.75, Math.min(2.2, dt / 16.6667));
    if (!state.lowPerfMode && state.frameDtMs > 19.5) {
      state.lowPerfMode = true;
    } else if (state.lowPerfMode && state.frameDtMs < 17.3) {
      state.lowPerfMode = false;
    }
  } else {
    state.stepScale = 1;
  }
  state.lastTs = ts;

  state.time += state.stepScale;
  state.streakTimer = Math.max(0, state.streakTimer - state.stepScale);
  if (state.streakTimer <= 0) {
    state.streakCount = 0;
    state.massMultiplier += (1 - state.massMultiplier) * 0.09;
  }

  updateHazardsAndBoss();
  updatePlanes();
  animatePoleDrift();

  drawBackground();
  drawChallengeOverlays();

  if (!state.lost) {
    state.survivalTimeSec += dt / 1000;
    refreshLevelFromMass();
    updatePoles();
    updateBalls();
    updateParticles();
  } else {
    updateParticles();
    if (!state.resultRecorded) {
      recordRunResult();
      state.resultRecorded = true;
    }
  }

  updateHud();

  drawPoles();
  drawPlanes();
  drawParticles();
  drawRacket();
  drawBalls();
  updateTip();

  if (state.lost) {
    drawGameOver();
  }

  const pointerLerp = 1 - Math.pow(1 - 0.62, state.stepScale);
  state.pointerPrevX += (state.pointerX - state.pointerPrevX) * pointerLerp;
  requestAnimationFrame(tick);
}

function getPointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * state.width;
  const y = ((event.clientY - rect.top) / rect.height) * state.height;
  return { x, y };
}

canvas.addEventListener("mousemove", (event) => {
  const p = getPointerPosition(event);
  state.pointerX = p.x;
  state.pointerY = Math.max(state.height * 0.44, Math.min(state.height * 0.9, p.y));
});

canvas.addEventListener("touchmove", (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  if (!touch) {
    return;
  }
  const p = getPointerPosition(touch);
  state.pointerX = p.x;
  state.pointerY = Math.max(state.height * 0.44, Math.min(state.height * 0.9, p.y));
}, { passive: false });

canvas.addEventListener("click", () => {
  unlockAudio();
  if (state.lost) {
    resetGame();
  }
});

canvas.addEventListener("mousedown", () => {
  unlockAudio();
});

canvas.addEventListener("touchstart", () => {
  unlockAudio();
}, { passive: true });

settingsBtn.addEventListener("click", () => {
  setSettingsPanelOpen(settingsPanel.hidden);
});

closeSettingsBtn.addEventListener("click", () => {
  setSettingsPanelOpen(false);
});

layoutModeSelectEl.addEventListener("change", () => {
  state.settings.layoutMode = layoutModeSelectEl.value === "dev-random" ? "dev-random" : "public-fixed";
  state.settings.obstacleSetId = OBSTACLE_DATABASE[obstacleSetSelectEl.value] ? obstacleSetSelectEl.value : "season-1";
  updateSettingsHint();
});

obstacleSetSelectEl.addEventListener("change", () => {
  state.settings.obstacleSetId = OBSTACLE_DATABASE[obstacleSetSelectEl.value] ? obstacleSetSelectEl.value : "season-1";
  updateSettingsHint();
});

challengeModeSelectEl.addEventListener("change", () => {
  state.settings.challengeMode = CHALLENGE_MODES[challengeModeSelectEl.value] ? challengeModeSelectEl.value : "normal";
  updateSettingsHint();
});

applySettingsBtn.addEventListener("click", () => {
  applySettingsFromUI();
  setSettingsPanelOpen(false);
});

const moveFromQuery = urlParams.get("move");
if (moveFromQuery === "0" || moveFromQuery === "false") {
  state.settings.obstaclesMove = false;
}

if (urlParams.get("layout") === "public-fixed" || urlParams.get("layout") === "dev-random") {
  state.settings.layoutMode = urlParams.get("layout");
}

if (CHALLENGE_MODES[urlParams.get("mode")]) {
  state.settings.challengeMode = urlParams.get("mode");
}

scoreEl.textContent = "Mass: 0.0";
bestEl.textContent = `Best Mass: ${state.best.toFixed(1)}`;
timeEl.textContent = "Time: 0.0s";
moveModeEl.textContent = `Obstacles: ${state.settings.obstaclesMove ? "Moving" : "Static"} • ${currentChallengeConfig().label}`;
levelEl.textContent = "Level: 1";

async function bootGame() {
  await loadRemoteConfigIfAvailable();
  syncSettingsUI();
  renderScoreboard();
  await loadRemoteScoreboardIfAvailable();
  resetGame();
  requestAnimationFrame(tick);
}

void bootGame();
