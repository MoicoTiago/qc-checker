jest.mock('../mlService', () => ({
  isModelReady: jest.fn(),
  analyzeSectionCompleteness: jest.fn(),
  getEmbedding: jest.fn(),
  calculateSimilarity: jest.fn(),
}));

const mlService = require('../mlService');
const {
  analyzeWithML,
  findSimilarSections,
} = require('../errorDetection/mlEnhancedDetector');

const lowProseSection = (title = 'Fire Safety Arrangements') => ({
  title,
  content: Array.from({ length: 20 }, () => 'XXX 123 456 789').join('\n'),
});

const completeProseSection = {
  title: 'Fire Safety Management',
  content: [
    'The fire safety management arrangements are documented in detail for the premises.',
    'Responsible staff complete routine checks, keep records, and review actions regularly.',
    'The assessment includes specific observations about escape routes and protection systems.',
    'The responsible person has confirmed the procedures and the inspection regime.',
  ].join('\n'),
};

describe('mlEnhancedDetector.analyzeWithML', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEBUG_ML_SECTIONS;
  });

  test('returns no errors when ML models are not ready', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mlService.isModelReady.mockReturnValue(false);

    const errors = await analyzeWithML('', [lowProseSection()]);

    expect(errors).toEqual([]);
    expect(mlService.analyzeSectionCompleteness).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  test('reports high-confidence placeholder sections', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.analyzeSectionCompleteness.mockResolvedValue({
      isComplete: false,
      completenessScore: 0.91,
      classification: 'placeholder',
    });

    const errors = await analyzeWithML('', [lowProseSection('Action Plan')]);

    expect(mlService.analyzeSectionCompleteness).toHaveBeenCalledWith(
      expect.stringContaining('XXX')
    );
    expect(errors).toEqual([
      expect.objectContaining({
        type: 'placeholder',
        severity: 'high',
        message: 'Section may contain placeholder markers',
        location: { section: 'Action Plan' },
        suggestion: 'Replace placeholder markers with actual content',
        mlConfidence: 0.91,
      }),
    ]);
  });

  test('reports medium-confidence unfilled template sections', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.analyzeSectionCompleteness.mockResolvedValue({
      isComplete: false,
      completenessScore: 0.8,
      classification: 'template',
    });

    const errors = await analyzeWithML('', [lowProseSection('Assessment Summary')]);

    expect(errors).toEqual([
      expect.objectContaining({
        severity: 'medium',
        message: 'Section may contain unfilled template text',
        suggestion: 'Complete the template with specific information',
        mlConfidence: 0.8,
      }),
    ]);
  });

  test('skips structural, address-like, short, and clean prose sections', async () => {
    mlService.isModelReady.mockReturnValue(true);

    const errors = await analyzeWithML('', [
      { title: 'Contents', content: lowProseSection().content },
      { title: 'Premises Address', content: '10 Example Street\nLondon\nPostcode AB1 2CD' },
      { title: 'Tiny Section', content: 'Too short\nOnly two lines' },
      completeProseSection,
    ]);

    expect(errors).toEqual([]);
    expect(mlService.analyzeSectionCompleteness).not.toHaveBeenCalled();
  });

  test('ignores complete, low-confidence, and non-placeholder classifications', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.analyzeSectionCompleteness
      .mockResolvedValueOnce({
        isComplete: true,
        completenessScore: 0.95,
        classification: 'complete',
      })
      .mockResolvedValueOnce({
        isComplete: false,
        completenessScore: 0.6,
        classification: 'placeholder',
      })
      .mockResolvedValueOnce({
        isComplete: false,
        completenessScore: 0.95,
        classification: 'other',
      });

    const errors = await analyzeWithML('', [
      lowProseSection('Section One'),
      lowProseSection('Section Two'),
      lowProseSection('Section Three'),
    ]);

    expect(errors).toEqual([]);
  });

  test('logs and returns no errors when ML analysis throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mlService.isModelReady.mockReturnValue(true);
    mlService.analyzeSectionCompleteness.mockRejectedValue(new Error('classifier failed'));

    const errors = await analyzeWithML('', [lowProseSection()]);

    expect(errors).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('ML analysis error:', 'classifier failed');

    errorSpy.mockRestore();
  });
});

describe('mlEnhancedDetector.findSimilarSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns no errors when models are not ready or fewer than two sections are supplied', async () => {
    mlService.isModelReady.mockReturnValue(false);

    await expect(findSimilarSections([lowProseSection()])).resolves.toEqual([]);
    await expect(findSimilarSections([lowProseSection(), lowProseSection('Second')])).resolves.toEqual([]);
    expect(mlService.getEmbedding).not.toHaveBeenCalled();
  });

  test('reports suspiciously similar sections with different titles', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.getEmbedding
      .mockResolvedValueOnce([1, 0, 0])
      .mockResolvedValueOnce([0.95, 0.05, 0]);
    mlService.calculateSimilarity.mockReturnValue(0.96);

    const errors = await findSimilarSections([
      lowProseSection('Fire Alarm Systems'),
      lowProseSection('Emergency Lighting'),
    ]);

    expect(mlService.getEmbedding).toHaveBeenCalledTimes(2);
    expect(mlService.calculateSimilarity).toHaveBeenCalledWith([1, 0, 0], [0.95, 0.05, 0]);
    expect(errors).toEqual([
      expect.objectContaining({
        type: 'consistency',
        severity: 'medium',
        message: 'Sections "Fire Alarm Systems" and "Emergency Lighting" have very similar content (96% similar)',
        location: { section: 'Fire Alarm Systems' },
        suggestion: 'Review for duplicate or redundant content',
        originalText: 'Similarity: 96%',
        mlConfidence: 0.96,
      }),
    ]);
  });

  test('skips similar sections when titles overlap or similarity is too low', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.getEmbedding
      .mockResolvedValueOnce([1, 0])
      .mockResolvedValueOnce([1, 0])
      .mockResolvedValueOnce([0, 1]);
    mlService.calculateSimilarity
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.5);

    const errors = await findSimilarSections([
      lowProseSection('Fire Alarm'),
      lowProseSection('Fire Alarm Systems'),
      lowProseSection('Emergency Lighting'),
    ]);

    expect(errors).toEqual([]);
  });

  test('ignores sections that do not produce embeddings', async () => {
    mlService.isModelReady.mockReturnValue(true);
    mlService.getEmbedding
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([1, 0]);

    const errors = await findSimilarSections([
      lowProseSection('Fire Alarm Systems'),
      lowProseSection('Emergency Lighting'),
    ]);

    expect(errors).toEqual([]);
    expect(mlService.calculateSimilarity).not.toHaveBeenCalled();
  });

  test('logs and returns no errors when similarity analysis throws', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mlService.isModelReady.mockReturnValue(true);
    mlService.getEmbedding.mockRejectedValue(new Error('embedding failed'));

    const errors = await findSimilarSections([
      lowProseSection('Fire Alarm Systems'),
      lowProseSection('Emergency Lighting'),
    ]);

    expect(errors).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith('Similarity analysis error:', 'embedding failed');

    errorSpy.mockRestore();
  });
});
