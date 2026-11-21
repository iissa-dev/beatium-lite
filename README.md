# Beatium Lite — Multimedia & Real-Time Academic Platform

## Overview
**Beatium Lite** is an academic multimedia platform developed with **Angular 22** and modern web technologies (**Web Audio API**, **WebRTC**, **WebAssembly**). It benchmarks, visualizes, and deconstructs core multimedia concepts (sound sampling, DSP, neural noise suppression, vector graphics, video perception, and RTP streaming) directly in the browser with **zero backend dependencies**.

---

## Interactive Feature Labs

### 1. Home Overview (`/`)
* **Academic Dashboard**: High-level telemetry and interactive directory mapping university multimedia lectures (Lecture 2A & 2B) to live demonstrations.
* **Direct Navigation**: Instant routing to Voice, Image, and Video laboratories.

### 2. Voice & Audio DSP Lab (`/voice`)
* **Sampling & Quantization**: 48 kHz discrete PCM sampling, RMS energy calculations, and dynamic audio levels.
* **Neural Noise Suppression (RNNoise)**: Client-side AI background noise isolation powered by WebAssembly (`rnnoise.wasm`) and `AudioWorkletNode`.
* **Real-Time DSP Filters**:
  * **Robot**: 50 Hz sinusoidal ring modulation.
  * **Vintage Radio**: Biquad bandpass filter (300 Hz – 3.4 kHz) simulating telephonic bandwidth.
  * **Echo**: Dual-tap delay network with feedback decay.
* **Audio Recording Workbench**: Record microphone input, save to local cache, inspect dual waveforms (Raw vs Denoised), and calculate Crest Factor discrimination.
* **Zero-Asset Procedural Sound Designer**: Synthesize custom notification tones using Web Audio oscillators (Sine, Triangle, Square, Sawtooth) with interactive visual waveform dragging and ADSR amplitude envelopes.
* **Modal Data Inspector**: Live floating inspection dialog displaying JSON telemetry and PCM sample arrays.

### 3. Vector vs Bitmap Image Lab (`/image`)
* **Mathematical Vector Efficiency**: Real-time collaborative whiteboard streaming geometric paths (Pen, Line, Rectangle, Circle) as sub-kilobyte JSON/SVG structures.
* **Memory & Bandwidth Benchmark**: Compares vector payload size (<1 KB) against an uncompressed 800×480 32-bit RGBA raster bitmap (1.6 MB), demonstrating >99.9% bandwidth reduction.
* **Resolution Independence**: Scalable vector rendering without pixel aliasing or quality degradation.
* **SVG Exporter**: Export and inspect raw SVG source code directly inside the Data Inspector dialog.

### 4. WebRTC Video Streaming & FPS Lab (`/videos`)
* **In-Memory WebRTC Loopback**: Zero-server peer-to-peer streaming via local `RTCPeerConnection` instances.
* **Persistence of Vision Benchmark**:
  * **60 FPS**: Seamless, fluid motion above retinal fusion frequency (16.6ms interval).
  * **30 FPS**: Standard broadcast video motion.
  * **5 FPS**: Prominent flicker and stuttering below retinal retention threshold (200ms interval).
* **Live WebRTC Telemetry**: Real-time stats extraction via `getStats()` measuring Bitrate (kbps), RTP packets sent/lost, decoded frames, hardware decoders, jitter buffers, and lossy inter-frame compression (VP8 / H.264).
* **Display Layouts**: Seamless switching between Split View, Sender Only, and Receiver Only without interrupting the active WebRTC stream.

---

## Project Structure

```
beatium-lite/
├── public/
│   ├── audio/
│   │   └── sample-voice.mp3           # Reference audio asset for Voice Lab demo
│   └── noise-suppressor/
│       ├── noiseGateWorklet.js        # AudioWorklet noise-gate processor
│       ├── rnnoiseWorklet.js          # AudioWorklet RNNoise inference worker
│       ├── rnnoise.wasm               # Standard WebAssembly binary
│       └── rnnoise_simd.wasm          # SIMD-accelerated WebAssembly binary
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/                # Whiteboard domain interfaces
│   │   │   ├── services/              # AudioProcessor, SoundNotification, ScreenShare, WebRtcLoopback, Whiteboard
│   │   │   └── utils/                 # Audio math, RMS & waveform peak calculations
│   │   ├── pages/
│   │   │   ├── home-overview/         # Academic overview dashboard
│   │   │   ├── image-lab/             # Vector whiteboard & raster memory benchmark
│   │   │   ├── videos-lab/            # WebRTC streaming & FPS perception lab
│   │   │   └── voice-lab/             # Voice DSP, RNNoise & sound designer lab
│   │   ├── shared/
│   │   │   └── components/
│   │   │       ├── telemetry-bar/     # Glassmorphic metrics bar
│   │   │       ├── waveform-visualizer/ # Canvas audio visualizer
│   │   │       └── wiki-lab-shell/    # Unified layout shell with Data Inspector dialog
│   │   ├── app.config.ts              # Angular application providers & router config
│   │   ├── app.html                   # Main navigation layout
│   │   ├── app.routes.ts              # Route definitions
│   │   └── app.ts                     # Root application component
│   ├── index.html
│   ├── main.ts
│   └── styles.css                     # Tailwind CSS & global dark theme styles
├── angular.json
├── package.json
└── tsconfig.json
```

---

## Tech Stack & Architecture
* **Framework**: Angular 22 (Standalone Components, Signals, Computed, Effects, `viewChild`)
* **Styling**: Tailwind CSS 4 (Glassmorphism, dark zinc palette)
* **Audio Engine**: Web Audio API (`AudioContext`, `BiquadFilterNode`, `DynamicsCompressorNode`, `AudioWorkletNode`, `OscillatorNode`)
* **Neural Isolation**: `@sapphi-red/web-noise-suppressor` (RNNoise Wasm)
* **Video Transport**: WebRTC (`RTCPeerConnection`, `MediaStream`, `RTCStatsReport`)
* **Display Capture**: Screen Capture API (`navigator.mediaDevices.getDisplayMedia`)

---

## Getting Started

### Prerequisites
* Node.js: `v18.0.0` or higher
* npm: `v9.0.0` or higher

### Installation
```bash
npm install
```

### Development Server
```bash
npm start
# or
ng serve
```
Navigate to `http://localhost:4200/`. The application will automatically reload if source files change.

### Production Build
```bash
npm run build
```
Production output will be compiled into the `dist/beatium-lite/` directory with ahead-of-time (AOT) compilation and tree-shaking.
