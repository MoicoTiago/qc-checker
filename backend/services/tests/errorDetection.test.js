jest.mock('../mlService', () => ({
  getFeatureEmbedding: jest.fn().mockResolvedValue(new Array(384).fill(0)),
  classifyText: jest.fn().mockResolvedValue({ label: 'complete', score: 0.5 }),
}));

jest.mock('../trainingService', () => ({
  applyContextAwareErrorRescoring: jest.fn().mockImplementation((errors) => ({
    errors,
    adjustments: [],
  })),
  getActiveTemplate: jest.fn().mockResolvedValue(null),
}));

jest.mock('../timeEstimationService', () => ({
  estimateReviewTime: jest.fn().mockReturnValue({
    estimatedManualReviewMinutes: 10,
    estimatedAiReviewMinutes: 2,
    estimatedTimeSavedMinutes: 8,
    timeSavedPercent: 80,
  }),
}));

const { analyzeDocument } = require('../errorDetection');

describe('analyzeDocument', () => {
  test('detects placeholder text like "XXXXX" and "XXX"', async () => {
    const text = 'The client name is XXXXX and reference is XXX.';
    const result = await analyzeDocument(text, []);

    const xxErrors = result.errors.filter(
      (e) => e.type === 'placeholder' && /XX/.test(e.originalText)
    );
    expect(xxErrors.length).toBeGreaterThanOrEqual(1);
  });

  test('detects formatting issues like "Lorem ipsum"', async () => {
    const text = 'Section 1 overview.\nLorem ipsum dolor sit amet.';
    const result = await analyzeDocument(text, []);

    const loremErrors = result.errors.filter(
      (e) => e.type === 'formatting' && /lorem ipsum/i.test(e.originalText)
    );
    expect(loremErrors.length).toBeGreaterThanOrEqual(1);
  });

  test('detects bracket placeholders like "[INSERT NAME]"', async () => {
    const text = 'Dear [INSERT NAME], we are writing to confirm your booking.';
    const result = await analyzeDocument(text, []);

    const insertErrors = result.errors.filter(
      (e) => e.type === 'placeholder' && /INSERT NAME/i.test(e.originalText)
    );
    expect(insertErrors.length).toBeGreaterThanOrEqual(1);
  });

  test('detects asterisk placeholders like "***DELETE THIS***"', async () => {
    const text = 'Please review the following: ***DELETE THIS*** before submitting.';
    const result = await analyzeDocument(text, []);

    const asteriskErrors = result.errors.filter(
      (e) => e.type === 'placeholder' && /\*/.test(e.originalText)
    );
    expect(asteriskErrors.length).toBeGreaterThanOrEqual(1);
  });

  test('returns correct errorSummary shape with all 5 categories', async () => {
    const text = 'XXXXX [INSERT NAME] Lorem ipsum\n***DELETE THIS***';
    const result = await analyzeDocument(text, []);

    expect(result.errorSummary).toEqual(
      expect.objectContaining({
        placeholder: expect.any(Number),
        consistency: expect.any(Number),
        compliance: expect.any(Number),
        formatting: expect.any(Number),
        missing_data: expect.any(Number),
      })
    );
    expect(Object.keys(result.errorSummary)).toHaveLength(5);
  });

  test('deduplicates identical errors (same type + text + line)', async () => {
    const text = 'Line with XXXXX placeholder.';
    const result = await analyzeDocument(text, []);

    const xxOnLine1 = result.errors.filter(
      (e) =>
        e.type === 'placeholder' &&
        /XX/.test(e.originalText) &&
        e.location?.lineStart === 1
    );
    expect(xxOnLine1.length).toBe(1);
  });

  test('returns errors sorted by type order (placeholder first)', async () => {
    const text = 'XXXXX placeholder here.\nLorem ipsum filler text.';
    const result = await analyzeDocument(text, []);

    const typeOrder = {
      placeholder: 0,
      consistency: 1,
      compliance: 2,
      formatting: 3,
      missing_data: 4,
    };

    for (let i = 1; i < result.errors.length; i++) {
      const prevOrder = typeOrder[result.errors[i - 1].type] ?? 99;
      const currOrder = typeOrder[result.errors[i].type] ?? 99;
      expect(prevOrder).toBeLessThanOrEqual(currOrder);
    }
  });

  test('returns timing / time-saved estimates', async () => {
    const text = 'Report with XXXXX placeholder and [INSERT NAME] here.';
    const result = await analyzeDocument(text, []);

    expect(result).toHaveProperty('estimatedManualReviewMinutes');
    expect(result).toHaveProperty('estimatedAiReviewMinutes');
    expect(result).toHaveProperty('estimatedTimeSavedMinutes');
    expect(result).toHaveProperty('timeSavedPercent');
    expect(typeof result.estimatedTimeSavedMinutes).toBe('number');
  });

  test('empty / minimal text reports missing required sections', async () => {
    const result = await analyzeDocument('', []);

    expect(result.errorCount).toBeGreaterThan(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'missing_data',
          message: expect.stringContaining('Required section'),
        }),
      ])
    );
    expect(result.errorSummary).toEqual(
      expect.objectContaining({
        placeholder: 0,
        consistency: 0,
        compliance: 0,
        formatting: 0,
        missing_data: expect.any(Number),
      })
    );
    expect(result.errorSummary.missing_data).toBeGreaterThan(0);
  });
});
