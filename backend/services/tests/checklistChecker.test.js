const {
  detect,
  checklistVersion,
  checklistItems,
} = require('../errorDetection/checklistChecker');

const makeLongText = (body) => `${body}\n${'general report content '.repeat(350)}`;

describe('checklistChecker', () => {
  test('returns no errors for short reports', () => {
    expect(detect('Short report')).toEqual([]);
  });

  test('reports checklist failures for substantial reports without evidence', () => {
    const errors = detect(makeLongText('Fire risk assessment report with limited detail.'));

    expect(errors.length).toBeGreaterThan(0);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'compliance',
          severity: 'high',
          message: expect.stringContaining('Checklist 1A not evidenced'),
          originalText: `Checklist ${checklistVersion} / 1A`,
        }),
      ])
    );
  });

  test('reports partially evidenced all-mode checklist items with low severity', () => {
    const errors = detect(
      makeLongText('Site address: 10 Example Street, Cardiff CF10 1AA.')
    );

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'compliance',
          severity: 'low',
          message: expect.stringContaining('Checklist 1E partially evidenced'),
          originalText: `Checklist ${checklistVersion} / 1E (1/2 criteria met)`,
        }),
      ])
    );
  });

  test('exposes checklist metadata for reporting', () => {
    expect(checklistVersion).toBe('BAFE-SP205-Appendix-D-2022-v1');
    expect(checklistItems.length).toBeGreaterThan(0);
    expect(checklistItems[0]).toEqual(
      expect.objectContaining({
        id: '1A',
        title: 'Identity of the client',
      })
    );
  });
});
