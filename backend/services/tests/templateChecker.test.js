const { detect } = require('../errorDetection/templateChecker');

describe('templateChecker', () => {
  test('reports missing template sections and required fields', () => {
    const errors = detect('Executive Summary only', {
      sections: ['Fire Risk Assessment', 'Action Plan'],
      requiredFields: ['Client Name', 'Assessment Date'],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'compliance',
          severity: 'medium',
          message: 'Template section "Fire Risk Assessment" not found in report',
          originalText: 'Fire Risk Assessment',
        }),
        expect.objectContaining({
          type: 'compliance',
          severity: 'medium',
          message: 'Required field "Client Name" is missing from report',
          originalText: 'Client Name',
        }),
      ])
    );
  });

  test('reports required fields that are present but empty', () => {
    const errors = detect('Client Name:', {
      sections: [],
      requiredFields: ['Client Name'],
    });

    expect(errors).toEqual([
      expect.objectContaining({
        type: 'compliance',
        severity: 'low',
        message: 'Required field "Client Name" appears to be empty',
        originalText: 'Client Name',
      }),
    ]);
  });

  test('returns no errors for present sections and populated fields', () => {
    const errors = detect(
      'Fire Risk Assessment\nAction Plan\nClient Name: Ada Lovelace\nAssessment Date: 12 March 2026',
      {
        sections: ['Fire Risk Assessment', 'Action Plan'],
        requiredFields: ['Client Name', 'Assessment Date'],
      }
    );

    expect(errors).toEqual([]);
  });

  test('ignores blank or too-short template entries', () => {
    const errors = detect('', {
      sections: ['', 'AB'],
      requiredFields: ['', 'CD'],
    });

    expect(errors).toEqual([]);
  });
});
