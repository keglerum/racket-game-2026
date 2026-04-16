const express = require("express");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = Number(process.env.PORT || 8080);

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "racket_drift.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS obstacle_sets (
      set_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      seed INTEGER NOT NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mass REAL NOT NULL,
      time_sec REAL NOT NULL,
      obstacles_move INTEGER NOT NULL,
      layout_label TEXT NOT NULL,
      seed INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  await run(
    "INSERT OR IGNORE INTO obstacle_sets (set_id, label, seed) VALUES (?, ?, ?)",
    ["season-1", "Season 1", 20260416],
  );
  await run(
    "INSERT OR IGNORE INTO obstacle_sets (set_id, label, seed) VALUES (?, ?, ?)",
    ["season-2", "Season 2", 20260701],
  );
}

app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/config", async (_req, res) => {
  try {
    const rows = await all("SELECT set_id, label, seed FROM obstacle_sets ORDER BY set_id ASC");
    const obstacleSets = rows.map((row) => ({
      setId: row.set_id,
      label: row.label,
      seed: row.seed,
    }));
    res.json({ obstacleSets });
  } catch (err) {
    res.status(500).json({ error: "Failed to load config" });
  }
});

app.get("/api/scores", async (req, res) => {
  const requestedLimit = Number(req.query.limit || 50);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(200, Math.floor(requestedLimit))) : 50;

  try {
    const rows = await all(
      `
      SELECT mass, time_sec, obstacles_move, layout_label, seed, created_at
      FROM scores
      ORDER BY mass DESC, time_sec DESC, created_at ASC
      LIMIT ?
      `,
      [limit],
    );

    const scores = rows.map((row) => ({
      mass: row.mass,
      timeSec: row.time_sec,
      obstaclesMove: Boolean(row.obstacles_move),
      layoutLabel: row.layout_label,
      seed: row.seed,
      createdAt: row.created_at,
    }));

    res.json({ scores });
  } catch (err) {
    res.status(500).json({ error: "Failed to load scores" });
  }
});

app.post("/api/scores", async (req, res) => {
  const mass = Number(req.body.mass);
  const timeSec = Number(req.body.timeSec);
  const obstaclesMove = Boolean(req.body.obstaclesMove);
  const layoutLabel = String(req.body.layoutLabel || "Unknown").slice(0, 80);
  const seed = Number(req.body.seed);

  if (!Number.isFinite(mass) || mass < 0 || !Number.isFinite(timeSec) || timeSec < 0 || !Number.isFinite(seed)) {
    res.status(400).json({ error: "Invalid score payload" });
    return;
  }

  try {
    await run(
      `
      INSERT INTO scores (mass, time_sec, obstacles_move, layout_label, seed, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [mass, timeSec, obstaclesMove ? 1 : 0, layoutLabel, Math.floor(seed), Date.now()],
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save score" });
  }
});

app.use(express.static(__dirname));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Racket Drift server running on http://localhost:${PORT}`);
      console.log(`Using database: ${dbPath}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database", err);
    process.exit(1);
  });
