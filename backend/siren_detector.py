"""
FFT-based siren detection for AERIS - Section 4, Verification 2 of your spec.

Unlike the visual "Siren" class in your YOLO model (which sees a light bar),
this is genuine audio analysis: it reads a WAV clip, computes a short-time
Fourier transform, tracks the dominant frequency in the siren band over time,
and looks for the characteristic sweeping/oscillating pattern that
distinguishes a siren (wail/yelp/hi-lo patterns) from generic traffic noise,
horns, or engine sound.

No heavy audio ML dependency (librosa/soundfile) - just numpy + the stdlib
`wave` module, since sirens have a simple enough spectral signature that a
classical DSP approach is legitimate and matches your spec's own description
("FFT-based frequency analysis").

This is a heuristic detector, not a trained model - it won't be as accurate
as a purpose-trained audio classifier, but it's real signal processing on
real audio, not Math.random(). Tune SIREN_BAND_HZ / thresholds against your
own recorded siren clips if the defaults don't fit your test audio.
"""

import wave
import numpy as np

# Most emergency siren tones (wail/yelp/hi-lo) sweep within this band.
SIREN_BAND_HZ = (500, 1800)
WINDOW_SIZE = 4096
HOP_SIZE = 2048
# A siren's characteristic sweep cycles roughly every 0.5-4 seconds
# (wail is slow ~4-5s, yelp is fast ~0.2-0.4s, hi-lo ~0.5-1s per full cycle).
MIN_SWEEP_HZ = 0.2
MAX_SWEEP_HZ = 3.0


def read_wav_mono(file_bytes: bytes):
    """Returns (samples: float32 array in [-1,1], sample_rate: int)."""
    import io
    with wave.open(io.BytesIO(file_bytes), 'rb') as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        sample_rate = wf.getframerate()
        n_frames = wf.getnframes()
        raw = wf.readframes(n_frames)

    dtype = {1: np.uint8, 2: np.int16, 4: np.int32}.get(sample_width)
    if dtype is None:
        raise ValueError(f"Unsupported sample width: {sample_width} bytes")

    samples = np.frombuffer(raw, dtype=dtype).astype(np.float32)
    if sample_width == 1:
        samples = (samples - 128) / 128.0
    else:
        samples = samples / np.iinfo(dtype).max

    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    return samples, sample_rate


def dominant_frequency_track(samples: np.ndarray, sample_rate: int):
    """
    Slides a window across the signal, finds the loudest frequency within
    SIREN_BAND_HZ in each window. Returns the array of dominant frequencies
    over time (one per window) plus the in-band energy ratio.
    """
    freqs_over_time = []
    band_energy_total = 0.0
    total_energy_total = 0.0

    window = np.hanning(WINDOW_SIZE)

    for start in range(0, max(1, len(samples) - WINDOW_SIZE), HOP_SIZE):
        chunk = samples[start:start + WINDOW_SIZE]
        if len(chunk) < WINDOW_SIZE:
            chunk = np.pad(chunk, (0, WINDOW_SIZE - len(chunk)))

        spectrum = np.abs(np.fft.rfft(chunk * window))
        freqs = np.fft.rfftfreq(WINDOW_SIZE, d=1.0 / sample_rate)

        band_mask = (freqs >= SIREN_BAND_HZ[0]) & (freqs <= SIREN_BAND_HZ[1])
        band_energy = float(np.sum(spectrum[band_mask] ** 2))
        total_energy = float(np.sum(spectrum ** 2)) + 1e-9

        band_energy_total += band_energy
        total_energy_total += total_energy

        if band_energy > 0 and band_mask.any():
            band_spectrum = spectrum[band_mask]
            band_freqs = freqs[band_mask]
            peak_freq = float(band_freqs[np.argmax(band_spectrum)])
            freqs_over_time.append(peak_freq)

    energy_ratio = band_energy_total / total_energy_total if total_energy_total > 0 else 0.0
    return np.array(freqs_over_time), energy_ratio


def detect_sweep_periodicity(freq_track: np.ndarray, hop_seconds: float):
    """
    Sirens sweep up and down within the band. Detect this by counting
    direction changes (local maxima/minima) in the frequency-over-time
    track and checking if the resulting cycle rate falls in a plausible
    siren-sweep range. Returns a periodicity score 0-1.
    """
    if len(freq_track) < 6:
        return 0.0

    # Smooth slightly to avoid counting FFT bin noise as direction changes
    smoothed = np.convolve(freq_track, np.ones(3) / 3, mode='valid')
    diffs = np.diff(smoothed)
    signs = np.sign(diffs)
    signs = signs[signs != 0]
    if len(signs) < 2:
        return 0.0

    direction_changes = int(np.sum(signs[1:] != signs[:-1]))
    duration_seconds = len(freq_track) * hop_seconds
    if duration_seconds <= 0:
        return 0.0

    # Each full sweep cycle = 2 direction changes (up-turn + down-turn)
    cycles_per_second = (direction_changes / 2) / duration_seconds

    if MIN_SWEEP_HZ <= cycles_per_second <= MAX_SWEEP_HZ:
        return 1.0
    # Partial credit for being close to the plausible range
    if cycles_per_second < MIN_SWEEP_HZ:
        return max(0.0, cycles_per_second / MIN_SWEEP_HZ) * 0.5
    return max(0.0, MAX_SWEEP_HZ / cycles_per_second) * 0.5


def analyze_siren(file_bytes: bytes, threshold: float = 0.55):
    samples, sample_rate = read_wav_mono(file_bytes)
    if len(samples) < WINDOW_SIZE:
        return {"sirenDetected": False, "confidence": 0.0, "reason": "clip too short"}

    freq_track, energy_ratio = dominant_frequency_track(samples, sample_rate)
    hop_seconds = HOP_SIZE / sample_rate
    periodicity_score = detect_sweep_periodicity(freq_track, hop_seconds)

    # Combined confidence: needs BOTH concentrated in-band energy AND a
    # plausible sweep pattern - either alone (e.g. a steady tone, or broadband
    # noise that happens to have some energy in-band) isn't enough.
    energy_score = min(1.0, energy_ratio / 0.35)  # 35%+ in-band energy = full credit
    confidence = float(np.clip(0.5 * energy_score + 0.5 * periodicity_score, 0, 1))

    return {
        "sirenDetected": confidence >= threshold,
        "confidence": round(confidence * 100, 1),
        "energyRatio": round(energy_ratio, 3),
        "periodicityScore": round(periodicity_score, 3),
        "dominantFreqRangeHz": [
            round(float(np.min(freq_track)), 1),
            round(float(np.max(freq_track)), 1),
        ] if len(freq_track) else None,
    }
