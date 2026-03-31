# YouTube Peak Clip Pipeline — n8n Agent

## Project Overview

An end-to-end automation pipeline that uses YouTube's "Most Replayed" heatmap data to identify the highest-engagement moments of a video, extract transcript-aware clip boundaries, and produce stitched short-form clips ready for Instagram Reels and TikTok.

---

## Core Concept

YouTube exposes a "Most Replayed" heatmap on videos. This heatmap represents viewer re-watch density at each timestamp — a data signal for what audiences find most valuable. This pipeline:

1. Extracts heatmap data as numeric timestamps (not pixels) via Apify
2. Identifies the top N engagement peaks
3. Pulls the video transcript and finds natural sentence boundaries around each peak
4. Downloads the source video
5. Clips each segment using FFmpeg
6. Stitches clips into a single reel if total duration is below threshold
7. Stores the final asset

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Orchestration | n8n (self-hosted, Docker) | Pipeline workflow |
| Heatmap Data | Apify | Scrape YouTube most-replayed data |
| Transcript | YouTube Data API or Apify | Fetch auto-captions with timestamps |
| Video Download | yt-dlp | Download source video |
| Video Processing | FFmpeg | Clip and stitch segments |
| Storage | Local volume or S3-compatible | Store final output |

---

## Pipeline Architecture

```
[Trigger: YouTube URL input]
        ↓
[Step 1] Apify Actor → fetch heatmap data as JSON
        ↓
[Step 2] Parse heatmap → identify top N peaks (timestamps)
        ↓
[Step 3] Fetch transcript (YouTube API or Apify)
        ↓
[Step 4] For each peak → find sentence-start (walk back) and sentence-end (walk forward)
        ↓
[Step 5] Validate clip length → expand or trim to hit 30–90s target
        ↓
[Step 6] Execute node → yt-dlp downloads source video
        ↓
[Step 7] Execute node → FFmpeg clips each segment
        ↓
[Step 8] Check total stitched duration → if under 60s, stitch clips in chronological order
        ↓
[Step 9] Move final file to output directory / upload to storage
```

---

## n8n Workflow — Node-by-Node Spec

### Node 1 — Webhook / Form Trigger
- **Type:** Webhook or n8n Form
- **Input:** YouTube video URL
- **Output:** `{{ $json.url }}`

---

### Node 2 — Apify: Fetch Heatmap Data
- **Type:** HTTP Request
- **Method:** POST
- **URL:** `https://api.apify.com/v2/acts/<ACTOR_ID>/runs?token=<APIFY_TOKEN>`
- **Body:**
```json
{
  "startUrls": [{ "url": "{{ $json.url }}" }]
}
```
- **Expected Output:** JSON array of `{ timestamp_seconds: number, engagement_score: number }`
- **⚠️ Validation required:** Confirm Apify actor returns numeric data points, not a screenshot. This is a hard dependency. Test this before building any downstream nodes.

---

### Node 3 — Code Node: Parse Peaks
- **Type:** Code (JavaScript)
- **Purpose:** Sort heatmap data by engagement score, return top N peaks
- **Logic:**
```javascript
const heatmap = $input.first().json.heatmapData;
const TOP_N = 5;

const sorted = [...heatmap].sort((a, b) => b.engagement_score - a.engagement_score);
const topPeaks = sorted.slice(0, TOP_N).map(p => p.timestamp_seconds);

return topPeaks.map(ts => ({ peak_timestamp: ts }));
```
- **Output:** Array of `{ peak_timestamp }` objects (one item per peak, feeds into split/loop)

---

### Node 4 — HTTP Request: Fetch Transcript
- **Type:** HTTP Request
- **Purpose:** Get YouTube auto-captions with word-level or line-level timestamps
- **Option A (YouTube Data API):**
  - Endpoint: `https://www.googleapis.com/youtube/v3/captions`
  - Requires OAuth — complex setup
- **Option B (Apify transcript actor):**
  - Simpler, no OAuth needed
  - Returns lines with `{ start: seconds, text: string }`
- **Recommended for v1:** Option B (Apify)
- **Output:** `{{ $json.transcript }}` — array of `{ start: number, text: string }`

---

### Node 5 — Code Node: Find Clip Boundaries
- **Type:** Code (JavaScript)
- **Input:** `peak_timestamp` (from Node 3 loop) + full transcript (from Node 4)
- **Purpose:** Walk backwards to sentence start, walk forwards to sentence end
- **Logic:**
```javascript
const peak = $('Node3').first().json.peak_timestamp;
const transcript = $('Node4').first().json.transcript;

const TARGET_MIN = 30;
const TARGET_MAX = 90;

// Find transcript line closest to peak
let peakIndex = 0;
let minDiff = Infinity;
transcript.forEach((line, i) => {
  const diff = Math.abs(line.start - peak);
  if (diff < minDiff) { minDiff = diff; peakIndex = i; }
});

// Walk backwards to sentence boundary (punctuation or silence gap > 0.5s)
let startIndex = peakIndex;
while (startIndex > 0) {
  const prevText = transcript[startIndex - 1].text.trim();
  if (/[.!?]$/.test(prevText)) break;
  startIndex--;
}

// Walk forwards to sentence boundary
let endIndex = peakIndex;
while (endIndex < transcript.length - 1) {
  const currText = transcript[endIndex].text.trim();
  const duration = transcript[endIndex + 1].start - transcript[startIndex].start;
  if (/[.!?]$/.test(currText) && duration >= TARGET_MIN) break;
  if (duration >= TARGET_MAX) break;
  endIndex++;
}

const inPoint = transcript[startIndex].start;
const outPoint = transcript[endIndex].start + 2; // add 2s buffer

return [{ in_point: inPoint, out_point: outPoint, peak_timestamp: peak }];
```
- **Output:** `{ in_point, out_point, peak_timestamp }`

---

### Node 6 — Execute Command: Download Video
- **Type:** Execute Command
- **Runs once per workflow (not per peak)**
- **Command:**
```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4" \
  -o "/data/source/%(id)s.%(ext)s" \
  "{{ $('Node1').first().json.url }}"
```
- **Output:** Source video saved to `/data/source/<video_id>.mp4`
- **⚠️ Note:** Run this node before the per-peak loop, not inside it

---

### Node 7 — Execute Command: FFmpeg Clip
- **Type:** Execute Command (runs per peak via SplitInBatches)
- **Command:**
```bash
ffmpeg -i /data/source/<video_id>.mp4 \
  -ss {{ $json.in_point }} \
  -to {{ $json.out_point }} \
  -c:v libx264 -c:a aac \
  -avoid_negative_ts make_zero \
  /data/clips/clip_{{ $json.peak_timestamp }}.mp4
```
- **Output:** Individual clips saved to `/data/clips/`

---

### Node 8 — Code Node: Stitch Decision
- **Type:** Code (JavaScript)
- **Purpose:** Decide whether to stitch clips; if yes, sort chronologically and build FFmpeg concat list
- **Logic:**
```javascript
const clips = $input.all().map(item => item.json);
const REEL_MIN = 25; // seconds — stitch if total is below this

// Sort chronologically
const sorted = clips.sort((a, b) => a.peak_timestamp - b.peak_timestamp);

const totalDuration = sorted.reduce((sum, c) => sum + (c.out_point - c.in_point), 0);

if (totalDuration < REEL_MIN) {
  // Build concat list for FFmpeg
  const concatList = sorted.map(c => `file '/data/clips/clip_${c.peak_timestamp}.mp4'`).join('\n');
  return [{ stitch: true, concat_list: concatList, clips: sorted }];
} else {
  // Use the single best clip
  return [{ stitch: false, clips: [sorted[0]] }];
}
```

---

### Node 9 — Execute Command: FFmpeg Stitch
- **Type:** Execute Command (conditional — runs only if `stitch === true`)
- **Command:**
```bash
echo "{{ $json.concat_list }}" > /data/concat.txt && \
ffmpeg -f concat -safe 0 -i /data/concat.txt \
  -c copy /data/output/final_reel.mp4
```
- **Output:** `/data/output/final_reel.mp4`

---

### Node 10 — Move / Upload Final File
- **Type:** Execute Command or S3 node
- **Purpose:** Move final reel to output directory or upload to storage bucket
- **Command (local):**
```bash
cp /data/output/final_reel.mp4 /data/delivered/reel_{{ $now }}.mp4
```

---

## Docker Setup

### docker-compose.yml
```yaml
version: "3.8"
services:
  n8n:
    image: n8nio/n8n
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=changeme
      - EXECUTIONS_DATA_SAVE_ON_SUCCESS=all
    volumes:
      - n8n_data:/home/node/.n8n
      - ./data:/data          # shared video/clip storage
    restart: unless-stopped

volumes:
  n8n_data:
```

### Required host tools (inside n8n container or sidecar)
```bash
apt-get install -y ffmpeg
pip install yt-dlp
```

Or run FFmpeg/yt-dlp in a separate sidecar container and call via HTTP or shared volume.

---

## Environment Variables / Credentials

| Variable | Description |
|---|---|
| `APIFY_TOKEN` | Apify API token |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (if using transcript via Google) |
| `OUTPUT_DIR` | Local path for final reels |

Store all credentials in n8n's built-in credential manager — never hardcode in nodes.

---

## File Structure

```
/data/
  source/         # Downloaded source videos
  clips/          # Individual clipped segments
  output/         # Final stitched reels
  delivered/      # Archived outputs
  concat.txt      # Temp FFmpeg concat list (overwritten each run)
```

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Apify can't extract heatmap as numbers | Pipeline has no data foundation | **Validate this first, before building anything else** |
| YouTube changes heatmap DOM structure | Apify actor breaks silently | Add response schema validation in Node 2; alert on unexpected shape |
| Transcript has no punctuation | Boundary logic finds no sentence ends | Add fallback: if no punctuation found within 45s window, use silence gap or fixed ±30s window |
| Two peaks are very close together | Overlapping or redundant clips | In Node 3, deduplicate peaks that are within 20s of each other |
| yt-dlp rate limited or blocked | Download fails | Add retry logic; use cookies file for authenticated requests |
| FFmpeg cuts on keyframe boundaries | Slight in/out drift | Add `-force_key_frames` or use `-c copy` only when re-encoding isn't needed |

---

## V1 Defaults (Hardcode These, Tune Later)

| Parameter | Default |
|---|---|
| Number of peaks (TOP_N) | 5 |
| Minimum clip length | 30s |
| Maximum clip length | 90s |
| Stitch threshold | 25s total |
| Clip order when stitching | Chronological |
| Target content | English, clear audio |

These defaults should be extracted into a single config object or n8n environment variables so they can be tuned without touching node logic.

---

## V1 Scope (What's Intentionally Out)

- Captions / subtitles overlay
- Music or background audio
- Color grading or LUTs
- Automatic upload to Instagram / TikTok
- Audience feedback loop (v3 feature)
- Multi-language transcript support

---

## Validation Checklist Before First Run

- [ ] Apify actor confirmed to return numeric heatmap data (not image)
- [ ] Transcript output confirmed to include timestamps per line
- [ ] FFmpeg installed and accessible inside n8n execution environment
- [ ] yt-dlp installed and can download a test video
- [ ] `/data/` directories created with correct permissions
- [ ] n8n credentials saved for Apify and YouTube API
- [ ] Test run on a single short video (under 10 min) before full pipeline

---

## Prompting Guide (For Claude / GitHub Copilot)

When using this README to get AI help building nodes, provide context like this:

> "I am building an n8n workflow. Here is my pipeline spec in README.md. Help me write the Code node logic for [Node X]. The input is [describe input shape]. The output should be [describe output shape]."

For FFmpeg commands:
> "Generate an FFmpeg command that clips a video from [in_point] to [out_point], re-encodes to H.264/AAC, and avoids negative timestamps."

For Apify:
> "Write an n8n HTTP Request node configuration that calls the Apify actor run endpoint, polls for completion, and returns the dataset items."
