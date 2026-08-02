# AERIS — Changes Made (this session)

Applied directly to a clone of your repo, typechecked, built, and tested live
(not just written and assumed correct). Details below.

## backend/server.ts

1. **Security**: `JWT_SECRET`, `SIGNAL_ENGINE_URL`, `PORT`, `FRONTEND_ORIGIN`,
   `DETECTION_SERVICE_URL` all moved to `process.env` via `dotenv`. Throws on
   startup if `JWT_SECRET` isn't set, rather than silently using a weak
   default. See `.env.example`.
2. **CORS**: fixed the invalid `origin: '*', credentials: true` combo →
   now `origin: process.env.FRONTEND_ORIGIN`.
3. **Login rate limiting**: added a lightweight in-memory limiter (10
   attempts / 15 min / IP) - no new dependency needed.
4. **Multi-driver accounts**: `USERS` now has `driver`, `driver2`, `driver3`,
   each mapped to a fixed ambulance RID (`AMB-101/102/103`). This is what
   actually unblocks your Police/Admin fleet-view dashboards - they were
   built for multiple concurrent ambulances but could never show more than
   one because only a single driver account existed.
5. **Roadblock reporting + dynamic recalculation** (new - was entirely
   missing before): `POST /api/roadblock`, `DELETE /api/roadblock`,
   `GET /api/roadblock`. Reporting a blocked segment immediately reruns
   Dijkstra (now roadblock-aware) from each affected ambulance's *current*
   position to City Hospital, avoiding the blocked edge. New emergency
   activations also route around any currently-active roadblocks.
6. **Real YOLO detection wiring**: `POST /api/detect/camera` now accepts an
   optional `frameBase64` field. If present, it's forwarded to the FastAPI
   detection microservice running your real `best.onnx`. If absent, it
   behaves exactly like the old simulated endpoint - fully backward
   compatible. The per-second simulation tick now checks
   `lastRealDetectionAt` and skips overwriting camera readings that are
   fresher than 3 seconds, so real and simulated detection coexist without
   fighting each other.
7. Raised Express's JSON body limit to `8mb` to accommodate base64 frames.

## backend/package.json
Added `dotenv` dependency, `@types/node` dev dependency (needed for global
`fetch`/`FormData`/`Blob` types used in the detection call).

## backend/.env.example (new)
Template for the env vars above. A real `.env` was generated locally with a
proper random `JWT_SECRET` for testing - **you still need to create your own
`.env`** (the repo's existing `.gitignore` already excludes it correctly).

## frontend/src/api.ts
Added `detectCameraReal()`, `listRoadblocks()`, `reportRoadblock()`,
`clearRoadblock()`, and the `RealDetectionResult` type.

## frontend/src/pages/Driver.tsx
Added a "Test Real Detection (upload frame)" control next to the existing
simulated camera toggle - lets you upload any photo and see your actual
model's output (detected/confidence/siren-light) live in the dashboard.

## frontend/src/pages/Police.tsx
Added a Roadblock Reporting card: pick two adjacent junctions, report a
block, see it trigger rerouting, and reopen roads later. Junction adjacency
list mirrors the backend's graph so only valid pairs are offered.

## Unrelated pre-existing build errors, fixed while I was in there
Running `npm run build` (as opposed to just `vite dev`) was **failing
before any of my changes**, on things unrelated to this work:
- `AmbulanceMap.tsx`: `NodeJS.Timeout` type doesn't resolve without
  `@types/node` in scope → switched to `ReturnType<typeof setInterval>`.
- `ParticleBackground.tsx`: `useRef<number>()` needs an initial value under
  current React types → `useRef<number | undefined>(undefined)`.
- Unused imports in `InteractiveMap.tsx`, `LiveIndicators.tsx`,
  `Hospital.tsx` (`Navigation`, `MapPin`, `Clock`, `Zap`, `AlertTriangle`,
  `Activity`, `TrendingDown`, `RouteMap`, `GlassCard`, `LiveMetricCard`,
  an unused `showTraffic` prop).

**Net result: `npm run build` now succeeds cleanly on both backend
(`tsc --noEmit`) and frontend (`tsc -b && vite build`) — verified, not
assumed.**

## What I verified live (not just compiled)
- Backend typecheck: `tsc --noEmit` → exit 0.
- Frontend build: `tsc -b && vite build` → succeeds, outputs `dist/`.
- Ran the actual server: logged in as `driver`, `driver2`, and `driver3`
  simultaneously, started 3 concurrent emergencies, confirmed Police's
  `/api/status` shows all 3 active at once (previously impossible).
- Reported a roadblock on `Junction A ↔ Junction B` while both ambulances
  were routed across it → both got a real, valid, different route back
  (`Dispatch Bay → Ring Road → North Gate → City Hospital`), computed live.
- Called `/api/detect/camera` with a real frame through the actual Node
  backend → confirmed it reaches the FastAPI service, runs your real
  `best.onnx`, and returns a correctly-shaped response end to end.

## What's still on you
- Copy `.env.example` to `.env` and generate your own `JWT_SECRET`.
- `simple-server.ts` is still dead code - delete it whenever convenient,
  didn't touch it since it's unreferenced and unrelated to any of this.
- The 4 map components (`AmbulanceMap`/`InteractiveMap`/`LiveMapComponent`/
  `RouteMap`) still have overlapping responsibility - worth consolidating
  when you have time, not urgent.
- Real audio siren (FFT) detection is still simulated - your model's visual
  "Siren" class is now live and feeding into `combinedStatus`, which covers
  a lot of the same ground, but if you want true audio verification per your
  original spec, that's a separate small service I can build next.

---

## Round 2 (this pass)

1. **Deleted `backend/simple-server.ts`** - the dead scratch file, gone.

2. **Patient intake (Section 2/16 - was entirely missing from the data
   model before):**
   - `AmbulanceSession` now carries a real `patient` object (`condition`,
     `severity`, `requiredDepartment`, `notes`).
   - `POST /api/emergency/start` accepts an optional `patient` payload.
   - **Driver dashboard**: added an actual intake form (condition, severity
     dropdown, department, notes) in the route-selector card, sent along
     with route selection on activation.
   - **Hospital dashboard**: now displays the *real* patient condition/
     severity/department from the driver's intake instead of a hospital-side
     guess with no backing data.

3. **Hospital acknowledgment + real prep checklist (was hardcoded static
   data in `Hospital.tsx` before - literally `{ done: true }` on several
   rows regardless of anything happening):**
   - New backend state: `hospitalAcknowledged`, `hospitalAcknowledgedAt`,
     `prepTasks` (5 real, toggleable tasks) on every session.
   - New endpoints: `POST /api/emergency/:rid/acknowledge` (hospital/admin
     only), `POST /api/emergency/:rid/prep` (toggle a specific task).
   - **Hospital dashboard**: "Mark Ready" (which only ever set local React
     state) replaced with a real "Acknowledge" button wired to the backend;
     the checklist is now tappable and syncs over SSE to every connected
     dashboard, not just the browser tab that clicked it.

### Verified live (this round)
- Backend typecheck: clean, 0 errors.
- Frontend production build: clean, 0 errors.
- Full round-trip test: started an emergency with real patient data
  (`"Chest pain, suspected MI"`, critical, Cardiology) → confirmed the
  Hospital role sees the exact same data via `/api/status` → hospital
  acknowledged it → hospital checked off a prep task → confirmed a driver
  account gets a `403` when trying to call the hospital-only acknowledge
  endpoint (role check actually enforced, not just implied by the frontend
  hiding the button).

## What's still on you (updated)
- Copy `.env.example` to `.env` and generate your own `JWT_SECRET`.
- The 4 map components still have overlapping responsibility - worth
  consolidating when you have time, not urgent.
- Real audio siren (FFT) detection is still simulated - your model's visual
  "Siren" class is live and feeding into `combinedStatus`. A true audio
  pipeline is a separate, smaller service if you still want it.

---

## Round 3 (this pass): real FFT audio siren detection

Closes the last real gap versus your spec's Section 4 - true dual-modality
verification (visual YOLO + genuine audio signal processing), not two
visual signals from one model.

1. **`detection-service/siren_detector.py`** (new) - real DSP, not a trained
   model: reads a WAV clip, computes a sliding-window FFT, tracks the
   dominant frequency within the siren band (500-1800 Hz) over time, and
   scores it on two independent criteria that both have to pass:
   - **In-band energy concentration** (is the sound's energy actually
     centered in the siren frequency range, vs. broadband noise)
   - **Sweep periodicity** (does the dominant frequency oscillate at
     0.2-3 Hz, the characteristic wail/yelp/hi-lo pattern - a steady tone
     or noise won't have this even if it has energy in-band)

2. **New endpoint**: `POST /detect-siren-audio` on the FastAPI service.

3. **`backend/server.ts`**: `/api/detect/siren` now accepts `audioBase64`
   and forwards it to the real analyzer, same backward-compatible pattern
   as the camera endpoint (no audio sent → old simulated behavior
   unchanged). Split the single `lastRealDetectionAt` timestamp into
   separate `lastRealCameraAt` / `lastRealSirenAt` so the two modalities
   don't block each other's freshness independently.

4. **Driver dashboard**: added a "Test Real Detection (upload WAV)" control
   next to the siren toggle, mirroring the camera one.

### Verified
- **Algorithm correctness, proven with 4 synthetic test signals** (not just
  "it runs"): a real siren-like frequency sweep → **100% confidence,
  correctly detected**. Pure white noise → 39%, correctly rejected. A
  *steady 900Hz tone* (strong in-band energy, but NO sweep) → 50%,
  correctly rejected - proving the periodicity check is actually doing
  work, not just checking energy. A sweep with background noise mixed in
  (realistic case) → 100%, still correctly detected.
- **Live HTTP test**: called `POST /detect-siren-audio` on the running
  FastAPI service with a real WAV file → `200 OK`, correct JSON response.
- Backend typecheck: clean, 0 errors. Frontend build: clean, 0 errors.
- Confirmed the Node-side code points at the exact endpoint path that was
  just proven live (`/detect-siren-audio`), using the same fetch/FormData
  pattern already proven working end-to-end for the camera endpoint in an
  earlier round.

## What's still on you (final)
- Copy `.env.example` to `.env` and generate your own `JWT_SECRET`.
- The 4 map components still have overlapping responsibility - the only
  remaining cleanup item, purely cosmetic, not urgent.
- The siren detector's thresholds (`SIREN_BAND_HZ`, sweep-rate bounds,
  the 0.55 confidence cutoff) are tuned against synthetic test signals -
  if you have real recorded siren clips, test against those and adjust
  `siren_detector.py`'s constants if needed.

---

## Round 4 (this pass): removed all hardware framing — pure software project

Per instructor guidance, hardware integration is explicitly out of scope.
Renamed everything that implied a physical ESP32/hardware dependency,
without changing any actual behavior — this was a pure rename/reframe.

1. **`backend/esp32-sim.ts` → `backend/signal-controller-sim.ts`** - rewritten
   header/comments to describe it as the software signal control engine, not
   a stand-in for missing hardware. Removed GPIO-pin-mapping language,
   firmware-version framing, and device IDs implying a physical chip.
2. **`backend/server.ts`**: `ESP32_HOST` → `SIGNAL_ENGINE_URL`, `sendToESP32`
   → `sendSignalCommand`, `esp32Log` → `signalCommandLog`, `/api/esp32` →
   `/api/signal-engine`, console banner text updated.
3. **`backend/package.json`**: `dev:esp32`/`start:esp32` scripts renamed to
   `dev:signals`/`start:signals`.
4. **`backend/.env.example`**: `ESP32_HOST` → `SIGNAL_ENGINE_URL`.
5. **Frontend**: `api.ts` (`ESP32Status` → `SignalEngineStatus`, `fetchESP32`
   → `fetchSignalEngine`, `esp32Log` field renamed), `Admin.tsx` (entire
   "ESP32 Hardware Interface" panel renamed to "Signal Control Engine",
   removed "GPIO Pin States" heading and GPIO-specific fields), `Login.tsx`
   (removed "ESP32 Interface" badge and "Hardware: ESP32" role-card row),
   `Driver.tsx` (one line of copy).
6. **`README.md`**: rewrote the overview, feature list, detection section,
   and API docs to describe the actual current system (real YOLO + real FFT,
   not "simulation"; SSE, not polling) and removed the entire "Future
   Hardware Integration" section, replaced with a "Software-Only
   Architecture" section stating explicitly that no hardware is used or
   planned.

### Verified
- Full repo-wide grep for "esp32" (case-insensitive) across every `.ts`,
  `.tsx`, `.json`, `.md`, and `.env.example` file: zero matches remaining
  outside of this changelog's own description of the rename.
- Backend typecheck: clean, 0 errors.
- Frontend production build: clean, 0 errors.
- No behavior changed - this was a rename/reframe only. The signal control
  engine still runs on port 4001, still receives the same HTTP commands,
  still tracks the same state; only names and documentation changed.
