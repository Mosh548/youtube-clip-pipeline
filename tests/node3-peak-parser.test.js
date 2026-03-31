/**
 * Tests for Node 3 — Peak Parser
 */

const { parsePeaks } = require('../nodes/code-nodes/node3-peak-parser-standalone');

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

  // Test 1: Basic functionality - returns top 5 peaks with spacing
  test('Returns top 5 peaks sorted by engagement score with proper spacing', () => {
    const heatmap = [
      { timestamp_seconds: 10, engagement_score: 50 },
      { timestamp_seconds: 50, engagement_score: 80 },
      { timestamp_seconds: 90, engagement_score: 60 },
      { timestamp_seconds: 130, engagement_score: 90 },
      { timestamp_seconds: 170, engagement_score: 70 },
      { timestamp_seconds: 210, engagement_score: 40 },
      { timestamp_seconds: 250, engagement_score: 95 },
    ];

    const result = parsePeaks(heatmap);

    // All peaks are >20s apart, so all top 5 should be returned
    assertEqual(result.length, 5, 'Should return 5 peaks');
    assertEqual(result[0].peak_timestamp, 250, 'First peak should be timestamp 250 (score 95)');
    assertEqual(result[1].peak_timestamp, 130, 'Second peak should be timestamp 130 (score 90)');
    assertEqual(result[2].peak_timestamp, 50, 'Third peak should be timestamp 50 (score 80)');
    assertEqual(result[3].peak_timestamp, 170, 'Fourth peak should be timestamp 170 (score 70)');
    assertEqual(result[4].peak_timestamp, 90, 'Fifth peak should be timestamp 90 (score 60)');
  });

  // Test 2: Deduplication within 20 seconds
  test('Deduplicates peaks within 20 seconds (keeps higher score)', () => {
    const heatmap = [
      { timestamp_seconds: 10, engagement_score: 80 },
      { timestamp_seconds: 15, engagement_score: 70 }, // Within 20s of 10, lower score - should be excluded
      { timestamp_seconds: 35, engagement_score: 90 }, // More than 20s away from 10
      { timestamp_seconds: 50, engagement_score: 85 },
      { timestamp_seconds: 55, engagement_score: 95 }, // Within 20s of 50, HIGHER score - should be included
    ];

    const result = parsePeaks(heatmap);

    // Expected: [55 (95), 35 (90), 50 (85), 10 (80)]
    // 15 should be excluded because it's within 20s of 10 and has lower score
    // 50 should be excluded because it's within 20s of 55 and has lower score
    assertEqual(result.length, 3, 'Should return 3 peaks after deduplication');
    assertEqual(result[0].peak_timestamp, 55, 'First peak should be timestamp 55 (score 95)');
    assertEqual(result[1].peak_timestamp, 35, 'Second peak should be timestamp 35 (score 90)');
    assertEqual(result[2].peak_timestamp, 10, 'Third peak should be timestamp 10 (score 80)');
  });

  // Test 3: Exact 20 second boundary
  test('Deduplicates peaks at exactly 20 seconds apart', () => {
    const heatmap = [
      { timestamp_seconds: 0, engagement_score: 80 },
      { timestamp_seconds: 19, engagement_score: 70 }, // 19 seconds - within window
      { timestamp_seconds: 20, engagement_score: 60 }, // Exactly 20 seconds - NOT within window (< 20, not <= 20)
    ];

    const result = parsePeaks(heatmap);

    // The deduplication check is < DEDUP_WINDOW, not <=
    // So 20 seconds exactly should NOT be deduplicated
    assertEqual(result.length, 2, 'Should return 2 peaks (20s is not within window)');
  });

  // Test 4: Empty input
  test('Handles empty heatmap array', () => {
    const result = parsePeaks([]);
    assertEqual(result, [], 'Should return empty array for empty input');
  });

  // Test 5: Less than 5 peaks available
  test('Returns all peaks when less than 5 available', () => {
    const heatmap = [
      { timestamp_seconds: 10, engagement_score: 50 },
      { timestamp_seconds: 50, engagement_score: 60 },
      { timestamp_seconds: 90, engagement_score: 70 },
    ];

    const result = parsePeaks(heatmap);
    assertEqual(result.length, 3, 'Should return 3 peaks when only 3 available');
  });

  // Test 6: All peaks within deduplication window
  test('Handles case where all peaks are clustered', () => {
    const heatmap = [
      { timestamp_seconds: 0, engagement_score: 50 },
      { timestamp_seconds: 5, engagement_score: 60 },
      { timestamp_seconds: 10, engagement_score: 70 },
      { timestamp_seconds: 15, engagement_score: 80 },
    ];

    const result = parsePeaks(heatmap);
    // Should only return the highest score (timestamp 15)
    assertEqual(result.length, 1, 'Should return 1 peak when all are within 20s');
    assertEqual(result[0].peak_timestamp, 15, 'Should be the highest scoring peak');
  });

  // Test 7: Custom topN parameter
  test('Respects custom topN parameter', () => {
    const heatmap = [
      { timestamp_seconds: 10, engagement_score: 50 },
      { timestamp_seconds: 40, engagement_score: 60 },
      { timestamp_seconds: 70, engagement_score: 70 },
      { timestamp_seconds: 100, engagement_score: 80 },
    ];

    const result = parsePeaks(heatmap, 2); // Request only top 2
    assertEqual(result.length, 2, 'Should return only 2 peaks');
    assertEqual(result[0].peak_timestamp, 100, 'First should be highest score');
    assertEqual(result[1].peak_timestamp, 70, 'Second should be second highest');
  });

  // Test 8: Custom deduplication window
  test('Respects custom deduplication window', () => {
    const heatmap = [
      { timestamp_seconds: 0, engagement_score: 80 },
      { timestamp_seconds: 15, engagement_score: 70 },
      { timestamp_seconds: 35, engagement_score: 90 },
    ];

    const result = parsePeaks(heatmap, 5, 10); // 10 second window
    // With 10s window, 15 is NOT within 10s of 0, so both should be included
    assertEqual(result.length, 3, 'Should return all 3 peaks with 10s window');
  });

  // Test 9: Output format validation
  test('Returns correct output format', () => {
    const heatmap = [
      { timestamp_seconds: 100, engagement_score: 90 },
    ];

    const result = parsePeaks(heatmap);
    assert(Array.isArray(result), 'Result should be an array');
    assert(result[0].hasOwnProperty('peak_timestamp'), 'Should have peak_timestamp property');
    assert(!result[0].hasOwnProperty('engagement_score'), 'Should not include engagement_score');
    assertEqual(typeof result[0].peak_timestamp, 'number', 'peak_timestamp should be a number');
  });

  // Test 10: Real-world scenario
  test('Real-world scenario with realistic heatmap data', () => {
    const heatmap = [
      { timestamp_seconds: 5, engagement_score: 42 },
      { timestamp_seconds: 12, engagement_score: 38 },
      { timestamp_seconds: 30, engagement_score: 85 },
      { timestamp_seconds: 35, engagement_score: 88 }, // Within 20s of 30, higher score
      { timestamp_seconds: 67, engagement_score: 92 },
      { timestamp_seconds: 70, engagement_score: 90 }, // Within 20s of 67, lower score
      { timestamp_seconds: 95, engagement_score: 78 },
      { timestamp_seconds: 120, engagement_score: 65 },
      { timestamp_seconds: 135, engagement_score: 55 },
      { timestamp_seconds: 180, engagement_score: 95 },
    ];

    const result = parsePeaks(heatmap);
    assertEqual(result.length, 5, 'Should return 5 peaks');

    // Expected order by score: 180(95), 67(92), 35(88), 95(78), 120(65)
    // 30 excluded (within 20s of 35, lower score)
    // 70 excluded (within 20s of 67, lower score)
    assertEqual(result[0].peak_timestamp, 180, 'Highest peak at 180s');
    assertEqual(result[1].peak_timestamp, 67, 'Second peak at 67s');
    assertEqual(result[2].peak_timestamp, 35, 'Third peak at 35s');
    assertEqual(result[3].peak_timestamp, 95, 'Fourth peak at 95s');
    assertEqual(result[4].peak_timestamp, 120, 'Fifth peak at 120s');
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
