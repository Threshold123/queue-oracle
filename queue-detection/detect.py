from ultralytics import YOLO
import cv2
import requests
import time
import threading
import os
from flask import Flask, Response, render_template_string

app = Flask(__name__)
model = YOLO("yolov8s.pt")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000")

latest_frame = None
frame_lock = threading.Lock()
people_count = 0

HTML = """
<!DOCTYPE html>
<html>
<head>
  <title>Queue Oracle — Live Detection</title>
  <style>
    body { background: #0f0f0f; color: #fff; font-family: sans-serif; margin: 0; display: flex; flex-direction: column; align-items: center; padding: 20px; }
    h1 { font-size: 1.4rem; margin-bottom: 12px; color: #00e676; }
    img { border: 2px solid #00e676; border-radius: 8px; max-width: 100%; }
    .count { margin-top: 12px; font-size: 1.1rem; color: #aaa; }
  </style>
</head>
<body>
  <h1>Queue Oracle — Live Detection</h1>
  <img src="/video_feed" />
  <p class="count">Bounding boxes drawn in real-time &mdash; count posted to backend every 5 s</p>
</body>
</html>
"""


def generate_frames():
    while True:
        with frame_lock:
            frame = latest_frame
        if frame is None:
            time.sleep(0.05)
            continue
        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ret:
            continue
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        )


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/video_feed")
def video_feed():
    return Response(
        generate_frames(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


def detection_loop():
    global latest_frame, people_count

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Camera not available — falling back to test video")
        cap = cv2.VideoCapture("test_queue.mp4")

    print("Detection started…")
    last_post = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue

        results = model(frame, classes=[0], verbose=False, conf=0.25)[0]
        count = len(results.boxes)
        people_count = count

        annotated = results.plot()
        cv2.putText(
            annotated,
            f"People: {count}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.2,
            (0, 255, 0),
            2,
        )

        with frame_lock:
            latest_frame = annotated

        now = time.time()
        if now - last_post >= 5:
            try:
                requests.post(
                    f"{BACKEND_URL}/count",
                    json={"location": "restaurant", "people": count},
                    timeout=2,
                )
                print(f"Posted: {count} people")
            except Exception:
                print("Backend not reachable…")
            last_post = now


if __name__ == "__main__":
    t = threading.Thread(target=detection_loop, daemon=True)
    t.start()
    print("Flask stream at http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, threaded=True)
