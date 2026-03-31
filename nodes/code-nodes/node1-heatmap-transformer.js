/**
 * Node 1b — Heatmap Data Transformer
 *
 * Transforms Apify actor output to the format expected by downstream nodes
 *
 * Input:
 *   - Apify actor result from karamelo/youtube-most-replayed-scraper-heatmap-extractor
 *
 * Output:
 *   - { heatmapData: [{ timestamp_seconds: number, engagement_score: number }] }
 *
 * Rules:
 *   - Extracts heatSeek array from actor output
 *   - Converts milliseconds to seconds
 *   - Maps intensityScoreNormalized to engagement_score
 *   - Throws error if no heatmap data available
 */

// n8n function - this is what runs inside the n8n Code node
// The Apify result comes from $input.first().json
const apifyResult = $input.first().json;

// Extract the first video's data
// Apify actor returns an array of videos
const videoData = apifyResult[0];

// Validate that we have the required data
if (!videoData) {
  throw new Error('No video data returned from Apify actor. The response was empty.');
}

if (!videoData.heatSeek || !Array.isArray(videoData.heatSeek)) {
  throw new Error('No heatmap data (heatSeek) found for this video. The video may not have "Most Replayed" data available.');
}

if (videoData.heatSeek.length === 0) {
  throw new Error('heatSeek array is empty. This video has no engagement heatmap data.');
}

// Transform to expected format
const heatmapData = videoData.heatSeek.map(segment => ({
  timestamp_seconds: Math.floor(segment.startMillis / 1000),
  engagement_score: segment.intensityScoreNormalized
}));

// Return in format expected by downstream nodes (Node 3 — Peak Parser)
return [{ heatmapData }];
