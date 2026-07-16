const {
  estimateReviewTime,
  aggregateReportTimeMetrics,
  getReportTimeMetrics,
} = require('../timeEstimationService');

describe('timeEstimationService', () => {
  test('estimates manual, AI-assisted, and saved review minutes from pages and issues', () => {
    const result = estimateReviewTime({
      pageCount: 4,
      wordCount: 1800,
      errors: [
        { type: 'placeholder', severity: 'medium' },
        { type: 'compliance', severity: 'high' },
        { type: 'formatting', severity: 'low' },
      ],
    });

    expect(result).toEqual({
      estimatedPages: 4,
      estimatedManualReviewMinutes: 15,
      estimatedAiReviewMinutes: 5,
      estimatedTimeSavedMinutes: 10,
      timeSavedPercent: 65,
    });
  });

  test('falls back to word count when page count is unavailable', () => {
    const result = estimateReviewTime({
      wordCount: 1250,
      errors: [],
    });

    expect(result.estimatedPages).toBe(3);
    expect(result.estimatedManualReviewMinutes).toBe(8);
    expect(result.estimatedAiReviewMinutes).toBe(3);
    expect(result.estimatedTimeSavedMinutes).toBe(5);
  });

  test('aggregates explicit estimate fields while preserving legacy saved minutes fallback', () => {
    const result = aggregateReportTimeMetrics([
      {
        estimatedManualReviewMinutes: 10,
        estimatedAiReviewMinutes: 4,
        estimatedTimeSavedMinutes: 6,
      },
      {
        timeSaved: 3,
      },
    ]);

    expect(result).toEqual({
      totalManualReviewMinutes: 10,
      totalAiReviewMinutes: 4,
      totalTimeSavedMinutes: 9,
      timeSavedPercent: 90,
    });
  });

  test('can re-estimate legacy reports when metadata and errors are available', () => {
    const result = getReportTimeMetrics({
      timeSaved: 2,
      metadata: { pageCount: 2, wordCount: 800 },
      errors: [{ type: 'missing_data', severity: 'high' }],
    });

    expect(result).toEqual({
      manualMinutes: 8,
      aiMinutes: 3,
      savedMinutes: 5,
    });
  });
});
