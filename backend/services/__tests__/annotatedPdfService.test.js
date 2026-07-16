jest.mock('fs', () => ({
  readFileSync: jest.fn(() => Buffer.from('pdf-bytes')),
}));

const mockPdfPage = () => ({
  getSize: jest.fn(() => ({ width: 612, height: 792 })),
  drawRectangle: jest.fn(),
  drawCircle: jest.fn(),
  drawText: jest.fn(),
});

const mockPdfDoc = {
  getPages: jest.fn(),
  embedFont: jest.fn(async (font) => font),
  addPage: jest.fn(),
  save: jest.fn(async () => new Uint8Array([1, 2, 3])),
};

jest.mock('pdf-lib', () => ({
  PDFDocument: {
    load: jest.fn(async () => mockPdfDoc),
  },
  StandardFonts: {
    Helvetica: 'Helvetica',
    HelveticaBold: 'HelveticaBold',
  },
  rgb: jest.fn((r, g, b) => ({ r, g, b })),
}), { virtual: true });
jest.mock('pdf-parse', () => jest.fn(), { virtual: true });

const fs = require('fs');
const pdfParse = require('pdf-parse');
const pdfLib = require('pdf-lib');
const {
  generateAnnotatedPdf,
  __test__: {
    buildRawLinesFromItems,
    buildCleanedLineRecords,
    buildSectionRanges,
    findBestHighlightMatch,
    findHighlightMatchesOnLine,
    planAnnotationMatches,
    findAllPlaceholderTextMatches,
    getRectForItemSegment,
  },
} = require('../annotatedPdfService');

const makeLine = (pageNum, rawText, x = 70, y = 500, width = null) => ({
  pageNum,
  viewportHeight: 792,
  rawText,
  items: [
    {
      text: rawText,
      transform: [10, 0, 0, 10, x, y],
      width: width ?? rawText.length * 5,
      height: 10,
      start: 0,
      end: rawText.length,
    },
  ],
});

describe('annotatedPdfService matching helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('line cleanup keeps page-separated line numbers aligned', () => {
    const pageMap = {
      1: {
        viewportHeight: 792,
        rawLines: [
          makeLine(1, 'Page 1 of 2'),
          makeLine(1, 'Building Size: XXXXX sq. Ft'),
        ],
      },
      2: {
        viewportHeight: 792,
        rawLines: [makeLine(2, 'Number of Storeys (ground floor and above): XXX')],
      },
    };

    const cleanedLines = buildCleanedLineRecords(pageMap, 2);

    expect(cleanedLines[0].lineNumber).toBe(1);
    expect(cleanedLines[0].cleanedText).toBe('Building Size: XXXXX sq. Ft');
    expect(cleanedLines[1].lineNumber).toBe(2);
    expect(cleanedLines[1].cleanedText).toBe('');
    expect(cleanedLines[2].lineNumber).toBe(3);
    expect(cleanedLines[2].cleanedText).toBe(
      'Number of Storeys (ground floor and above): XXX'
    );
  });

  test('line-level match narrows highlight to the error substring', () => {
    const lineRecord = {
      lineNumber: 1,
      pageNum: 1,
      viewportHeight: 792,
      rawText: 'Building Size: XXXXX sq. Ft',
      cleanedText: 'Building Size: XXXXX sq. Ft',
      items: [
        {
          text: 'Building Size: XXXXX sq. Ft',
          transform: [10, 0, 0, 10, 70, 500],
          width: 125,
          height: 10,
          start: 0,
          end: 26,
        },
      ],
    };

    const match = findHighlightMatchesOnLine(lineRecord, {
      originalText: 'XXXXX',
      location: { lineStart: 1 },
    })[0];

    expect(match.matchType).toBe('raw-substring');
    expect(match.rect.x).toBeGreaterThan(120);
    expect(match.rect.width).toBeLessThan(40);
  });

  test('rotated item geometry produces a tall page-space box instead of a wide one', () => {
    const rect = getRectForItemSegment({
      text: 'Item Description',
      transform: [0, 7, -7, 0, 519.8, 73],
      width: 50.568,
      height: 7,
      start: 0,
      end: 16,
    });

    expect(rect.height).toBeGreaterThan(rect.width);
    expect(rect.width).toBeLessThan(20);
  });

  test('best match stays inside the requested section and uses later duplicate occurrences', () => {
    const pageMap = {
      1: {
        viewportHeight: 792,
        rawLines: [
          makeLine(1, '9.6. Fire Protection Systems - Fire Alarm', 70, 500),
          makeLine(1, 'The panel is located XXX and repeaters XXX', 70, 480),
        ],
      },
      2: {
        viewportHeight: 792,
        rawLines: [
          makeLine(2, '9.7. Compartmentation', 70, 500),
          makeLine(2, 'Fire compartmentation seems to be provided in XXX', 70, 480),
        ],
      },
    };

    const cleanedLines = buildCleanedLineRecords(pageMap, 2);
    const sectionRanges = buildSectionRanges(cleanedLines);
    const error = {
      originalText: 'XXX',
      location: { section: '9.6. Fire Protection Systems - Fire Alarm Existing' },
    };

    const usedMatchKeys = new Set();
    const firstMatch = findBestHighlightMatch(
      error,
      cleanedLines,
      sectionRanges,
      usedMatchKeys
    );
    usedMatchKeys.add(firstMatch.key);
    const secondMatch = findBestHighlightMatch(
      error,
      cleanedLines,
      sectionRanges,
      usedMatchKeys
    );

    expect(firstMatch.pageNum).toBe(1);
    expect(secondMatch.pageNum).toBe(1);
    expect(secondMatch.rect.y).toBeGreaterThanOrEqual(firstMatch.rect.y);
    expect(firstMatch.matchType).toBe('raw-substring');
    expect(secondMatch.matchType).toBe('raw-substring');
  });

  test('rotated page items are grouped into separate visual lines', () => {
    const rawLines = buildRawLinesFromItems(
      [
        { str: '9.6. Fire Protection Systems - Fire Alarm', transform: [0, 14, -14, 0, 91, 70], width: 269.206, height: 14 },
        { str: 'Existing Controls and Observations', transform: [0, 10, -10, 0, 116, 70], width: 170.04, height: 10 },
        { str: 'Item Description', transform: [0, 7, -7, 0, 519.8, 73], width: 50.568, height: 7 },
      ],
      27,
      842
    );

    expect(rawLines).toHaveLength(3);
    expect(rawLines[0].rawText).toContain('9.6.');
    expect(rawLines[1].rawText).toContain('Existing Controls');
    expect(rawLines[2].rawText).toContain('Item Description');
  });

  test('placeholder fallback returns all repeated placeholder positions on a line', () => {
    const lineRecord = {
      lineNumber: 1088,
      pageNum: 38,
      viewportHeight: 792,
      rawText: 'There are XXX accommodation staircases serving XXX floors within the building.',
      cleanedText:
        'There are XXX accommodation staircases serving XXX floors within the building.',
      items: [
        {
          text: 'There are XXX accommodation staircases serving XXX floors within the building.',
          transform: [0, 10, -10, 0, 339, 110],
          width: 380,
          height: 10,
          start: 0,
          end: 76,
        },
      ],
    };

    const matches = findHighlightMatchesOnLine(lineRecord, {
      originalText: '[ENTER VALUE]',
      type: 'placeholder',
      location: { lineStart: 1088 },
    });

    expect(matches).toHaveLength(2);
    expect(matches[0].matchType).toBe('placeholder-fallback');
    expect(matches[1].matchStart).toBeGreaterThan(matches[0].matchStart);
  });

  test('section match planning prefers the detector line number for repeated XXX errors', () => {
    const pageMap = {
      1: {
        viewportHeight: 792,
        rawLines: [
          makeLine(1, '9.16. Means of Escape'),
          makeLine(1, 'Existing Controls and Observations'),
          makeLine(
            1,
            'In the buildings current configuration, there are XXX protected staircases that serve the XXX floors.'
          ),
          makeLine(
            1,
            'There are XXX accommodation staircases serving XXX floors within the building.'
          ),
          makeLine(
            1,
            'There are XXX external escape staircases from the building, serving XXX floors.'
          ),
        ],
      },
    };

    const cleanedLines = buildCleanedLineRecords(pageMap, 1);
    const sectionRanges = buildSectionRanges(cleanedLines);
    const errors = [
      {
        originalText: 'XXX',
        type: 'placeholder',
        location: {
          section: '9.16. Means of Escape Existing Controls and Observations',
          lineStart: 4,
        },
      },
      {
        originalText: 'XXX',
        type: 'placeholder',
        location: {
          section: '9.16. Means of Escape Existing Controls and Observations',
          lineStart: 5,
        },
      },
    ];

    const matches = planAnnotationMatches(errors, cleanedLines, sectionRanges);

    expect(matches[0].lineNumber).toBe(4);
    expect(matches[1].lineNumber).toBe(5);
  });

  test('placeholder scan deduplicates overlapping regex hits for the same bracket token', () => {
    const matches = findAllPlaceholderTextMatches(
      'Escape route: [ENTER FINAL EXIT LOCATION]'
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('[ENTER FINAL EXIT LOCATION]');
  });

  test('placeholder scan matches long bracketed section 9 choice text', () => {
    const matches = findAllPlaceholderTextMatches(
      '[final fire exit / to a protected route from the foot of the stairway enclosure leading to a final exit]'
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toContain('final fire exit');
  });

  test('wrapped star placeholders are highlighted as a single match', () => {
    const matches = findAllPlaceholderTextMatches('***COMMERCIAL***');

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('***COMMERCIAL***');
  });

  test('generateAnnotatedPdf draws highlights and appends a summary page', async () => {
    const page = mockPdfPage();
    const summaryPage = mockPdfPage();
    mockPdfDoc.getPages.mockReturnValue([page]);
    mockPdfDoc.addPage.mockReturnValue(summaryPage);

    const pageData = {
      getViewport: jest.fn(() => ({ height: 792 })),
      getTextContent: jest.fn(async () => ({
        items: [
          {
            str: '1. Summary',
            transform: [10, 0, 0, 10, 70, 700],
            width: 80,
            height: 10,
          },
          {
            str: 'Building Size: XXXXX sq. Ft',
            transform: [10, 0, 0, 10, 70, 680],
            width: 150,
            height: 10,
          },
          {
            str: '9. Action Plan',
            transform: [10, 0, 0, 10, 70, 640],
            width: 100,
            height: 10,
          },
          {
            str: 'Item Description XXX',
            transform: [10, 0, 0, 10, 70, 620],
            width: 140,
            height: 10,
          },
        ],
      })),
    };

    pdfParse.mockImplementation(async (buffer, options) => {
      await options.pagerender(pageData);
      return { numpages: 1 };
    });

    const result = await generateAnnotatedPdf({
      filename: 'inspection.pdf',
      filePath: '/uploads/inspection.pdf',
      errors: [
        {
          type: 'missing_data',
          message: 'Building size is incomplete',
          originalText: 'XXXXX',
          location: { section: '1. Summary', lineStart: 2 },
        },
        {
          type: 'compliance',
          message: 'Action item is incomplete',
          originalText: 'XXX',
          location: { section: '9. Action Plan', lineStart: 4 },
          toObject() {
            return {
              type: 'compliance',
              message: 'Action item is incomplete',
              originalText: 'XXX',
              location: { section: '9. Action Plan', lineStart: 4 },
            };
          },
        },
        {
          type: 'formatting',
          message: 'Ignored section',
          originalText: 'ignored',
          location: { section: '2. Competent Persons' },
        },
      ],
    });

    expect(fs.readFileSync).toHaveBeenCalledWith('/uploads/inspection.pdf');
    expect(pdfLib.PDFDocument.load).toHaveBeenCalledWith(Buffer.from('pdf-bytes'), {
      ignoreEncryption: true,
    });
    expect(pdfParse).toHaveBeenCalledTimes(2);
    expect(page.drawRectangle).toHaveBeenCalled();
    expect(page.drawText).toHaveBeenCalled();
    expect(mockPdfDoc.addPage).toHaveBeenCalledWith([612, 792]);
    expect(summaryPage.drawText).toHaveBeenCalledWith(
      'QC Error Summary',
      expect.objectContaining({ size: 24 })
    );
    expect(summaryPage.drawText).toHaveBeenCalledWith(
      'inspection.pdf',
      expect.objectContaining({ size: 10 })
    );
    expect(summaryPage.drawText).toHaveBeenCalledWith(
      expect.stringContaining('Errors highlighted:'),
      expect.objectContaining({ size: 14 })
    );
    expect(result).toEqual(Buffer.from([1, 2, 3]));
  });
});
