import sqlite3
import pickle
import json
from datetime import datetime, timedelta
from sklearn.linear_model import Ridge
from sklearn.preprocessing import LabelEncoder
import numpy as np

# Load data from database
conn = sqlite3.connect("queue.db")
rows = conn.execute("""
    SELECT location, people, timestamp
    FROM counts
    WHERE people > 0
""").fetchall()
conn.close()
print(f"Loaded {len(rows)} rows from database")

# Prepare features
X = []
y = []
le = LabelEncoder()

locations = list(set(r[0] for r in rows))
le.fit(locations)

def encode_hour(hour):
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    return hour_sin, hour_cos

for location, people, timestamp in rows:
    dt = datetime.fromisoformat(timestamp)
    hour_sin, hour_cos = encode_hour(dt.hour)
    dow = dt.weekday()
    loc_encoded = le.transform([location])[0]
    X.append([hour_sin, hour_cos, dow, loc_encoded])
    y.append(people)

X = np.array(X)
y = np.array(y)

# Train model
model = Ridge()
model.fit(X, y)

# Save model
with open("model.pkl", "wb") as f:
    pickle.dump((model, le), f)

print(f"Model trained on {len(X)} rows")

# Test prediction
now = datetime.now()
test_hour_sin, test_hour_cos = encode_hour(now.hour)
test_dow = now.weekday()
test_loc = le.transform(["restaurant"])[0]
prediction = model.predict([[test_hour_sin, test_hour_cos, test_dow, test_loc]])[0]
print(f"Predicted queue right now: {round(max(0, prediction))} people")

# Forecast next 3 hours
forecast = []
for i in range(4):  # now + 3 hours ahead
    future_time = now + timedelta(hours=i)
    f_hour_sin, f_hour_cos = encode_hour(future_time.hour)
    loc_encoded = le.transform(["restaurant"])[0]
    pred = model.predict([[f_hour_sin, f_hour_cos, future_time.weekday(), loc_encoded]])[0]
    forecast.append({
        "hour": future_time.strftime("%H:%M"),
        "predicted": round(max(0, pred))
    })

with open("forecast.json", "w") as f:
    json.dump(forecast, f)

print("Forecast saved:", forecast)