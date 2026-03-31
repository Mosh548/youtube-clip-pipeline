/**
 * Tests for Node 1b — Heatmap Data Transformer
 */

const { transformHeatmapData } = require('../nodes/code-nodes/node1-heatmap-transformer-standalone');

// Simple test runner
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

function runTests() {
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(`  ${error.message}`);
      failed++;
    }
  }

  // Test 1: Basic transformation - converts milliseconds to seconds
  test('Transforms heatSeek data to expected format', () => {
    const apifyResult = [
      {
        videoId: 'dQw4w9WgXcQ',
        title: 'Test Video',
        heatSeek: [
          {
            startMillis: 47000,
            durationMillis: 5000,
            intensityScoreNormalized: 0.82
          },
          {
            startMillis: 112000,
            durationMillis: 8000,
            intensityScoreNormalized: 0.91
          }
        ]
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assert(result.hasOwnProperty('heatmapData'), 'Should have heatmapData property');
    assertEqual(result.heatmapData.length, 2, 'Should have 2 data points');
    assertEqual(result.heatmapData[0].timestamp_seconds, 47, 'First timestamp should be 47 seconds');
    assertEqual(result.heatmapData[0].engagement_score, 0.82, 'First engagement score should be 0.82');
    assertEqual(result.heatmapData[1].timestamp_seconds, 112, 'Second timestamp should be 112 seconds');
    assertEqual(result.heatmapData[1].engagement_score, 0.91, 'Second engagement score should be 0.91');
  });

  // Test 2: Milliseconds to seconds conversion (with rounding)
  test('Correctly converts milliseconds to seconds with floor rounding', () => {
    const apifyResult = [
      {
        videoId: 'test',
        heatSeek: [
          { startMillis: 1500, durationMillis: 1000, intensityScoreNormalized: 0.5 },
          { startMillis: 2999, durationMillis: 1000, intensityScoreNormalized: 0.6 },
          { startMillis: 3001, durationMillis: 1000, intensityScoreNormalized: 0.7 }
        ]
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assertEqual(result.heatmapData[0].timestamp_seconds, 1, '1500ms should floor to 1 second');
    assertEqual(result.heatmapData[1].timestamp_seconds, 2, '2999ms should floor to 2 seconds');
    assertEqual(result.heatmapData[2].timestamp_seconds, 3, '3001ms should floor to 3 seconds');
  });

  // Test 3: Output format validation
  test('Output has correct structure and properties', () => {
    const apifyResult = [
      {
        videoId: 'test',
        heatSeek: [
          { startMillis: 10000, durationMillis: 1000, intensityScoreNormalized: 0.5 }
        ]
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assert(result.hasOwnProperty('heatmapData'), 'Should have heatmapData property');
    assert(Array.isArray(result.heatmapData), 'heatmapData should be an array');
    assert(result.heatmapData[0].hasOwnProperty('timestamp_seconds'), 'Should have timestamp_seconds');
    assert(result.heatmapData[0].hasOwnProperty('engagement_score'), 'Should have engagement_score');
    assert(!result.heatmapData[0].hasOwnProperty('startMillis'), 'Should NOT have startMillis');
    assert(!result.heatmapData[0].hasOwnProperty('durationMillis'), 'Should NOT have durationMillis');
    assert(!result.heatmapData[0].hasOwnProperty('intensityScoreNormalized'), 'Should NOT have intensityScoreNormalized');
    assertEqual(typeof result.heatmapData[0].timestamp_seconds, 'number', 'timestamp_seconds should be a number');
    assertEqual(typeof result.heatmapData[0].engagement_score, 'number', 'engagement_score should be a number');
  });

  // Test 4: Error handling - empty result array
  test('Throws error for empty Apify result', () => {
    try {
      transformHeatmapData([]);
      throw new Error('Should have thrown an error');
    } catch (error) {
      assert(error.message.includes('No video data'), 'Error message should mention no video data');
    }
  });

  // Test 5: Error handling - missing heatSeek
  test('Throws error when heatSeek is missing', () => {
    const apifyResult = [
      {
        videoId: 'test',
        title: 'Test Video'
        // heatSeek is missing
      }
    ];

    try {
      transformHeatmapData(apifyResult);
      throw new Error('Should have thrown an error');
    } catch (error) {
      assert(error.message.includes('No heatmap data'), 'Error message should mention no heatmap data');
    }
  });

  // Test 6: Error handling - empty heatSeek array
  test('Throws error when heatSeek array is empty', () => {
    const apifyResult = [
      {
        videoId: 'test',
        heatSeek: []
      }
    ];

    try {
      transformHeatmapData(apifyResult);
      throw new Error('Should have thrown an error');
    } catch (error) {
      assert(error.message.includes('heatSeek array is empty'), 'Error message should mention empty heatSeek');
    }
  });

  // Test 7: Error handling - null/undefined input
  test('Throws error for null input', () => {
    try {
      transformHeatmapData(null);
      throw new Error('Should have thrown an error');
    } catch (error) {
      assert(error.message.includes('No video data'), 'Error message should handle null input');
    }
  });

  // Test 8: Real-world scenario with full actor output
  test('Handles complete Apify actor output structure', () => {
    const apifyResult = [
      {
        channelOwner: 'Rick Astley',
        title: 'Rick Astley - Never Gonna Give You Up (Official Video)',
        titleJson: '{"simpleText":"Rick Astley - Never Gonna Give You Up (Official Video)"}',
        videoId: 'dQw4w9WgXcQ',
        viewCount: '1,112,246 views',
        likes: '45K',
        comments: '810',
        dateText: 'May 24, 2023',
        relativeDate: '1 year ago',
        mostReplayed: [
          {
            visibleTimeRangeStartMillis: 47000,
            visibleTimeRangeEndMillis: 52000,
            decorationTimeMillis: 49000
          }
        ],
        heatSeek: [
          { startMillis: 5000, durationMillis: 2000, intensityScoreNormalized: 0.42 },
          { startMillis: 12000, durationMillis: 3000, intensityScoreNormalized: 0.38 },
          { startMillis: 30000, durationMillis: 5000, intensityScoreNormalized: 0.85 },
          { startMillis: 67000, durationMillis: 4000, intensityScoreNormalized: 0.92 },
          { startMillis: 95000, durationMillis: 6000, intensityScoreNormalized: 0.78 }
        ]
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assertEqual(result.heatmapData.length, 5, 'Should have 5 data points');
    assertEqual(result.heatmapData[0].timestamp_seconds, 5, 'First timestamp should be 5');
    assertEqual(result.heatmapData[3].timestamp_seconds, 67, 'Fourth timestamp should be 67');
    assertEqual(result.heatmapData[3].engagement_score, 0.92, 'Fourth score should be 0.92');
  });

  // Test 9: Large dataset
  test('Handles large heatSeek arrays efficiently', () => {
    const largeHeatSeek = [];
    for (let i = 0; i < 1000; i++) {
      largeHeatSeek.push({
        startMillis: i * 1000,
        durationMillis: 1000,
        intensityScoreNormalized: Math.random()
      });
    }

    const apifyResult = [
      {
        videoId: 'test',
        heatSeek: largeHeatSeek
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assertEqual(result.heatmapData.length, 1000, 'Should process all 1000 data points');
    assertEqual(result.heatmapData[0].timestamp_seconds, 0, 'First timestamp should be 0');
    assertEqual(result.heatmapData[999].timestamp_seconds, 999, 'Last timestamp should be 999');
  });

  // Test 10: Edge values for engagement scores
  test('Preserves edge values for engagement scores (0 and 1)', () => {
    const apifyResult = [
      {
        videoId: 'test',
        heatSeek: [
          { startMillis: 10000, durationMillis: 1000, intensityScoreNormalized: 0 },
          { startMillis: 20000, durationMillis: 1000, intensityScoreNormalized: 1 },
          { startMillis: 30000, durationMillis: 1000, intensityScoreNormalized: 0.5 }
        ]
      }
    ];

    const result = transformHeatmapData(apifyResult);

    assertEqual(result.heatmapData[0].engagement_score, 0, 'Should preserve 0 engagement score');
    assertEqual(result.heatmapData[1].engagement_score, 1, 'Should preserve 1 engagement score');
    assertEqual(result.heatmapData[2].engagement_score, 0.5, 'Should preserve 0.5 engagement score');
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(50));

  if (failed > 0) {
    process.exit(1);
  }
}

// Run all tests
runTests();
