# YouTube Peak Clip Agent — n8n

## What This Is

An AI-powered n8n agent that takes a YouTube URL, finds the highest-engagement moments using the "Most Replayed" heatmap, and produces finished short-form clips for Instagram Reels and TikTok — automatically.

The agent is not a rigid linear pipeline. It has an AI brain (Google Gemini) that decides which tools to call, handles edge cases, and retries on failure — without hardcoded logic for every scenario.

---

## How It Works

```
You drop in a YouTube URL
        ↓
AI Agent reads the URL and begins orchestrating
        ↓
  ┌─────────────────────────────────────┐
  │         AGENT TOOLBOX               │
  │                                     │
  │  1. Fetch heatmap data (Apify)      │
  │  2. Parse top engagement peaks      │
  │  3. Fetch transcript (Apify)        │
  │  4. Find clip boundaries            │
  │  5. Download source video (yt-dlp)  │
  │  6. Clip segments (FFmpeg)          │
  │  7. Stitch into reel (FFmpeg)       │
  │  8. Save to output folder           │
  └─────────────────────────────────────┘
        ↓
Final reel saved — ready to post
```

The agent decides the order of tool calls, handles fallbacks (e.g. no punctuation in transcript → use fixed window), and skips bad peaks automatically.

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Orchestration | n8n (self-hosted, npx, Windows) | Workflow engine |
| Agent Brain | Google Gemini (free API) | Decision-making, edge case handling |
| Heatmap Data | Apify | Scrape YouTube most-replayed as numeric data |
| Transcript | Apify | Fetch auto-captions with timestamps |
| Video Download | yt-dlp | Download source video |
| Video Processing | FFmpeg | Clip and stitch segments |
| Storage | Local Windows filesystem | Output folder |
| MCP Integration | n8n-mcp | Gives AI coding agents deep n8n node knowledge |

---

## Infrastructure

- n8n runs locally via `npx n8n` on Windows
- Accessible at: `https://n8n.chatsetgo.tech`
- No Docker — direct npx install
- FFmpeg and yt-dlp installed on host machine and callable via n8n Execute Command nodes
- All credentials stored in n8n's built-in credential manager

---

## Agent Architecture

### The Brain — n8n AI Agent Node

```
Type: AI Agent (n8n built-in)
Model: Google Gemini (via Gemini API credential)
Memory: Window Buffer Memory (last 10 messages)
Tools: [all nodes listed below wired as sub-tools]
```

**System Prompt for the Agent:**
```
You are a video clip production agent. Your job is to take a YouTube URL and produce
short-form clips optimized for Instagram Reels and TikTok.

Follow this process in order:
1. Fetch the heatmap data for the URL using the fetch_heatmap tool
2. Parse the top 5 engagement peaks, deduplicating any within 20 seconds of each other
3. Fetch the video transcript using the fetch_transcript tool
4. For each peak, find the nearest sentence boundary before it (walk back) and after it
   (walk forward) using the find_boundaries tool. Target clip length: 30-90 seconds.
   Fallback: if no punctuation found within 45s window, use +/-30s fixed window.
5. Download the source video once using the download_video tool
6. Clip each segment using the clip_video tool
7. If total clip duration is under 25 seconds, stitch all clips chronologically using
   the stitch_clips tool. Otherwise use the single best clip.
8. Save the final file and return the output path.

On any tool failure: retry once. If it fails again, skip that peak and continue.
Always return a summary of what clips were created and why any peaks were skipped.
```

---

## Tools (Wired to Agent as Sub-Workflows or Code Nodes)

### Tool 1 — fetch_heatmap
**Type:** HTTP Request
**Purpose:** Call Apify actor to get YouTube most-replayed heatmap as numeric data
**Method:** POST
**URL:** `https://api.apify.com/v2/acts/<ACTOR_ID>/runs?token={{ $credentials.apify }}`
**Body:**
```json
{
  "startUrls": [{ "url": "{{ $json.url }}" }]
}
```
**Expected Output:** Array of `{ timestamp_seconds: number, engagement_score: number }`

> ⚠️ VALIDATE FIRST: Confirm this actor returns numeric data points — not a screenshot or image. This is the entire data foundation. Do not build anything else until this is confirmed.

---

### Tool 2 — parse_peaks
**Type:** Code Node (JavaScript)
**Purpose:** Sort heatmap, deduplicate close peaks, return top N
**Input:** `{ heatmapData: [{ timestamp_seconds, engagement_score }] }`
**Output:** `{ peaks: [{ peak_timestamp: number }] }`

```javascript
const heatmap = $input.first().json.heatmapData;
const TOP_N = 5;
const DEDUP_WINDOW = 20; // seconds

const sorted = [...heatmap].sort((a, b) => b.engagement_score - a.engagement_score);

const peaks = [];
for (const item of sorted) {
  const tooClose = peaks.some(p => Math.abs(p.peak_timestamp - item.timestamp_seconds) < DEDUP_WINDOW);
  if (!tooClose) peaks.push({ peak_timestamp: item.timestamp_seconds });
  if (peaks.length >= TOP_N) break;
}

return [{ peaks }];
```

---

### Tool 3 — fetch_transcript
**Type:** HTTP Request (Apify)
**Purpose:** Fetch YouTube auto-captions with per-line timestamps
**Method:** POST
**URL:** `https://api.apify.com/v2/acts/<TRANSCRIPT_ACTOR_ID>/runs?token={{ $credentials.apify }}`
**Body:**
```json
{
  "videoUrl": "{{ $json.url }}"
}
```
**Expected Output:** `{ transcript: [{ start: number, text: string }] }`

> Recommended: Use Apify over YouTube Data API — no OAuth required, simpler setup.

---

### Tool 4 — find_boundaries
**Type:** Code Node (JavaScript)
**Purpose:** Walk transcript backwards and forwards from peak to find natural sentence boundaries
**Input:** `{ peak_timestamp: number, transcript: [{ start, text }] }`
**Output:** `{ in_point: number, out_point: number, peak_timestamp: number }`

```javascript
const peak = $input.first().json.peak_timestamp;
const transcript = $input.first().json.transcript;

const TARGET_MIN = 30;
const TARGET_MAX = 90;
const FALLBACK_WINDOW = 30;

// Find closest transcript line to peak
let peakIndex = 0;
let minDiff = Infinity;
transcript.forEach((line, i) => {
  const diff = Math.abs(line.start - peak);
  if (diff < minDiff) { minDiff = diff; peakIndex = i; }
});

// Walk backwards to sentence boundary
let startIndex = peakIndex;
while (startIndex > 0) {
  const prevText = transcript[startIndex - 1].text.trim();
  if (/[.!?]$/.test(prevText)) break;
  if (transcript[peakIndex].start - transcript[startIndex].start > FALLBACK_WINDOW) break;
  startIndex--;
}

// Walk forwards to sentence boundary
let endIndex = peakIndex;
while (endIndex < transcript.length - 1) {
  const currText = transcript[endIndex].text.trim();
  const duration = transcript[endIndex].start - transcript[startIndex].start;
  if (/[.!?]$/.test(currText) && duration >= TARGET_MIN) break;
  if (duration >= TARGET_MAX) break;
  endIndex++;
}

const inPoint = transcript[startIndex].start;
const outPoint = transcript[endIndex].start + 2; // 2s trailing buffer

return [{ in_point: inPoint, out_point: outPoint, peak_timestamp: peak }];
```

---

### Tool 5 — download_video
**Type:** Execute Command
**Purpose:** Download source video once before clipping
**Run once per workflow — not per peak**

```bash
yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" -o "C:\data\source\%(id)s.%(ext)s" "{{ $json.url }}"
```

**Output:** Source file at `C:\data\source\<video_id>.mp4`

---

### Tool 6 — clip_video
**Type:** Execute Command (runs per peak)
**Purpose:** Cut a single segment from source video

```bash
ffmpeg -i "C:\data\source\{{ $json.video_id }}.mp4" -ss {{ $json.in_point }} -to {{ $json.out_point }} -c:v libx264 -c:a aac -avoid_negative_ts make_zero "C:\data\clips\clip_{{ $json.peak_timestamp }}.mp4"
```

**Output:** `C:\data\clips\clip_<timestamp>.mp4`

---

### Tool 7 — stitch_clips
**Type:** Execute Command (conditional — only if total duration < 25s)
**Purpose:** Concatenate clips in chronological order into one reel

The concat list is built by a Code node before this runs:
```javascript
const clips = $input.all().map(item => item.json);
const sorted = clips.sort((a, b) => a.peak_timestamp - b.peak_timestamp);
const concatList = sorted.map(c => `file 'C:/data/clips/clip_${c.peak_timestamp}.mp4'`).join('\n');
return [{ concat_list: concatList, clip_count: sorted.length }];
```

FFmpeg stitch command:
```bash
ffmpeg -f concat -safe 0 -i "C:\data\concat.txt" -c copy "C:\data\output\final_reel.mp4"
```

---

### Tool 8 — save_output
**Type:** Execute Command
**Purpose:** Copy final reel to delivered folder with timestamp

```bash
copy "C:\data\output\final_reel.mp4" "C:\data\delivered\reel_%date:~-4%-%date:~3,2%-%date:~0,2%.mp4"
```

---

## Credentials Required

Store all of these in n8n's credential manager — never hardcode in nodes.

| Credential | Type | Where to get it |
|---|---|---|
| `APIFY_TOKEN` | HTTP Header Auth | apify.com → Settings → API tokens |
| `GEMINI_API_KEY` | Google Gemini API | aistudio.google.com/app/apikey — free tier available |

---

## Local File Structure (Windows)

```
C:\data\
  source\       # Downloaded source videos (yt-dlp output)
  clips\        # Individual clipped segments (FFmpeg output)
  output\       # Final stitched reel (pre-delivery)
  delivered\    # Archived final reels (timestamped)
  concat.txt    # Temp FFmpeg concat list (overwritten each run)
```

Create these folders before first run:
```bash
mkdir C:\data\source C:\data\clips C:\data\output C:\data\delivered
```

---

## Required Tools on Host Machine

**yt-dlp:**
```bash
pip install yt-dlp
yt-dlp --version
```

**FFmpeg:**
Download from ffmpeg.org/download.html → add to Windows PATH
```bash
ffmpeg -version
```

---

## Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Apify returns image not numbers for heatmap | Entire pipeline broken | Validate actor output shape before building anything else |
| YouTube changes heatmap DOM | Apify actor silently breaks | Validate response schema in fetch_heatmap — agent alerts on unexpected shape |
| Transcript has no punctuation | Boundary walker never breaks | Fallback: walk max 30s back/forward regardless of punctuation |
| Two peaks very close together | Redundant or overlapping clips | Deduplication in parse_peaks (20s window) |
| yt-dlp blocked or rate limited | Download fails | Agent retries once; add --cookies-from-browser chrome if needed |
| FFmpeg keyframe drift | Clip starts/ends slightly off | Use -c:v libx264 re-encode for precise cuts, not -c copy |
| Windows path spaces | FFmpeg/yt-dlp command fails | Always wrap all paths in double quotes |

---

## V1 Config Defaults

| Parameter | Default | Why |
|---|---|---|
| Top peaks (TOP_N) | 5 | Enough variety without overprocessing |
| Dedup window | 20s | Avoids near-duplicate clips |
| Minimum clip length | 30s | Minimum viable Reel |
| Maximum clip length | 90s | TikTok/Reels sweet spot |
| Fallback window | +/-30s | When transcript has no punctuation |
| Stitch threshold | 25s | Stitch if best clip is too short |
| Clip order | Chronological | Simplest for v1 |

---

## V1 Scope — Intentionally Left Out

- Captions / subtitle overlay
- Background music
- Color grading
- Auto-upload to Instagram / TikTok
- Audience feedback loop
- Multi-language transcript support
- Reordering clips by engagement strength (v2)

---

## Validation Checklist — Before First Run

- [ ] Apify heatmap actor confirmed to return `{ timestamp_seconds, engagement_score }` array
- [ ] Apify transcript actor confirmed to return `{ start, text }` array per line
- [ ] yt-dlp installed and working — `yt-dlp --version`
- [ ] FFmpeg installed and in PATH — `ffmpeg -version`
- [ ] `C:\data\` folder structure created
- [ ] Gemini API key added to n8n credentials
- [ ] Apify token added to n8n credentials
- [ ] Agent tested on a single short video (under 5 min) before real content

---

## Development Setup

This repo is built using the **Claude coding agent on GitHub** with **Copilot Agent mode in VS Code** and **n8n-mcp** connected for deep n8n node knowledge.

### MCP Config (VS Code)
```json
{
  "mcpServers": {
    "n8n-mcp": {
      "type": "http",
      "url": "https://n8n.chatsetgo.tech/mcp-server/http",
      "headers": {
        "Authorization": "Bearer YOUR_N8N_API_KEY"
      }
    }
  }
}
```

### GitHub Issue Template (use for each tool)
```
Title: Implement Tool [N] — [tool_name]

Using README.md as the spec, implement [tool_name] as an n8n node.

Input shape: { ... }
Output shape: { ... }
Rules:
- [rule 1]
- [rule 2]
- [fallback behavior]

This will be wired as a tool to the n8n AI Agent node.
Assign to @claude.
```

### Copilot Agent Prompt Template
```
I am building an n8n AI agent workflow. The full spec is in README.md.
Using #file:README.md, help me implement [tool name].
Input: [shape]. Output: [shape].
This runs as a tool node called by the AI Agent node.
```

---

## Roadmap

**V1 — Core pipeline** ← current
URL in → clipped reel out. Manual review before posting.

**V2 — Smarter selection**
Reorder clips by engagement strength. Add score to output metadata.

**V3 — Feedback loop**
Connect Instagram/TikTok analytics. Agent tunes TOP_N, clip length, and order based on post performance.
