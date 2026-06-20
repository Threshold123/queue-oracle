import sqlite3
import random
from datetime import datetime, timedelta, timezone
import time

conn = sqlite3.connect("queue.db")

# Use local timezone
local_offset = timezone(timedelta(seconds=-time.timezone))
start = datetime.now(local_offset) - timedelta(weeks=4)
current = start

while current < datetime.now(local_offset):
    hour = current.hour
    dow = current.weekday()

    if hour < 7 or hour > 20:
        count = random.randint(0, 1)
    elif 12 <= hour <= 13 and dow < 5:
        count = random.randint(12, 20)
    elif 8 <= hour <= 9 and dow < 5:
        count = random.randint(4, 10)
    elif 15 <= hour <= 16 and dow < 5:
        count = random.randint(5, 12)
    elif dow >= 5:
        count = random.randint(0, 5)
    else:
        count = random.randint(2, 7)

    noise = random.randint(-2, 2)
    count = max(0, count + noise)

    conn.execute(
        "INSERT INTO counts (location, people, timestamp) VALUES (?, ?, ?)",
        ("restaurant", count, current.strftime("%Y-%m-%d %H:%M:%S"))
    )

    current += timedelta(minutes=10)

conn.commit()
conn.close()
print("Done — 4 weeks of data generated")