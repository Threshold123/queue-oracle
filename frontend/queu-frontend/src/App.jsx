import { useState, useEffect } from "react";
import "./App.css";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DEFAULT_PI_URL = import.meta.env.VITE_PI_URL || "http://raspberrypi.local:5050";

const STATUS_CLASS = { Busy: "busy", Moderate: "moderate", Open: "open" };
const BADGE_CLASS = {
  Busy: "badge-busy",
  Moderate: "badge-moderate",
  Open: "badge-open",
};
const METHODS = ["Baseline", "Time-Aware", "ML Predicted"];

const formatName = (name) =>
  name.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const formatTime = (date) =>
  date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function calcWait(people, predicted, method) {
  const hour = new Date().getHours();
  if (method === 0) return Math.round((people * 35) / 60);
  if (method === 1) {
    let m = 1.0;
    if (hour >= 12 && hour <= 13) m = 1.4;
    else if (hour >= 8 && hour <= 9) m = 1.1;
    else if (hour >= 15 && hour <= 16) m = 0.9;
    return Math.round((people * 35 * m) / 60);
  }
  return Math.round(((predicted || people) * 35) / 60);
}

function getTrend(location, currentPeople, prevLocations) {
  const prev = prevLocations[location];
  if (prev === undefined) return "→";
  if (currentPeople > prev) return "↑";
  if (currentPeople < prev) return "↓";
  return "→";
}

function getTrendColor(trend) {
  if (trend === "↑") return "#F87171";
  if (trend === "↓") return "#34D399";
  return "#555";
}

function getBestTime() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 11) return "14:00 – 15:00";
  if (hour >= 11 && hour < 14) return "09:00 – 10:00";
  if (hour >= 14 && hour < 18) return "10:00 – 11:00";
  return "09:00 – 10:00";
}

export default function App() {
  const [locations, setLocations] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [method, setMethod] = useState(2);
  const [countdown, setCountdown] = useState(5);
  const [prevLocations, setPrevLocations] = useState({});
  const [history, setHistory] = useState([]);
  const [forecast, setForecast] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [piUrl, setPiUrl] = useState(DEFAULT_PI_URL);
  const [piUrlDraft, setPiUrlDraft] = useState(DEFAULT_PI_URL);
  const [feedOnline, setFeedOnline] = useState(true);
  const [showFeedSettings, setShowFeedSettings] = useState(false);

  useEffect(() => {
    const fetchData = () => {
      fetch("http://localhost:3000/status")
        .then((res) => res.json())
        .then((data) => {
          setLocations(data);
          setLastUpdated(new Date());
          setCountdown(5);
          setPrevLocations((prev) => {
            const updated = {};
            data.forEach((loc) => {
              updated[loc.location] = prev[loc.location] ?? loc.people;
            });
            return updated;
          });
          setHistory((prev) => {
            const time = new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const point = { time, isForecast: false };
            data.forEach((loc) => {
              point[loc.location] = loc.people;
            });
            return [...prev, point].slice(-12);
          });
        });

      fetch("http://localhost:3000/forecast")
        .then((res) => res.json())
        .then((data) => setForecast(data))
        .catch(() => setForecast([]));
    };
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 5 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="qo-root">
      <div className="qo-header">
        <div className="qo-brand">
          <div className="qo-title">Queue<em>Oracle</em></div>
          <div className="qo-live">
            <div className="qo-live-dot" />
            Live
          </div>
        </div>
        <div className="qo-subtitle">
          Gostivar University · Real-time queue monitor
        </div>
      </div>

      <div className="qo-divider" />

      {/* Live feed from Pi */}
      <div className="qo-feed-card">
        <div className="qo-feed-header">
          <div className="qo-feed-title">
            <div className={`qo-feed-dot ${feedOnline ? "online" : "offline"}`} />
            Live Camera Feed
          </div>
          <button
            className="qo-feed-settings-btn"
            onClick={() => setShowFeedSettings((v) => !v)}
          >
            {showFeedSettings ? "Done" : "Set Pi IP"}
          </button>
        </div>

        {showFeedSettings && (
          <form
            className="qo-feed-settings"
            onSubmit={(e) => {
              e.preventDefault();
              setPiUrl(piUrlDraft);
              setFeedOnline(true);
              setShowFeedSettings(false);
            }}
          >
            <input
              className="qo-feed-input"
              value={piUrlDraft}
              onChange={(e) => setPiUrlDraft(e.target.value)}
              placeholder="http://192.168.x.x:5050"
            />
            <button className="qo-feed-save-btn" type="submit">Apply</button>
          </form>
        )}

        {feedOnline ? (
          <img
            className="qo-feed-img"
            src={`${piUrl}/video_feed`}
            alt="Live inference feed"
            onError={() => setFeedOnline(false)}
          />
        ) : (
          <div className="qo-feed-offline">
            <div className="qo-feed-offline-icon">⬛</div>
            <div>Camera offline</div>
            <div className="qo-feed-offline-sub">{piUrl}</div>
            <button
              className="qo-feed-retry-btn"
              onClick={() => setFeedOnline(true)}
            >
              Retry
            </button>
          </div>
        )}
      </div>

      <div className="qo-toggle-wrap">
        <div className="qo-toggle-label">Wait Time Method</div>
        <div className="qo-toggle">
          {METHODS.map((m, i) => (
            <button
              key={i}
              className={`qo-toggle-btn ${method === i ? "active" : ""}`}
              onClick={() => setMethod(i)}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="qo-cards">
        {locations.map((loc) => {
          const trend = getTrend(loc.location, loc.people, prevLocations);
          const isSelected = selectedLocation === loc.location;

          // Combine real history with forecast points for the chart
          const forecastPoints = forecast.map((f) => ({
            time: f.hour,
            [loc.location]: f.predicted,
            isForecast: true,
          }));
          const chartData = [...history, ...forecastPoints];

          return (
            <div key={loc.location}>
              <div
                className={`qo-card ${STATUS_CLASS[loc.status]} ${isSelected ? "selected" : ""}`}
                onClick={() => setSelectedLocation(isSelected ? null : loc.location)}
                style={{ cursor: "pointer" }}
              >
                <div className="qo-card-left">
                  <div className="qo-location">{formatName(loc.location)}</div>
                  <div className="qo-people">
                    {loc.people} people in line{" "}
                    <span style={{ color: getTrendColor(trend), fontWeight: 600 }}>
                      {trend}
                    </span>
                  </div>
                  <div className="qo-best-time">
                    Best time today: {getBestTime()}
                  </div>
                  {loc.predicted_people > loc.people + 5 && (
                    <div className="qo-warning">⚠ Usually busier at this time</div>
                  )}
                  {loc.anomaly?.isAnomaly && (
                    <div className="qo-anomaly">⚠ {loc.anomaly.message}</div>
                  )}
                  <div className={`qo-badge ${BADGE_CLASS[loc.status]}`}>
                    <div className="badge-dot" />
                    {loc.status}
                  </div>
                </div>
                <div className="qo-card-right">
                  <div className="qo-wait">
                    {calcWait(loc.people, loc.predicted_people, method)}
                  </div>
                  <div className="qo-wait-label">min wait</div>
                  <div className="qo-technique-tag">{METHODS[method]}</div>
                </div>
              </div>

              {isSelected && chartData.length > 1 && (
                <div className="qo-chart-card">
                  <div className="qo-chart-title">
                    {formatName(loc.location)} · History + 3hr Forecast
                  </div>
                  <div className="qo-chart-legend">
                    <span className="qo-legend-dot live" /> Live
                    <span className="qo-legend-dot forecast" /> Forecast
                  </div>
                  <ResponsiveContainer width="100%" height={110}>
                    <BarChart data={chartData} barSize={14}>
                      <XAxis
                        dataKey="time"
                        tick={{ fontSize: 10, fill: "#444" }}
                        interval="preserveStartEnd"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "#1C1C1C",
                          border: "1px solid #2A2A2A",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: "#555" }}
                        itemStyle={{ color: "#A78BFA" }}
                        cursor={{ fill: "rgba(167,139,250,0.05)" }}
                      />
                      <Bar
                        dataKey={loc.location}
                        radius={[4, 4, 0, 0]}
                      >
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.isForecast ? "#4C4458" : "#A78BFA"}
                            fillOpacity={entry.isForecast ? 0.5 : 0.85}
                            stroke={entry.isForecast ? "#A78BFA" : "none"}
                            strokeWidth={entry.isForecast ? 1 : 0}
                            strokeDasharray={entry.isForecast ? "3 2" : "0"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="qo-footer">
        Updated {lastUpdated ? formatTime(lastUpdated) : "..."}
        <div className="qo-footer-dot" />
        Refreshing in {countdown}s
      </div>
    </div>
  );
}