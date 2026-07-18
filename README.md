# Precious Frame - AI visual storytelling assistant

Precious Frame finds the best real photographs hidden inside videos. Upload a
video and the app extracts candidate frames, asks Kimi Vision to identify the
strongest and most varied moments, then improves each selected frame through a
visible critique-and-refine loop.

**Don't miss any frames.**

**We don't like AI-generated pics. We use AI to attract real-world clip photos.**

Precious Frame does not generate replacement scenes. Every result starts as a
real frame from the uploaded video.

## Current prototype

- extracts bounded candidate frames privately in the browser
- scores impact, story, composition, and technical quality with Kimi K2.6
- lets each run favor balanced, people, competition, action, or scenic photography
- combines vision judgment with local sharpness, exposure, color, and activity measurements
- removes near-duplicates to return a varied photo set
- improves crop, exposure, contrast, saturation, temperature, and sharpness with Sharp
- streams every selection and edit round to the React interface
- falls back to local image analysis if the vision API is unavailable
- supports light and dark modes and links directly to the source repository

## Simple stack

| Part | Tool | Why it is here |
| --- | --- | --- |
| Web interface | React + Vite | Uploads, progress, comparisons, and final gallery |
| API | Express | Frame processing, run orchestration, and SSE progress stream |
| Language | TypeScript | One typed codebase from UI to processing pipeline |
| Video processing | Browser Canvas | Extracts real frames without uploading the full video |
| Image processing | Sharp | Fast local crop, color, exposure, and detail edits |
| Vision model | Kimi K2.6 | Selects meaningful frames and judges edit quality |

Kimi Vision is the only external processing service. There are no wallet tools, paid
enhancement brokers, or extra cloud SDKs in the application.

## Required setup

Kimi Vision uses Moonshot's Open Platform and requires one API key.

1. Create an API key in the Moonshot Open Platform.
2. Copy `.env.example` to `.env`.
3. Put the new key after `MOONSHOT_API_KEY=`.
4. Keep `.env` local. It is ignored by Git.

```dotenv
MOONSHOT_API_KEY=your-new-key
VISION_PROVIDER=kimi
VISION_MODEL=kimi-k2.6
VISION_BASE_URL=https://api.moonshot.cn/v1
```

The server calls the official OpenAI-compatible endpoint:

```txt
POST https://api.moonshot.cn/v1/chat/completions
```

If `MOONSHOT_API_KEY` is missing or a model request fails, the run continues with
local pixel scoring and reports the fallback in the interface.

## Photo preferences

Each run can favor `Balanced`, `People & emotion`, `Competition`, `Action & energy`,
or `Scenic & composed` photography. Kimi scores impact, story, composition, and
technical quality, then the server applies the selected preference weights.

The rubric is adapted from Professional Photographers of America's
[12 Elements of a Merit Image](https://www.ppa.com/ppmag/articles/12-elements-of-a-merit-image)
and World Press Photo's [judging criteria](https://www.worldpressphoto.org/contest/judging-process).

## Run locally

Requires Node.js 22 or later.

```bash
npm install
npm run dev
```

- Web interface: `http://localhost:5173`
- API: `http://localhost:4000`

Production-style local run:

```bash
npm run build
npm start
```

The API then serves the built website at `http://localhost:4000`.

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

## Configuration

`precious-frame.config.json` is reloaded for each run:

```jsonc
{
  "judge": {
    "provider": "kimi",
    "model": "kimi-k2.6",
    "baseUrl": "https://api.moonshot.cn/v1"
  },
  "loop": {
    "bar": 7.5,
    "maxRounds": 8
  }
}
```

Set `VISION_PROVIDER=heuristic` only when an entirely offline run is required.

## How it works

Precious Frame uses one reusable loop:

```txt
act -> observe -> score -> correct -> repeat
```

| Loop | Goal | Output |
| --- | --- | --- |
| Loop 1 | Combine preference-aware Kimi judgment, local image quality, and diversity | Candidate photos |
| Loop 2 | Judge and improve each candidate through bounded edits | Refined photos |

Loop 1 sends small batches of extracted images to Kimi K2.6. The model scores
impact, story, composition, and technical quality using the selected photo preference.
The pipeline combines that score with local measurements and removes visually
similar frames.

Loop 2 changes one parameter at a time. Kimi Vision compares the source and edited frame, then evaluates crop and framing,
exposure, contrast, color, white balance, and sharpness, then returns a concrete
direction such as `brighten`, `tighten`, or `warmer`. Sharp applies that change
to the original frame. The loop stops when it clears the score bar or reaches
the round cap.

## Deployment

The included Vercel configuration builds the React app and runs the Express API
as one streaming Node.js Function. The browser extracts up to 24 bounded JPEG
frames, so the full video never crosses the serverless request boundary. The
API processes those frames and returns progress plus generated images in the
same response, avoiding cross-instance memory and `/tmp` dependencies.

Set `MOONSHOT_API_KEY` in the deployment environment. The included `Dockerfile`
also serves the API and built website from one Node.js container when a
container host is preferred.

## What's next for Precious Frame

The current prototype focuses on finding and improving strong moments. The
larger direction is a complete AI visual storytelling assistant.

1. **Personalized AI aesthetic model** - learn from saved photos, preferred
   styles, previous edits, and engagement patterns to understand what makes a
   photo feel like each user.
2. **Advanced style transformation** - create CCD camera aesthetics, Y2K
   styles, film photography, cinematic color grading, editorial looks, meme
   templates, and platform-specific formats.
3. **Intelligent content repurposing** - prepare Instagram posts, TikTok and
   YouTube thumbnails, profile photos, highlight covers, and promotional assets.
4. **AI creative assistant for professionals** - support photo culling, batch
   editing suggestions, consistent style matching, client preferences, and
   faster post-production.
5. **Photo intelligence SDK** - let camera apps, creator tools, social
   platforms, sports and event products, and memory or travel apps understand
   which moments matter.

Today, Precious Frame finds the best photos hidden inside videos. Tomorrow, it
becomes the AI that understands every visual moment worth remembering.

## Repository layout

```txt
server/src/core/loop.ts          reusable act/observe/score/correct loop
server/src/loops/                frame selection and edit refinement
server/src/backends/             Kimi judge/scorer and Sharp editor
server/src/media/                local image analysis
server/src/api/                  run orchestration and streamed event types
server/src/server.ts             Express frame API, SSE, and static web
web/                             React + Vite interface
```
