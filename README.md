# ReTok Studio

ReTok Studio is a local web app for musicians who want to record music covers fast.

The core idea is simple: keep the camera, clean audio source, lyrics, notes, and recording controls in one place, so you can record a vertical cover, download the take, and upload it without opening a video editor just to replace the audio afterwards.

It is built for the common cover workflow:

1. Put your lyrics, chords, structure, or cues in the center editor.
2. Select the camera and the clean audio source you actually want in the final video.
3. Record a vertical take.
4. Download it.
5. Upload it to TikTok, Reels, Shorts, or any other platform.

No separate sync step. No audio replacement pass. No heavy editing suite for a quick cover.

## Who This Is For

ReTok Studio is mainly for:

- singers recording covers;
- guitarists, pianists, producers, and instrumentalists filming quick performances;
- musicians using a clean mix from an audio interface or virtual audio device;
- creators who want lyrics or chords visible while recording;
- people who want a local, simple setup for repeatable vertical takes.

It can also be useful for other creators, but music covers are the main use case.

## Why It Exists

Recording a cover often becomes more complicated than it should be:

- the webcam records one audio source;
- the clean mic or mix is somewhere else;
- lyrics are in another window;
- the final video needs a manual audio replacement in an editor;
- the whole process takes longer than the performance.

ReTok Studio tries to remove that friction. It records the selected video and selected audio together from the start, while keeping your lyrics or notes on screen.

## Features

- Vertical 9:16 recording for social platforms.
- Camera source selection.
- Audio input selection.
- Clean audio recording through browser-supported input devices.
- Central lyrics and notes editor with headings, subtitles, paragraphs, and text sizes.
- Video preview on the right by default, with a left/right toggle.
- Mirror mode.
- Raw image controls: saturation, contrast, brightness.
- White balance controls with a picker on the raw camera feed.
- Local takes library with thumbnails.
- Playback, rename, delete, and download for recorded takes.
- MP4 output when the browser supports native MP4 recording.
- WebM fallback when MP4 is not available.
- Local-first storage: no server upload by the app.

## Typical Music Cover Setup

For the cleanest result, use a dedicated audio input:

- an audio interface with your microphone or instrument;
- a virtual audio device such as BlackHole or Loopback on macOS;
- a DAW or mixer output routed into a browser-visible input;
- a USB microphone selected directly in the app.

Then paste your lyrics or chords into the notes area, frame your shot, and record.

## Requirements

- Node.js 18 or newer.
- A recent Chromium-based browser. Google Chrome is recommended.
- A camera.
- An audio input device.
- Optional for system/DAW audio on macOS: BlackHole, Loopback, an aggregate device, or another virtual audio driver.

Browser media APIs vary by browser. Chrome currently gives the most predictable experience for camera, microphone, canvas capture, and `MediaRecorder`.

## Install

Clone the repository and install dependencies:

```bash
git clone https://github.com/GabrielSandap/ReTok_Studio.git
cd ReTok_Studio
npm install
```

## Run Locally

For normal use on the same computer:

```bash
npm run dev:local
```

Open the URL shown by Vite, usually:

```text
http://localhost:5173
```

Camera and microphone access are allowed on `localhost`. Browsers usually block camera and microphone access on non-secure network URLs such as `http://192.168.x.x:5173`.

If you need to expose the app on your local network:

```bash
npm run dev
```

For network devices, serve the app over HTTPS so the browser can grant camera and microphone permissions.

## Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Data and Privacy

ReTok Studio runs locally in your browser.

- Recorded takes are stored in IndexedDB.
- Notes and preferences are stored in `localStorage`.
- The app does not upload your recordings to a server.
- Clearing site data in the browser will remove the local library and notes.

## Audio Notes

Browsers cannot directly capture every macOS system output as a normal microphone input. If you want to record a DAW, backing track, instrument plugin, or system mix, route it into an input device that the browser can see.

Common options:

- audio interface loopback;
- BlackHole;
- Loopback;
- aggregate device;
- virtual mixer.

Once the source appears as an input device, select it in ReTok Studio.

## Video Notes

Takes are rendered into a vertical 9:16 canvas before recording. Image adjustments are applied before the final capture.

Output format depends on browser support:

- MP4 when native `MediaRecorder` MP4 is available;
- WebM fallback otherwise.

## Project Structure

```text
src/
  App.jsx       Main app: camera, audio, recording, library, notes, and UI
  main.jsx      React entry point
  styles.css    Application styles
```

The project is intentionally compact while the workflow is still evolving. If the app grows, the next step is to split camera, audio, recording, library, and notes into dedicated modules.

## Scripts

```bash
npm run dev:local   # Vite on localhost
npm run dev         # Vite exposed on the local network
npm run build       # production build
npm run preview     # preview production build
```

## Project Status

ReTok Studio is in active development. The public repository is meant to let people follow the project, download it, try it locally, and understand the direction.

Current technical priorities:

- harden the rich-text lyrics/notes editor;
- improve recording cleanup and robustness;
- split the large app file into focused modules;
- add regression tests;
- document audio routing workflows for common musician setups;
- improve export options.

## Contributing

Issues and suggestions are welcome, especially from musicians using the app for real cover workflows.

To propose a change:

1. Fork the repository.
2. Create a focused branch.
3. Run `npm run build`.
4. Open a pull request with a clear description.

## License

No explicit open source license has been selected yet. The code is public so people can follow the work, inspect it, and run it locally. A license will be added when reuse terms are defined.
