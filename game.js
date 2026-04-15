const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const ballsEl = document.getElementById("balls");
const tipEl = document.getElementById("tip");

const LEVELS = [
  {
    label: 1,
    thresholdMass: 0,
    scrollSpeed: 2.6,
    gravity: 0.17,
    openingMin: 260,
    openingMax: 320,
    poleSpacingMin: 330,
    poleSpacingMax: 430,
    tipWidthMin: 18,
    tipWidthMax: 30,
    dragCoeff: 0.0018,
  },
  {
    label: 2,
    thresholdMass: 170,
    scrollSpeed: 3,
    gravity: 0.182,
    openingMin: 230,
    openingMax: 295,
    poleSpacingMin: 310,
    poleSpacingMax: 400,
    tipWidthMin: 20,
    tipWidthMax: 34,
    dragCoeff: 0.002,
  },
  {
    label: 3,
    thresholdMass: 390,
    scrollSpeed: 3.35,
    gravity: 0.194,
    openingMin: 205,
    openingMax: 270,
    poleSpacingMin: 280,
    poleSpacingMax: 360,
    tipWidthMin: 22,
    tipWidthMax: 38,
    dragCoeff: 0.0022,
  },
  {
    label: 4,
    thresholdMass: 700,
    scrollSpeed: 3.75,
    gravity: 0.205,
    openingMin: 185,
    openingMax: 248,
    poleSpacingMin: 260,
    poleSpacingMax: 330,
    tipWidthMin: 24,
    tipWidthMax: 42,
    dragCoeff: 0.00245,
  },
  {
    label: 5,
    thresholdMass: 1120,
    scrollSpeed: 4.1,
    gravity: 0.218,
    openingMin: 168,
    openingMax: 230,
    poleSpacingMin: 245,
    poleSpacingMax: 310,
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
  state.gravity += (level.gravity - state.gravity) * 0.06;
  state.scrollSpeed += (level.scrollSpeed - state.scrollSpeed) * 0.06;
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
  const gradient = ctx.createLinearGradient(0, 0, 0, state.height);
  gradient.addColorStop(0, "#1b455f");
  gradient.addColorStop(0.52, "#1a4b48");
  gradient.addColorStop(1, "#102a3d");
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

  for (let i = 0; i < 28; i += 1) {
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
}

function drawRacket() {
  const speedX = state.pointerX - state.pointerPrevX;
  const targetAngle = Math.max(-0.46, Math.min(0.46, speedX * 0.045));
  racket.angle += (targetAngle - racket.angle) * 0.32;
  racket.x += (state.pointerX - racket.x) * 0.38;
  racket.y += (state.pointerY - racket.y) * 0.18;
  racket.glow = Math.min(1, Math.abs(targetAngle) * 2.2);

  ctx.save();
  ctx.translate(racket.x, racket.y);
  ctx.rotate(racket.angle);

  ctx.shadowColor = `rgba(71, 232, 194, ${0.26 + racket.glow * 0.4})`;
  ctx.shadowBlur = 18 + racket.glow * 30;

  const paddleGradient = ctx.createLinearGradient(-racket.width * 0.5, 0, racket.width * 0.5, 0);
  paddleGradient.addColorStop(0, "#f7d982");
  paddleGradient.addColorStop(0.48, "#fff7d3");
  paddleGradient.addColorStop(1, "#f3bf50");

  ctx.fillStyle = paddleGradient;
  roundRect(-racket.width * 0.5, -racket.thickness * 0.5, racket.width, racket.thickness, racket.thickness * 0.5);
  ctx.fill();

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

  ctx.strokeStyle = "rgba(120, 255, 234, 0.75)";
  ctx.lineWidth = 2;
  ctx.shadowColor = "rgba(120, 255, 234, 0.8)";
  ctx.shadowBlur = glow;
  ctx.beginPath();
  ctx.moveTo(gateX, gapTop + 7);
  ctx.lineTo(gateX, gapBottom - 7);
  ctx.stroke();
  ctx.shadowBlur = 0;
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
    bodyGradient.addColorStop(0, "#2d686f");
    bodyGradient.addColorStop(0.5, "#66b9aa");
    bodyGradient.addColorStop(1, "#2a575d");
    ctx.fillStyle = bodyGradient;
    ctx.fillRect(pole.x, bodyTop, pole.bodyWidth, bodyHeight);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(pole.x + 4, bodyTop, 5, bodyHeight);
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
  tipGradient.addColorStop(0, "#ffd4a0");
  tipGradient.addColorStop(1, "#ff6f5d");
  ctx.fillStyle = tipGradient;
  ctx.fill();

  ctx.fillStyle = "rgba(255, 255, 255, 0.24)";
  ctx.fillRect(pole.x + pole.bodyWidth * 0.5 - 1, bodyTop, 2, bodyHeight);

  ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
  ctx.fillRect(pole.x + pole.bodyWidth - 6, bodyTop, 6, bodyHeight);
}

function drawBalls() {
  state.balls.forEach((ball) => {
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
    glow.addColorStop(0, `hsla(${ball.hue}, 100%, 88%, 0.95)`);
    glow.addColorStop(0.7, `hsla(${ball.hue + 12}, 88%, 58%, 0.88)`);
    glow.addColorStop(1, `hsla(${ball.hue + 30}, 92%, 35%, 0.15)`);
    ctx.fillStyle = glow;

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius * 1.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `hsla(${ball.hue}, 98%, 95%, 0.95)`;
    ctx.beginPath();
    ctx.arc(ball.x - ball.radius * 0.25, ball.y - ball.radius * 0.28, ball.radius * 0.35, 0, Math.PI * 2);
    ctx.fill();
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
    p.life -= 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;

    if (p.life <= 0) {
      state.particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  state.particles.forEach((p) => {
    ctx.fillStyle = `hsla(${p.hue}, 95%, 65%, ${Math.min(1, p.life / 40)})`;
    ctx.fillRect(p.x, p.y, 3, 3);
  });
}

function updatePoles() {
  const level = currentLevel();

  state.poles.forEach((pole) => {
    pole.x -= state.scrollSpeed;
    if (!pole.passed && pole.x + pole.bodyWidth < racket.x) {
      pole.passed = true;
      state.score += 1;
    }
  });

  state.poles = state.poles.filter((pole) => pole.x + pole.bodyWidth + 80 > 0);

  state.nextPoleAt -= state.scrollSpeed;
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

function updateBalls() {
  const maxY = state.height + 120;

  state.balls.forEach((ball) => {
    ball.splitCooldown = Math.max(0, ball.splitCooldown - 1);
    ball.prevX = ball.x;
    ball.prevY = ball.y;

    ball.vy += state.gravity;
    ball.vx *= state.drag;
    ball.vy *= state.drag;

    ball.x += ball.vx;
    ball.y += ball.vy;

    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) {
      ball.trail.shift();
    }

    const localX = (ball.x - racket.x) * Math.cos(-racket.angle) - (ball.y - racket.y) * Math.sin(-racket.angle);
    const localY = (ball.x - racket.x) * Math.sin(-racket.angle) + (ball.y - racket.y) * Math.cos(-racket.angle);

    if (
      Math.abs(localX) <= racket.width * 0.52 &&
      localY > -ball.radius - racket.thickness &&
      localY < ball.radius + racket.thickness &&
      ball.vy > -8
    ) {
      const tiltKick = Math.sin(racket.angle) * 2.8;
      const centerBias = (localX / (racket.width * 0.5)) * 1.25;
      const impulse = Math.max(7.6, 9.4 - Math.abs(localX) * 0.016);

      ball.vx += tiltKick + centerBias;
      ball.vy = -impulse;
      ball.y -= 4;
      emitParticles(ball.x, ball.y + 5, 3, ball.hue);
    }

    state.poles.forEach((pole) => {
      const inXRange = ball.x + ball.radius > pole.x && ball.x - ball.radius < pole.x + pole.bodyWidth;
      const gapTop = pole.gapY - pole.opening * 0.5;
      const gapBottom = pole.gapY + pole.opening * 0.5;
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

        if (ball.y - ball.radius < gapTop - 90 || ball.y + ball.radius > gapBottom + 90) {
          if (ball.x < pole.x + 8 || ball.x > pole.x + pole.bodyWidth - 8) {
            ball.vx *= -0.45;
            ball.x += ball.vx;
          }
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
  }
}

function tick() {
  state.time += 1;

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

  state.pointerPrevX += (state.pointerX - state.pointerPrevX) * 0.62;
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
