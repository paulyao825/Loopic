# Loopic - AI visual storytelling assistant

Loopic finds the best photos hidden inside videos. Upload a video, and the
agent extracts candidate frames, selects the strongest and most varied moments,
then improves each one through a critique-and-refine loop.

The current prototype focuses on discovering and improving strong photo moments:

- frame extraction from raw video
- fast visual scoring for sharpness, exposure, contrast, color, and interest
- looped edit refinement with named corrections
- visible round history, score changes, and final output gallery
- AWS Bedrock judge support and optional S3 image hosting
- Zero.xyz discovery and optional paid flourish pass
- Akash-ready container deployment

Every run is streamed live to the UI. You can see the agent plan, act, observe,
score, correct, and stop when the output clears the quality bar.

## Run it

```bash
npm install

# API on :4000, UI on :5173 with hot reload
npm run dev

# or build the UI once and serve everything from the API
npm run build && npm start
```

Open the app, click **Use sample reel** to generate a test video, or upload any
video file.

Extra:

- `npm run demo` - all-mock console demo

## Configuration - `loopic.config.json`

The config file is reloaded on every run, so edits apply without restarting the
server.

```jsonc
{
  "judge": {
    "provider": "heuristic",   // heuristic | openai | gemini | anthropic | openrouter | bedrock
    "model": "",               // empty = provider default
    "apiKeyEnv": "",           // empty = provider default env var
    "baseUrl": ""              // override for proxies / compatible endpoints
  },
  "aws": {
    "region": "us-east-1",
    "s3Bucket": ""
  },
  "loop": { "bar": 7.5, "maxRounds": 8 },
  "zero": {
    "enabled": true,
    "maxPayUsdc": 0,
    "flourishQuery": "image upscale enhance super-resolution photo",
    "editQuery": "photo image editing crop resize exposure"
  }
}
```

Put API keys in `.env`. Missing keys or provider errors degrade to the local
pixel-heuristic judge, and the UI shows the fallback reason.

## Built With

- Akash
- Amazon Web Services
- Cursor
- TypeScript
- Zero.xyz

## AWS

Loopic includes two AWS integration points:

- **Bedrock vision judge** - set `judge.provider` to `"bedrock"` and the edit
  critique runs through AWS Bedrock using the SDK default credential chain.
- **S3 image hosting** - set `aws.s3Bucket` to host intermediate images through
  presigned URLs for remote editor calls.

If AWS credentials are missing, the run continues with the heuristic judge and
shows the fallback note in the UI.

## Zero.xyz

Loopic uses `@zeroxyz/cli` for live capability discovery. Discovery is free and
visible in the infrastructure panel.

Paid invocation is gated:

1. Run `npx zero auth login`.
2. Fund the wallet with USDC on Base.
3. Set `zero.maxPayUsdc` in `loopic.config.json`.

Without a wallet or budget, Loopic still works. The final flourish falls back to
a local enhancement pass and reports that clearly.

## Akash

The repo includes:

- `Dockerfile` - single container serving API + built web UI
- `deploy/akash.sdl.yaml` - Akash deployment template

Loopic detects Akash provider environment variables at runtime and reports the
compute host in the UI infrastructure panel.

## How It Works

Loopic uses one reusable loop abstraction:

```txt
act -> observe -> score -> correct -> repeat
```

Two product loops plug into it:

| Loop | Goal | Output |
| --- | --- | --- |
| Loop 1 | Select the strongest and most varied frames | Candidate photos |
| Loop 2 | Improve each chosen frame through bounded edits | Refined photos |

The edit loop changes one parameter at a time: crop, exposure, contrast,
saturation, temperature, or sharpening. A judge scores concrete visual axes and
returns directional hints such as `brighten`, `tighten`, or `warmer`.

## What's Next for Loopic

While the current prototype focuses on discovering and improving the best
moments hidden inside videos, Loopic can become a complete AI visual storytelling
assistant.

Future directions:

1. **Personalized AI aesthetic model** - learn from saved photos, preferred
   styles, previous editing choices, and engagement patterns to understand what
   makes a photo feel like each user.
2. **Advanced style transformation** - create CCD camera aesthetics, Y2K styles,
   film photography, cinematic color grading, magazine/editorial looks, meme
   templates, and platform-specific formats.
3. **Intelligent content repurposing** - transform videos into Instagram posts,
   TikTok thumbnails, YouTube thumbnails, profile photos, highlight covers, and
   promotional materials.
4. **AI creative assistant for professionals** - support photo culling, batch
   editing suggestions, consistent style matching, client-specific preferences,
   and faster post-production workflows.
5. **Photo intelligence SDK** - let camera apps, social platforms, creator tools,
   sports/event platforms, memory apps, and travel apps integrate Loopic as an AI
   layer for understanding which moments matter.

Today, Loopic finds the best photos hidden inside videos. Tomorrow, Loopic
becomes the AI that understands every visual moment worth remembering.

## Repo Layout

```txt
server/src/core/loop.ts          reusable act/observe/score/correct loop
server/src/loops/                frame selection and edit refinement specs
server/src/backends/             editor, judge, scorer, AWS, Zero.xyz, compute
server/src/media/                ffmpeg and sharp image analysis
server/src/api/                  run orchestration and event types
server/src/server.ts             Express API, uploads, SSE, static web serving
web/                             React + Vite frontend
```
