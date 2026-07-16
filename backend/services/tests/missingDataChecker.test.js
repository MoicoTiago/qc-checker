const {
  detect,
  requiredSections,
  requiredFields,
} = require('../errorDetection/missingDataChecker');

const requiredSectionText = [
  '1. Summary',
  '2. Competent Persons',
  '3. Introduction',
  '5. Premises Details',
  '8. Fire Risk Assessment',
  '9. Risk Assessment and Action Plan',
].join('\n');

describe('missingDataChecker', () => {
  test('reports all required sections when they are missing', () => {
    const errors = detect('Short document', [], {});

    requiredSections.forEach((section) => {
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'missing_data',
            severity: 'high',
            message: `Required section "${section.name}" not found`,
            originalText: section.name,
          }),
        ])
      );
    });
  });

  test('does not require visit date when header text is unusable and date label is absent', () => {
    const errors = detect(requiredSectionText, [], {
      hasUsableText: false,
      rawHeaderText: 'Fire risk assessment',
    });

    expect(errors).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Field "Visit Date" appears to be empty or incomplete',
        }),
      ])
    );
  });

  test('reports empty header-style labels through empty-field detection', () => {
    const text = `${requiredSectionText}
Reference Number:
Site Address:
Consultant:
Evacuation Policy:
Overall Risk:`;

    const errors = detect(text, [], {
      rawHeaderText: text,
      hasUsableText: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'medium',
          message: 'Empty or missing value for "Reference Number"',
          originalText: 'Reference Number:',
        }),
        expect.objectContaining({
          severity: 'medium',
          message: 'Empty or missing value for "Consultant"',
          originalText: 'Consultant:',
        }),
        expect.objectContaining({
          severity: 'medium',
          message: 'Empty or missing value for "Overall Risk"',
          originalText: 'Overall Risk:',
        }),
      ])
    );
  });

  test('accepts values from parsed header fields and populated labels', () => {
    const text = `${requiredSectionText}
Reference Number: FRA-2026-001
Visit Date: 12 March 2026
Site Address: 10 Example Street, Cardiff CF10 1AA
Consultant: Ada Lovelace
Evacuation Policy: Simultaneous evacuation
Overall Risk: Tolerable`;

    const errors = detect(text, [], {
      referenceNumber: 'FRA-2026-001',
      visitDate: '12 March 2026',
      consultant: 'Ada Lovelace',
      rawHeaderText: text,
      hasUsableText: true,
    });

    requiredFields.forEach((field) => {
      expect(errors).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: expect.stringContaining(field.name),
          }),
        ])
      );
    });
  });

  test('reports empty custom fields near the nearest numbered section and caps repeated matches', () => {
    const text = `${requiredSectionText}
5.1 Building Details
Custom Field:
Another Field:
Third Field:
Fourth Field:
Fifth Field:
Sixth Field:
Seventh Field:
Table:
12345:
Very Long Field Name With More Than Five Words Here:`;

    const errors = detect(text, [], {
      referenceNumber: 'FRA-2026-001',
      visitDate: '12 March 2026',
      consultant: 'Ada Lovelace',
      rawHeaderText: 'Reference Number Visit Date Consultant',
      hasUsableText: true,
    });

    const emptyFieldErrors = errors.filter((error) =>
      error.message.startsWith('Empty or missing value for')
    );

    expect(emptyFieldErrors).toHaveLength(5);
    expect(emptyFieldErrors[0]).toEqual(
      expect.objectContaining({
        location: { section: '5.1 Building Details' },
        originalText: 'Custom Field:',
      })
    );
    expect(emptyFieldErrors.map((error) => error.originalText)).not.toContain('Table:');
    expect(emptyFieldErrors.map((error) => error.originalText)).not.toContain('12345:');
  });
});
