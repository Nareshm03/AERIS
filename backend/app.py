"""
AERIS Detection Microservice
────────────────────────────
Serves your trained YOLO model (best.onnx) over HTTP so the Node backend's
/api/detect/camera endpoint can proxy real frames here instead of simulating
a random confidence score.

Run:
    pip install -r requirements.txt
    cp your best.onnx into ./model/best.onnx
    uvicorn app:app --host 0.0.0.0 --port 8001

Wire into server.ts by replacing the body of app.post('/api/detect/camera', ...)
with a fetch() to http://localhost:8001/detect (see README.md in this folder
for the exact snippet).
"""

import os
import numpy as np
import cv2
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from detector import AmbulanceDetector
from siren_detector import analyze_siren

MODEL_PATH = os.environ.get("MODEL_PATH", "./model/best.onnx")
IMG_SIZE = int(os.environ.get("IMG_SIZE", "640"))
CONF_THRESHOLD = float(os.environ.get("CONF_THRESHOLD", "0.4"))

app = FastAPI(title="AERIS Detection Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("BACKEND_ORIGIN", "http://localhost:4000")],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

detector = None


@app.on_event("startup")
def load_model():
    global detector
    if not os.path.exists(MODEL_PATH):
        print(f"[WARN] Model not found at {MODEL_PATH} - /detect will 503 until it's added")
        return
    # Class names and output format are hardcoded in detector.py's CLASS_NAMES,
    # verified directly against your best.onnx metadata - no need to pass them here.
    detector = AmbulanceDetector(
        model_path=MODEL_PATH,
        img_size=IMG_SIZE,
        conf_threshold=CONF_THRESHOLD,
    )


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": detector is not None}


class DetectResponse(BaseModel):
    detected: bool          # True if an "Ambulance" box was found
    confidence: float       # confidence of the best Ambulance detection (0 if none)
    sirenDetected: bool     # True if a "Siren" (visual light-bar) box was also found
    sirenConfidence: float
    combinedStatus: str     # high_confidence / partial / unverified - mirrors your spec's Section 4 logic
    boundingBox: dict | None = None
    allDetections: list = []


@app.post("/detect", response_model=DetectResponse)
async def detect(file: UploadFile = File(...)):
    """
    Accepts a single frame (JPEG/PNG) as multipart/form-data under 'file'.
    This is the endpoint your Node backend should call from
    /api/detect/camera, forwarding the frame captured on the frontend
    (or from an actual roadside camera in Phase 2).

    Your model was trained on 3 classes (Ambulance, Misc Vehicle, Siren).
    "Siren" here is a VISUAL detection of a light bar, not audio - so this
    single model can actually stand in for both halves of your spec's dual
    verification (Section 4): an Ambulance box gives you verification 1
    (camera), and a Siren box in the same frame gives you a visual analog
    of verification 2, without needing a separate microphone/FFT pipeline
    if you don't want to build that out too.
    """
    if detector is None:
        raise HTTPException(503, detail=f"Model not loaded - place best.onnx at {MODEL_PATH}")

    contents = await file.read()
    npimg = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(400, detail="Could not decode image")

    detections = detector.detect(image)

    ambulance_dets = [d for d in detections if d["classId"] == 0]
    siren_dets = [d for d in detections if d["classId"] == 2]

    detected = len(ambulance_dets) > 0
    confidence = ambulance_dets[0]["confidence"] if detected else 0.0
    siren_detected = len(siren_dets) > 0
    siren_confidence = siren_dets[0]["confidence"] if siren_detected else 0.0

    # Mirrors the combined-verification table in Section 4 of your spec
    if detected and siren_detected:
        combined = "high_confidence"
    elif detected or siren_detected:
        combined = "partial"
    else:
        combined = "unverified"

    return DetectResponse(
        detected=detected,
        confidence=confidence,
        sirenDetected=siren_detected,
        sirenConfidence=siren_confidence,
        combinedStatus=combined,
        boundingBox=ambulance_dets[0]["box"] if detected else None,
        allDetections=detections,
    )


class SirenAudioResponse(BaseModel):
    sirenDetected: bool
    confidence: float
    energyRatio: float | None = None
    periodicityScore: float | None = None
    dominantFreqRangeHz: list | None = None
    reason: str | None = None


@app.post("/detect-siren-audio", response_model=SirenAudioResponse)
async def detect_siren_audio(file: UploadFile = File(...)):
    """
    Real FFT-based audio siren detection (Section 4, Verification 2 of your
    spec) - genuine signal processing on a WAV clip, not simulated. See
    siren_detector.py for the full explanation of the approach.

    Accepts a WAV file (16-bit PCM, mono or stereo, any sample rate) as
    multipart/form-data under 'file'. For a live roadside microphone in
    Phase 2, record a rolling few-second buffer and POST it here periodically.
    """
    contents = await file.read()
    try:
        result = analyze_siren(contents)
    except Exception as e:
        raise HTTPException(400, detail=f"Could not analyze audio: {e}")
    return SirenAudioResponse(**result)
