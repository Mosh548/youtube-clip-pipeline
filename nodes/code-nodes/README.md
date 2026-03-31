# Node 3 — Peak Parser Implementation

This directory contains the implementation for Node 3 of the YouTube Peak Clip Pipeline.

## Overview

The Peak Parser identifies the top engagement peaks from YouTube heatmap data and returns them in a format suitable for n8n workflow processing.

## Files

### `node3-peak-parser.js`
The n8n Code node implementation. Copy the contents of this file directly into an n8n Code node.

**Input Format:**
```javascript
$input.first().json.heatmapData = [
  { timestamp_seconds: number, engagement_score: number },
  // ... more data points
]
```

**Output Format:**
```javascript
[
  { peak_timestamp: number },
  { peak_timestamp: number },
  // ... up to 5 peaks
]
```

### `node3-peak-parser-standalone.js`
A standalone, testable version of the peak parser that can be used outside of n8n for development and testing.

**Usage:**
```javascript
const { parsePeaks } = require('./node3-peak-parser-standalone');

const heatmap = [
  { timestamp_seconds: 10, engagement_score: 50 },
  { timestamp_seconds: 30, engagement_score: 80 },
  // ... more data points
];

const peaks = parsePeaks(heatmap); // Returns top 5 peaks
const customPeaks = parsePeaks(heatmap, 3, 30); // Custom: top 3, 30s dedup window
```

## Features

### Top N Selection
- Returns the top 5 peaks by default (configurable in standalone version)
- Sorted by engagement score in descending order

### Deduplication
- Automatically deduplicates peaks within 20 seconds of each other
- When peaks are within the deduplication window, keeps the one with the higher engagement score
- Uses `< DEDUP_WINDOW_SECONDS` comparison (19 seconds is within window, 20 seconds is not)

### n8n Integration
- Returns an array where each item is a separate object
- This allows n8n's "Split In Batches" or loop nodes to process each peak individually
- Perfect for feeding into downstream nodes that process one peak at a time

## Testing

Run the comprehensive test suite:

```bash
node tests/node3-peak-parser.test.js
```

The test suite includes:
- Basic functionality with proper spacing
- Deduplication logic validation
- Edge cases (empty input, clustered peaks)
- Custom parameters
- Output format validation
- Real-world scenarios

All 10 tests should pass.

## Algorithm Details

1. **Sort by Score**: First, sort all heatmap points by engagement score (descending)
2. **Greedy Selection**: Iterate through sorted peaks:
   - Check if the current peak is within 20 seconds of any already-selected peak
   - If not too close, add it to the result
   - Stop when we have 5 peaks
3. **Format Output**: Map to `{ peak_timestamp }` format

This greedy approach ensures we always get the highest-scoring peaks while respecting the deduplication constraint.

## Configuration

The n8n version uses these hardcoded constants:
- `TOP_N = 5` - Number of peaks to return
- `DEDUP_WINDOW_SECONDS = 20` - Deduplication window

To change these values, modify the constants at the top of `node3-peak-parser.js` before copying to n8n.

## Example

**Input:**
```javascript
[
  { timestamp_seconds: 30, engagement_score: 85 },
  { timestamp_seconds: 35, engagement_score: 88 },  // Within 20s of 30
  { timestamp_seconds: 67, engagement_score: 92 },
  { timestamp_seconds: 70, engagement_score: 90 },  // Within 20s of 67
  { timestamp_seconds: 95, engagement_score: 78 },
  { timestamp_seconds: 180, engagement_score: 95 }
]
```

**Output:**
```javascript
[
  { peak_timestamp: 180 },  // Score: 95
  { peak_timestamp: 67 },   // Score: 92
  { peak_timestamp: 35 },   // Score: 88 (30 excluded due to proximity)
  { peak_timestamp: 95 },   // Score: 78
  // 70 excluded due to proximity to 67
  // Only 4 peaks returned as 30 was deduplicated
]
```

## Next Steps

After implementing this node in your n8n workflow:
1. Connect the output to a "Split In Batches" node (or similar)
2. Each peak will be processed individually by downstream nodes
3. Continue with Node 4 (Fetch Transcript) to get caption data for each peak
