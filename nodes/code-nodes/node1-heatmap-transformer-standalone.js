/**
 * Node 1b — Heatmap Data Transformer (Standalone Version)
 *
 * This is a standalone version that can be tested outside of n8n
 * The n8n version is in node1-heatmap-transformer.js
 */

/**
 * Transform Apify actor output to pipeline format
 *
 * @param {Array} apifyResult - Raw output from Apify actor
 * @returns {Object} - { heatmapData: Array<{timestamp_seconds: number, engagement_score: number}> }
 * @throws {Error} - If no valid heatmap data is found
 */
function transformHeatmapData(apifyResult) {
  // Validate input
  if (!Array.isArray(apifyResult) || apifyResult.length === 0) {
    throw new Error('No video data returned from Apify actor. The response was empty.');
  }

  // Extract the first video's data
  const videoData = apifyResult[0];

  if (!videoData) {
    throw new Error('No video data in response.');
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

  return { heatmapData };
}

module.exports = { transformHeatmapData };
