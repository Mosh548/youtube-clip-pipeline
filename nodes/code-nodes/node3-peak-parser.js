/**
 * Node 3 — Peak Parser
 *
 * Parses heatmap data to identify top engagement peaks
 *
 * Input:
 *   - heatmapData: Array of { timestamp_seconds: number, engagement_score: number }
 *
 * Output:
 *   - Array of { peak_timestamp: number } sorted by score descending
 *
 * Rules:
 *   - Returns top 5 peaks
 *   - Deduplicates peaks within 20 seconds of each other (keeps higher score)
 *   - Returns as array so n8n can loop over each item
 */

// n8n function - this is what runs inside the n8n Code node
// The heatmap data comes from $input.first().json.heatmapData
const heatmap = $input.first().json.heatmapData;
const TOP_N = 5;
const DEDUP_WINDOW_SECONDS = 20;

// Sort by engagement score descending
const sorted = [...heatmap].sort((a, b) => b.engagement_score - a.engagement_score);

// Deduplicate peaks within 20 seconds of each other (keep higher score)
const deduplicated = [];
for (const peak of sorted) {
  // Check if this peak is too close to any already selected peak
  const tooClose = deduplicated.some(existing =>
    Math.abs(existing.timestamp_seconds - peak.timestamp_seconds) < DEDUP_WINDOW_SECONDS
  );

  if (!tooClose) {
    deduplicated.push(peak);
  }

  // Stop once we have enough peaks
  if (deduplicated.length >= TOP_N) {
    break;
  }
}

// Map to output format and return
// Each item becomes a separate item in n8n workflow for looping
return deduplicated.map(p => ({ peak_timestamp: p.timestamp_seconds }));
