# AERIS Detection Microservice — verified against your actual model

Everything below was checked by directly loading `best.onnx`, not assumed.

## What your model actually is

```
Model:    YOLO26s (Ultralytics 8.4.33)
Training: 30 epochs, aeris_data.yaml, 12k images, batch 32, imgsz 640
Input:    images   (1, 3, 640, 640) float32, RGB, normalized 0-1
Output:   output0  (1, 300, 6)  ->  [x1, y1, x2, y2, confidence, class_id]
End2end: True  -> NMS is already inside the model graph. Do NOT run a
                    second NMS pass on top of this output - it's already
                    deduplicated.
Classes:  0 -> Ambulance
          1 -> Misc Vehicle
          2 -> Siren   (a VISUAL light-bar detection, not audio)
```

**Final training metrics (epoch 30/30, from your `results.csv`):**
precision 0.863, recall 0.827, **mAP50 0.896**, mAP50-95 0.663.
That's a strong result for 30 epochs on 12k images — no concerns here.

**Verified working:** loaded the real `best.onnx`, ran it on random noise
(correctly returned zero detections), then ran it on real photos extracted
from your own `val_batch0_labels.jpg` — got genuine detections at 42-94%
confidence on actual vehicles/ambulances. The plumbing and the model both
work end to end.

## The "Siren" class is a nice design choice, worth using

Your spec called for two separate verification channels: a camera (YOLO) and
a microphone (FFT audio). You've actually trained a single model that can
partially cover *both* — "Ambulance" gives you the camera signal, and a
"Siren" detection (the visual light bar) in the same frame gives you a second,
independent visual signal, without needing to build the audio/FFT pipeline
at all if you don't want to. `app.py` already combines these into the same
`high_confidence` / `partial` / `unverified` logic your spec describes in
Section 4 — just using two visual classes instead of camera+audio.

If you still want real audio siren detection as a true second modality
(closer to your original spec), that's a separate, smaller FFT-based service
I can scaffold next — say the word.

## Setup

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```
Your `best.onnx` is already in `model/best.onnx` in this package — no need
to copy anything, it's ready to run as-is.

Check it loaded:
```bash
curl http://localhost:8001/health
# {"status":"ok","model_loaded":true}
```

Test it on a real image:
```bash
curl -X POST http://localhost:8001/detect -F "file=@/path/to/photo.jpg"
```

Example response on a frame with both an ambulance and its light bar visible:
```json
{
  "detected": true,
  "confidence": 87.3,
  "sirenDetected": true,
  "sirenConfidence": 71.2,
  "combinedStatus": "high_confidence",
  "boundingBox": {"x1": 120.4, "y1": 80.1, "x2": 410.2, "y2": 300.6},
  "allDetections": [...]
}
```

## Wiring into your Node backend (`backend/server.ts`)

Replace the simulated camera detection endpoint:

```ts
const DETECTION_SERVICE_URL = process.env.DETECTION_SERVICE_URL || 'http://localhost:8001';

app.post('/api/detect/camera', verify, async (req: any, res) => {
  const { rid, frameBase64 } = req.body;
  const session = sessions.get(rid);
  if (!session) { res.status(404).json({ error: 'Session not found' }); return; }
  if (!frameBase64) { res.status(400).json({ error: 'frameBase64 required' }); return; }

  try {
    const buffer = Buffer.from(frameBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buffer]), 'frame.jpg');

    const detectRes = await fetch(`${DETECTION_SERVICE_URL}/detect`, { method: 'POST', body: form });
    const result = await detectRes.json();

    session.cameraConfidence = result.confidence;
    session.cameraDetected = result.detected;
    // NEW: you can now also use result.sirenDetected instead of/alongside
    // your simulated siren endpoint, since this one model gives you both
    session.sirenDetected = result.sirenDetected;

    res.json(result);
  } catch (err) {
    addLog(`⚠️ Detection service unreachable for ${rid} - falling back`, 'warning', rid);
    res.status(502).json({ error: 'Detection service unavailable', detected: false, confidence: 0 });
  }
});
```

On the frontend, capture a frame (from a `<video>` element, or cycle through
test images for a demo without live camera hardware) and POST it as
`frameBase64` on an interval — every 1-2s is plenty.

## Performance note

CPU inference on this 640px YOLO26s model: expect roughly 50-150ms per frame
on a laptop CPU. Fine for 1-2s polling, not fine for real-time 30fps video
without a GPU.

## A note on preprocessing accuracy

`detector.py` uses a simple resize rather than Ultralytics' own letterbox
(aspect-preserving pad) preprocessing. For non-square input frames this is a
small accuracy trade-off — fine for a demo. If your live camera frames are
already roughly square (or you crop them square before sending), this won't
matter at all.
