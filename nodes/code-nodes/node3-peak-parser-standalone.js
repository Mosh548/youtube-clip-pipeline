/**
 * Node 3 — Peak Parser (Standalone Version)
 *
 * This is a standalone version that can be tested outside of n8n
 * The n8n version is in node3-peak-parser.js
 */

/**
 * Parse heatmap data to identify top engagement peaks
 *
 * @param {Array<{timestamp_seconds: number, engagement_score: number}>} heatmapData - Array of heatmap data points
 * @param {number} topN - Number of top peaks to return (default: 5)
 * @param {number} dedupWindowSeconds - Deduplication window in seconds (default: 20)
 * @returns {Array<{peak_timestamp: number}>} Array of peak timestamps
 */
function parsePeaks(heatmapData, topN = 5, dedupWindowSeconds = 20) {
  // Validate input
  if (!Array.isArray(heatmapData) || heatmapData.length === 0) {
    return [];
  }

  // Sort by engagement score descending
  const sorted = [...heatmapData].sort((a, b) => b.engagement_score - a.engagement_score);

  // Deduplicate peaks within dedupWindowSeconds of each other (keep higher score)
  const deduplicated = [];
  for (const peak of sorted) {
    // Check if this peak is too close to any already selected peak
    const tooClose = deduplicated.some(existing =>
      Math.abs(existing.timestamp_seconds - peak.timestamp_seconds) < dedupWindowSeconds
    );

    if (!tooClose) {
      deduplicated.push(peak);
    }

    // Stop once we have enough peaks
    if (deduplicated.length >= topN) {
      break;
    }
  }

  // Map to output format
  return deduplicated.map(p => ({ peak_timestamp: p.timestamp_seconds }));
}

module.exports = { parsePeaks };
