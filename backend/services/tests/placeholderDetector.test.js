const { detect } = require('../errorDetection/placeholderDetector');

describe('placeholderDetector', () => {
  test('detects placeholders with numbered section context', () => {
    const errors = detect([
      '5. Premises Details',
      'Building Size: XXXXX sq ft',
      'Evacuation Policy: TBD',
      'Responsible Person: N/A',
    ].join('\n'));

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'placeholder',
          location: { section: '5. Premises Details', lineStart: 2 },
          originalText: 'XXXXX',
        }),
        expect.objectContaining({
          type: 'placeholder',
          location: { section: '5. Premises Details', lineStart: 3 },
          originalText: 'TBD',
        }),
        expect.objectContaining({
          type: 'placeholder',
          location: { section: '5. Premises Details', lineStart: 4 },
          originalText: 'N/A',
        }),
      ])
    );
  });

  test('ignores table-of-contents, guidance, and non-standalone false positives', () => {
    const errors = detect([
      'Table of Contents',
      '[BS 9999] ................................ 12',
      'The following simple risk level estimator is based on likelihood of fire.',
      'N/A should not be flagged where applicable in this explanatory sentence.',
      'This TBD token appears inside a much longer descriptive sentence and is not standalone.',
    ].join('\n'));

    expect(errors).toEqual([]);
  });

  test('uses section-number headings when no dotted heading is present', () => {
    const errors = detect([
      '6: Fire Hazards',
      '[INSERT HAZARD DETAILS]',
    ].join('\n'));

    expect(errors).toHaveLength(2);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          location: { section: '6: Fire Hazards', lineStart: 2 },
          originalText: '[INSERT HAZARD DETAILS]',
        }),
      ])
    );
  });
});
