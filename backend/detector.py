"""
YOLO ONNX inference wrapper for AERIS ambulance detection.

Rewritten against your ACTUAL model (verified by loading best.onnx directly):

  Model:   YOLO26s (Ultralytics 8.4.33), trained 30 epochs on aeris_data.yaml
  Input:   images        (1, 3, 640, 640) float32, normalized 0-1, RGB
  Output:  output0       (1, 300, 6)
           end2end = True -> NMS is already baked into the model graph.
           Each of the 300 rows is [x1, y1, x2, y2, confidence, class_id]
           in 640x640 pixel space, already sorted/deduplicated. No manual
           NMS step is needed or wanted here (that would double-suppress).

  Classes (embedded in the ONNX metadata, do not guess/edit these):
           0 -> Ambulance
           1 -> Misc Vehicle
           2 -> Siren        (a visual siren-light-bar detection, NOT audio -
                               useful as a second visual signal alongside the
                               Ambulance class, complementing/replacing the
                               FFT audio-siren check from your spec)

  Training result (from AERIS_v2_results.zip, epoch 30/30):
           precision 0.863, recall 0.827, mAP50 0.896, mAP50-95 0.663
           That's a genuinely solid result for 30 epochs / 12k images.
"""

import numpy as np
import cv2
import onnxruntime as ort

CLASS_NAMES = {0: "Ambulance", 1: "Misc Vehicle", 2: "Siren"}


class AmbulanceDetector:
    def __init__(self, model_path: str, img_size: int = 640,
                 conf_threshold: float = 0.35):
        self.img_size = img_size
        self.conf_threshold = conf_threshold
        self.class_names = CLASS_NAMES

        providers = ["CPUExecutionProvider"]
        if "CUDAExecutionProvider" in ort.get_available_providers():
            providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]

        self.session = ort.InferenceSession(model_path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name
        output_shape = self.session.get_outputs()[0].shape
        print(f"[AmbulanceDetector] Loaded {model_path}")
        print(f"[AmbulanceDetector] Input: {self.input_name}, Output shape: {output_shape}")
        print(f"[AmbulanceDetector] Classes: {self.class_names}")

    def preprocess(self, image_bgr: np.ndarray):
        """
        Simple resize (not letterbox). This is a slight accuracy trade-off vs.
        Ultralytics' own letterboxed preprocessing if your input frames aren't
        square - fine for a demo. If you want exact parity with training-time
        preprocessing, swap this for a letterbox (pad to square before resize)
        and adjust the descale in postprocess() to match.
        """
        h0, w0 = image_bgr.shape[:2]
        img = cv2.resize(image_bgr, (self.img_size, self.img_size))
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        img = img.transpose(2, 0, 1)  # HWC -> CHW
        img = np.expand_dims(img, axis=0)
        return np.ascontiguousarray(img), (w0, h0)

    def postprocess(self, output: np.ndarray, orig_size):
        """
        output shape: (1, 300, 6) -> [x1, y1, x2, y2, confidence, class_id]
        Already NMS'd by the model itself (end2end=True). Just rescale boxes
        back to the original frame size and drop rows below the confidence
        threshold (low-confidence padding rows fill out the fixed 300 slots).
        """
        w0, h0 = orig_size
        rows = np.squeeze(output, axis=0)  # (300, 6)

        scores = rows[:, 4]
        mask = scores >= self.conf_threshold
        rows = rows[mask]

        if len(rows) == 0:
            return []

        scale_x, scale_y = w0 / self.img_size, h0 / self.img_size
        detections = []
        for x1, y1, x2, y2, conf, cls_id in rows:
            cls_id = int(cls_id)
            detections.append({
                "class": self.class_names.get(cls_id, str(cls_id)),
                "classId": cls_id,
                "confidence": round(float(conf) * 100, 2),
                "box": {
                    "x1": round(float(x1) * scale_x, 1),
                    "y1": round(float(y1) * scale_y, 1),
                    "x2": round(float(x2) * scale_x, 1),
                    "y2": round(float(y2) * scale_y, 1),
                },
            })
        detections.sort(key=lambda d: d["confidence"], reverse=True)
        return detections

    def detect(self, image_bgr: np.ndarray):
        input_tensor, orig_size = self.preprocess(image_bgr)
        output = self.session.run(None, {self.input_name: input_tensor})[0]
        return self.postprocess(output, orig_size)
