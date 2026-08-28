import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Video, Upload, Play, Pause, Camera } from 'lucide-react';
import { detectCameraReal } from '../api';
import type { RealDetectionResult } from '../api';

interface CCTVFeedProps {
  rid: string;
  onDetection?: (result: RealDetectionResult) => void;
}

/**
 * Simulates a roadside CCTV camera feed: the user uploads any video file
 * (dashcam footage, a clip of traffic, whatever), it plays in a loop like
 * a live camera would, and every couple of seconds a frame is captured
 * off the video element and run through the real YOLO26 model - exactly
 * how a real roadside camera integration would work (grab a frame, run
 * inference, repeat), just with a video file standing in for a live feed
 * since there's no physical camera.
 *
 * Detections are drawn as a bounding box overlay directly on the video,
 * scaled to the video's actual displayed size (not just its native
 * resolution) so the box tracks correctly regardless of how large the
 * player is rendered.
 */
const CCTVFeedSimulator: React.FC<CCTVFeedProps> = ({ rid, onDetection }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLive, setIsLive] = useState(false); // whether periodic detection is running
  const [lastResult, setLastResult] = useState<RealDetectionResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const CAPTURE_INTERVAL_MS = 2500; // how often to grab+analyze a frame

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setLastResult(null);
    setFrameCount(0);
    setError(null);
  };

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.85));
  }, []);

  const drawBoundingBox = useCallback((box: RealDetectionResult['boundingBox']) => {
    const overlay = canvasRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    // Overlay canvas is sized to the video's DISPLAYED size, not its
    // native resolution, so we scale the detection box (given in native
    // pixel coordinates) into displayed-pixel coordinates.
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!box || !video.videoWidth) return;
    const scaleX = video.clientWidth / video.videoWidth;
    const scaleY = video.clientHeight / video.videoHeight;

    const x = box.x1 * scaleX;
    const y = box.y1 * scaleY;
    const w = (box.x2 - box.x1) * scaleX;
    const h = (box.y2 - box.y1) * scaleY;

    ctx.strokeStyle = '#FF3B5C';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#FF3B5C';
    const label = 'AMBULANCE';
    ctx.font = '700 13px monospace';
    const textWidth = ctx.measureText(label).width;
    ctx.fillRect(x, Math.max(0, y - 22), textWidth + 12, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(label, x + 6, Math.max(14, y - 6));
  }, []);

  const runDetectionCycle = useCallback(async () => {
    if (analyzing) return; // don't overlap requests
    const frameBlob = await captureFrame();
    if (!frameBlob) return;

    setAnalyzing(true);
    try {
      const result = await detectCameraReal(rid, frameBlob);
      setLastResult(result);
      setFrameCount(c => c + 1);
      drawBoundingBox(result.detected ? result.boundingBox : null);
      onDetection?.(result);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Detection service unreachable');
    } finally {
      setAnalyzing(false);
    }
  }, [rid, analyzing, captureFrame, drawBoundingBox, onDetection]);

  const toggleLive = () => {
    if (isLive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setIsLive(false);
      const overlay = canvasRef.current;
      overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    } else {
      setIsLive(true);
      runDetectionCycle(); // run immediately, then on interval
      intervalRef.current = setInterval(runDetectionCycle, CAPTURE_INTERVAL_MS);
      videoRef.current?.play();
      setIsPlaying(true);
    }
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) { video.pause(); setIsPlaying(false); }
    else { video.play(); setIsPlaying(true); }
  };

  return (
    <div>
      {!videoUrl ? (
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 8, padding: '32px 20px', borderRadius: 14, cursor: 'pointer',
          border: '2px dashed rgba(0,0,0,0.15)', background: 'rgba(0,0,0,0.02)',
        }}>
          <Video size={28} color="var(--text-tertiary)" />
          <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Upload a video to simulate a roadside camera feed</div>
          <div className="text-xs text-quiet">MP4/WebM · plays on loop like a live feed, frames analyzed by your real YOLO26 model</div>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        </label>
      ) : (
        <div>
          <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: '#000', border: isLive ? '2px solid var(--red-bright)' : '2px solid transparent' }}>
            <video
              ref={videoRef}
              src={videoUrl}
              loop
              muted
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'contain', background: '#000' }}
            />
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />

            {isLive && (
              <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(226,63,78,0.9)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 700 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', animation: 'blink-dot 1.5s infinite' }} />
                LIVE · Frame #{frameCount}
              </div>
            )}
            {analyzing && (
              <div style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: '0.7rem', fontWeight: 600 }}>
                Analyzing…
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={togglePlayback} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
              {isPlaying ? <Pause size={12} /> : <Play size={12} />} {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button onClick={toggleLive} className={isLive ? 'btn btn-sm' : 'btn btn-ghost btn-sm'} style={{ gap: 6, ...(isLive ? { background: 'var(--red-bright)', color: '#fff' } : {}) }}>
              <Camera size={12} /> {isLive ? 'Stop Live Detection' : 'Start Live Detection'}
            </button>
            <label className="btn btn-ghost btn-sm" style={{ gap: 6, cursor: 'pointer' }}>
              <Upload size={12} /> Change Video
              <input type="file" accept="video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            </label>
          </div>

          {lastResult && (
            <div className="text-xs mt-2" style={{ color: lastResult.detected ? 'var(--green)' : 'var(--text-muted)' }}>
              {lastResult.detected
                ? `✅ Ambulance detected — ${lastResult.confidence}% confidence`
                : '— No ambulance in current frame'}
              {lastResult.sirenDetected && ` · 🚨 Visual siren light detected (${lastResult.sirenConfidence}%)`}
            </div>
          )}
          {error && <div className="text-xs mt-2" style={{ color: 'var(--red-bright)' }}>⚠️ {error}</div>}
        </div>
      )}
    </div>
  );
};

export default CCTVFeedSimulator;
