# Apify Actor Validation — YouTube Heatmap Data (Tool 1)

## Objective
Validate that an Apify actor can retrieve YouTube's "Most Replayed" heatmap as **numeric data points** (not screenshots or images).

## Test URL
`https://www.youtube.com/watch?v=dQw4w9WgXcQ`

## Research Findings

### Apify Marketplace Research

#### Available YouTube-related Actors:
1. **YouTube Scraper** (apify/youtube-scraper)
   - General-purpose YouTube data extraction
   - Returns video metadata, comments, channel info
   - **Does NOT extract heatmap data**

2. **YouTube Channel Scraper** (various)
   - Channel-level metadata
   - **Does NOT extract heatmap data**

3. **YouTube Comment Scraper** (various)
   - Comment extraction
   - **Does NOT extract heatmap data**

### Critical Finding: No Native Apify Actor for Heatmap Data

**Status:** ❌ No existing public Apify actor specifically extracts YouTube's "Most Replayed" heatmap as numeric data.

### Technical Analysis

#### YouTube Heatmap Availability
The "Most Replayed" heatmap feature is:
- A YouTube Premium/standard feature visible in the player progress bar
- Embedded in the page's JavaScript data structures
- Not available via YouTube Data API v3
- Requires DOM parsing or JavaScript execution to extract

#### Data Format Requirements
Expected output format:
```json
[
  { "timestamp_seconds": 47, "engagement_score": 0.82 },
  { "timestamp_seconds": 112, "engagement_score": 0.91 }
]
```

Where:
- `timestamp_seconds`: Integer representing seconds from start
- `engagement_score`: Float between 0 and 1 representing relative engagement

## Alternative Approaches

### Option 1: Custom Apify Actor (Recommended)
**Create a custom Apify actor** that:
1. Uses Puppeteer/Playwright to load the YouTube video page
2. Extracts the heatmap data from the page's initial data structure
3. Parses the `ytInitialPlayerResponse` JavaScript object
4. Converts heatmap markers to the required numeric format

**Technical Implementation:**
- YouTube embeds heatmap data in `ytInitialPlayerResponse.playerConfig.heatMarkerRenderer` or similar
- This can be extracted via regex or DOM parsing
- Data structure typically includes marker positions and intensities

**Pros:**
- Full control over data extraction
- Can be updated if YouTube changes structure
- Returns exact format needed

**Cons:**
- Requires custom development
- Maintenance needed if YouTube changes their data structure
- Rate limiting considerations

### Option 2: YouTube Transcript + Watch Time Analytics
**Indirect approach** using available data:
1. Use existing Apify YouTube Scraper for view count and engagement metrics
2. Combine with YouTube Transcript API
3. Estimate peaks based on comment timestamps and engagement patterns

**Pros:**
- Uses existing, maintained actors
- More stable over time

**Cons:**
- ⚠️ **Does not provide actual heatmap data**
- Estimates only, not real viewer behavior
- **Does not meet requirements**

### Option 3: Direct Page Scraping (Non-Apify)
**Alternative implementation** without Apify:
1. Use Puppeteer/Playwright directly in n8n
2. Extract heatmap data from page source
3. Parse and return numeric array

**Pros:**
- No Apify dependency
- Can be implemented directly in n8n Execute Command node

**Cons:**
- Less abstraction
- No built-in error handling from Apify
- Harder to maintain

### Option 4: yt-dlp with Custom Extraction
**Leverage yt-dlp's data extraction:**
```bash
yt-dlp --dump-json "https://www.youtube.com/watch?v=VIDEO_ID"
```

**Investigation needed:**
- Check if yt-dlp extracts heatmap data in its JSON output
- May require patching yt-dlp or using experimental extractors

**Pros:**
- yt-dlp already required for video download
- Single tool for multiple purposes
- Community-maintained

**Cons:**
- Unknown if heatmap data is exposed
- May not be available in all regions

## Recommended Path Forward

### Immediate Action: Create Custom Apify Actor

**Step 1: Develop Custom Actor**
Create an Apify actor with the following structure:

```javascript
// main.js for custom Apify actor
const Apify = require('apify');

Apify.main(async () => {
    const input = await Apify.getInput();
    const { startUrls } = input;

    const browser = await Apify.launchPuppeteer({
        useChrome: true,
        stealth: true
    });

    const results = [];

    for (const { url } of startUrls) {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Extract ytInitialPlayerResponse from page
        const heatmapData = await page.evaluate(() => {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const text = script.textContent;
                if (text.includes('ytInitialPlayerResponse')) {
                    // Extract and parse the response
                    const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
                    if (match) {
                        const data = JSON.parse(match[1]);
                        // Navigate to heatmap data structure
                        // Note: Actual path may vary based on YouTube's structure
                        const heatMarkers = data?.playerConfig?.heatMarkerRenderer?.heatMarkers || [];

                        // Convert to required format
                        return heatMarkers.map(marker => ({
                            timestamp_seconds: marker.timeRangeStartMillis / 1000,
                            engagement_score: marker.heatMarkerIntensityScoreNormalized
                        }));
                    }
                }
            }
            return [];
        });

        results.push({
            url,
            heatmapData
        });

        await page.close();
    }

    await browser.close();
    await Apify.pushData(results);
});
```

**Step 2: Test the Actor**
1. Deploy to Apify platform
2. Run with test URL: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`
3. Verify output format matches requirements

**Step 3: Validate Output**
Expected validation checks:
- ✅ Output is an array
- ✅ Each element has `timestamp_seconds` (number)
- ✅ Each element has `engagement_score` (number)
- ✅ Not an image/screenshot
- ✅ Not empty for popular videos

## Manual Verification Test

To manually verify heatmap data is available on the test video:
1. Open `https://www.youtube.com/watch?v=dQw4w9WgXcQ` in a browser
2. Open Developer Console
3. Run:
```javascript
// Check for heatmap data
const ytInitialPlayerResponse = window.ytInitialPlayerResponse ||
    JSON.parse(document.querySelector('script:contains("ytInitialPlayerResponse")').textContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/)[1]);

console.log(ytInitialPlayerResponse);
// Look for heatmap-related keys
```

## Status Summary

| Requirement | Status | Notes |
|-------------|--------|-------|
| Find existing Apify actor | ❌ Not Found | No public actor exists for heatmap data |
| Numeric data (not image) | ⚠️ Pending | Requires custom implementation |
| Output shape validation | ⚠️ Pending | Will validate after actor creation |
| Test URL validation | ⏳ Not Started | Waiting for actor implementation |

## Next Steps

### Blockers Identified:
1. **No existing public Apify actor** for YouTube heatmap extraction
2. **Custom development required** before pipeline can proceed

### Recommended Immediate Actions:
1. ✅ Document findings (this file)
2. ⏳ Create GitHub issue: "Develop Custom Apify Actor for YouTube Heatmap"
3. ⏳ Prototype heatmap extraction script locally
4. ⏳ Deploy as Apify actor
5. ⏳ Return to validate with test URL

### Alternative Short-Term Solution:
If custom Apify actor development is blocked, consider:
- **Implement heatmap extraction directly in n8n** using Execute Command + Puppeteer
- Skip Apify for heatmap data only
- Use Apify for transcript (Tool 3) as planned

## Conclusion

**Finding:** No existing Apify actor provides YouTube heatmap data in the required numeric format.

**Recommendation:** Proceed with **Option 1 (Custom Apify Actor)** as it best aligns with the architecture specified in README.md and provides the cleanest integration with n8n.

**Impact on Timeline:** This validation reveals that Tool 1 requires custom development before the pipeline can proceed. All downstream tools (2-8) depend on this data source.

**Risk Mitigation:** Start prototyping the heatmap extraction locally ASAP to confirm YouTube's data structure is accessible and parseable before committing to the Apify actor approach.

---

**Validation Date:** 2026-03-31
**Validated By:** Claude Agent
**Status:** ⚠️ Custom Development Required
