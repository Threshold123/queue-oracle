const express = require("express");
const app = express();
const { execSync } = require("child_process");
const fs = require("fs");

const Database = require("better-sqlite3");
const db = new Database("queue.db");
app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location TEXT,
      people INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Database ready");
} catch (err) {
  console.log("Database error:", err);
}

app.post("/count", (req, res) => {
  const { location, people } = req.body;
  console.log(`${location}: ${people} people`);
  db.prepare("INSERT INTO counts (location, people) VALUES (?, ?)").run(
    location,
    people
  );
  res.json({ status: "ok" });
});

function getAnomalyInfo(location, currentPeople, currentHour, currentDay) {
  const historical = db.prepare(`
    SELECT people FROM counts
    WHERE location = ?
    AND strftime('%H', timestamp) = ?
    AND strftime('%w', timestamp) = ?
  `).all(location, currentHour, currentDay);

  const counts = historical.map(row => row.people);

  if (counts.length < 3) {
    return null;
  }

  const sum = counts.reduce((total, n) => total + n, 0);
  const mean = sum / counts.length;

  const squaredDiffs = counts.map(n => (n - mean) ** 2);
  const avgSquaredDiff = squaredDiffs.reduce((total, n) => total + n, 0) / counts.length;
  const stdDev = Math.sqrt(avgSquaredDiff);

  if (stdDev === 0) {
    return null;
  }

  const zScore = (currentPeople - mean) / stdDev;

  if (Math.abs(zScore) > 2) {
    const percentDiff = Math.round(((currentPeople - mean) / mean) * 100);
    return {
      isAnomaly: true,
      percentDiff,
      message: `Unusual — ${percentDiff > 0 ? "+" : ""}${percentDiff}% vs typical`
    };
  }

  return { isAnomaly: false };
}

app.get("/status", (req, res) => {
  const locations = db.prepare(`
    SELECT location, people, MAX(timestamp) as timestamp
    FROM counts
    GROUP BY location
    ORDER BY timestamp DESC
  `).all();

  const now = new Date();
  const currentHour = now.getHours().toString().padStart(2, "0");
  const currentDay = now.getDay().toString();

  const locationWithWait = locations.map((loc) => {
    const wait_minutes = Math.round((loc.people * 30) / 60);
    const status = loc.people > 10 ? "Busy" : loc.people > 5 ? "Moderate" : "Open";

    let predicted_people = null;
    try {
      const result = execSync(`python3 -c "
import pickle, datetime, math
with open('model.pkl','rb') as f: model, le = pickle.load(f)
now = datetime.datetime.now()
hour_sin = math.sin(2 * math.pi * now.hour / 24)
hour_cos = math.cos(2 * math.pi * now.hour / 24)
loc = le.transform(['${loc.location}'])[0]
pred = model.predict([[hour_sin, hour_cos, now.weekday(), loc]])[0]
print(round(max(0, pred)))
"`).toString().trim();
      predicted_people = parseInt(result);
    } catch (e) {
      predicted_people = null;
    }

    const anomaly = getAnomalyInfo(loc.location, loc.people, currentHour, currentDay);

    return {
      ...loc,
      wait_minutes,
      status,
      predicted_people,
      anomaly,
    };
  });

  res.json(locationWithWait);
});

app.get("/forecast", (req, res) => {
  try {
    const data = fs.readFileSync("forecast.json", "utf-8");
    res.json(JSON.parse(data));
  } catch (e) {
    res.json([]);
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});