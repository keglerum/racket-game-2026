const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const isEmbeddedBrowser = /electron|vscode/i.test(navigator.userAgent);

// Clamp DPR to 1 so Retina displays don't render at 4× pixel count
canvas.width = 1280;
canvas.height = 720;

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const ballsEl = document.getElementById("balls");
const tipEl = document.getElementById("tip");

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
};

const racket = {
  x: canvas.width * 0.5,
  y: canvas.height * 0.72,
  width: 178,
  thickness: 16,
  angle: 0,
  glow: 0,
};

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
  const hue = Math.floor(randomRange(24, 56));
  const mass = Math.PI * radius * radius * 0.026;
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
    scoredPoles: new Set(),
  });
}

function spawnPole() {
  const level = currentLevel();
  const x = state.width + 120;
  const tipWidth = randomRange(level.tipWidthMin, level.tipWidthMax);
  const bodyWidth = randomRange(44, 86);
  const opening = randomRange(level.openingMin, level.openingMax);
  const gapY = randomRange(170, state.height - 170);

  state.poles.push({
    id: state.poleSerial,
    x,
    passed: false,
    bodyWidth,
    tipWidth,
    opening,
    gapY,
  });
  state.poleSerial += 1;
}

function resetGame() {
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
  const angleLerp = 1 - Math.pow(1 - 0.32, state.stepScale);
  const xLerp = 1 - Math.pow(1 - 0.38, state.stepScale);
  const yLerp = 1 - Math.pow(1 - 0.18, state.stepScale);
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
  const gapTop = pole.gapY - pole.opening * 0.5;
  const gapBottom = pole.gapY + pole.opening * 0.5;
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
}

function drawPoleSegment(pole, top) {
  const tipH = 82;
  const centerY = pole.gapY;
  const openHalf = pole.opening * 0.5;

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
    if (state.lowPerfMode) {
      ctx.fillStyle = `hsla(${ball.hue + 10}, 88%, 62%, 0.94)`;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (ball.trail.length > 1) {
      for (let i = 0; i < ball.trail.length; i += 1) {
        const t = ball.trail[i];
        const alpha = (i + 1) / ball.trail.length;
        ctx.fillStyle = `hsla(${ball.hue + 16}, 90%, 66%, ${alpha * 0.08})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, Math.max(1.2, ball.radius * alpha * 0.28), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const glow = ctx.createRadialGradient(
      ball.x - ball.radius * 0.2,
      ball.y - ball.radius * 0.3,
      ball.radius * 0.2,
      ball.x,
      ball.y,
      ball.radius * 1.6,
    );
    glow.addColorStop(0, `hsla(${ball.hue}, 100%, 90%, 0.97)`);
    glow.addColorStop(0.66, `hsla(${ball.hue + 12}, 90%, 58%, 0.9)`);
    glow.addColorStop(1, `hsla(${ball.hue + 30}, 92%, 30%, 0.12)`);
    ctx.fillStyle = glow;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${ball.hue}, 98%, 95%, 0.95)`;
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.25, ball.y - ball.radius * 0.28, ball.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${ball.hue + 18}, 92%, 96%, 0.52)`;
    ctx.lineWidth = Math.max(1, ball.radius * 0.08);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 0.74, Math.PI * 0.16, Math.PI * 1.28);
    ctx.stroke();
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

  state.poles.forEach((pole) => {
    pole.x -= state.scrollSpeed * state.stepScale;
    if (!pole.passed && pole.x + pole.bodyWidth < racket.x) {
      pole.passed = true;
      state.score += 1;
    }
  });

  state.poles = state.poles.filter((pole) => pole.x + pole.bodyWidth + 80 > 0);

  state.nextPoleAt -= state.scrollSpeed * state.stepScale;
  if (state.nextPoleAt <= 0) {
    spawnPole();
    state.nextPoleAt = randomRange(level.poleSpacingMin, level.poleSpacingMax);
  }
}

function ballIntersectsSpike(ball, pole) {
  const gapTop = pole.gapY - pole.opening * 0.5;
  const gapBottom = pole.gapY + pole.opening * 0.5;
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
  if (ball.splitCooldown > 0 || ball.radius < 6) {
    return;
  }

  ball.alive = false;
  emitParticles(ball.x, ball.y, 22, ball.hue + 8);

  const newRadius = Math.max(5, ball.radius * 0.72);
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

  state.balls.forEach((ball) => {
    ball.splitCooldown = Math.max(0, ball.splitCooldown - state.stepScale);
    ball.prevX = ball.x;
    ball.prevY = ball.y;

    ball.vy += state.gravity * state.stepScale;
    ball.vx *= dragScale;
    ball.vy *= dragScale;

    ball.x += ball.vx * state.stepScale;
    ball.y += ball.vy * state.stepScale;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) {
      ball.trail.shift();
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
      emitParticles(ball.x, ball.y + 5, 3, ball.hue);
    }

    state.poles.forEach((pole) => {
      const inXRange = ball.x + ball.radius > pole.x && ball.x - ball.radius < pole.x + pole.bodyWidth;
      const gapTop = pole.gapY - pole.opening * 0.5;
      const gapBottom = pole.gapY + pole.opening * 0.5;
      const tipHeight = 82;
      const topBodyBottom = gapTop - tipHeight;
      const bottomBodyTop = gapBottom + tipHeight;
      const gateX = pole.x + pole.bodyWidth + 7;
      const crossedGate = ball.prevX <= gateX && ball.x > gateX;
      const inGateBand = ball.y > gapTop + ball.radius * 0.55 && ball.y < gapBottom - ball.radius * 0.55;

      if (crossedGate && inGateBand && !ball.scoredPoles.has(pole.id)) {
        ball.scoredPoles.add(pole.id);
        state.massScore += ball.mass;
        emitParticles(gateX, ball.y, 8, 168);
      }

      if (inXRange) {
        if (ballIntersectsSpike(ball, pole)) {
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
  bestEl.textContent = `Best Mass: ${state.best.toFixed(1)}`;
  levelEl.textContent = `Level: ${currentLevel().label}`;
  ballsEl.textContent = `Balls: ${state.balls.length}`;
}

function drawGameOver() {
  const y = state.height * 0.42;
  ctx.fillStyle = "rgba(3, 8, 12, 0.58)";
  ctx.fillRect(0, y - 82, state.width, 188);

  ctx.textAlign = "center";
  ctx.fillStyle = "#fff4d2";
  ctx.font = "700 48px Avenir Next";
  ctx.fillText("All Balls Lost", state.width * 0.5, y);

  ctx.font = "500 28px Avenir Next";
  ctx.fillStyle = "#defbe8";
  ctx.fillText(`Mass Collected: ${state.massScore.toFixed(1)} | Level ${currentLevel().label}`, state.width * 0.5, y + 40);
  ctx.fillText("Click to restart", state.width * 0.5, y + 80);
}

function updateTip() {
  if (state.time > state.tipFadeAt) {
    tipEl.style.opacity = "0";
  } else {
    tipEl.textContent = "Cross the cyan MASS GATE line to score mass.";
  }
}

function tick(ts = 0) {
  if (state.lastTs > 0) {
    const dt = Math.max(1, Math.min(60, ts - state.lastTs));
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

  drawBackground();

  if (!state.lost) {
    refreshLevelFromMass();
    updatePoles();
    updateBalls();
    updateParticles();
    updateHud();
  } else {
    updateParticles();
  }

  drawPoles();
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
  if (state.lost) {
    resetGame();
  }
});

scoreEl.textContent = "Mass: 0.0";
bestEl.textContent = `Best Mass: ${state.best.toFixed(1)}`;
levelEl.textContent = "Level: 1";
resetGame();
requestAnimationFrame(tick);
