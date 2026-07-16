jest.mock('../../models/TrainingExample', () => {
  const mockModel = jest.fn();
  mockModel.find = jest.fn();
  mockModel.findOne = jest.fn();
  mockModel.findById = jest.fn();
  mockModel.findOneAndUpdate = jest.fn();
  mockModel.countDocuments = jest.fn();
  mockModel.getTrainingStats = jest.fn();
  return mockModel;
});

jest.mock('../../models/Report', () => ({
  find: jest.fn(),
}));

jest.mock('../mlService', () => ({
  getEmbedding: jest.fn().mockResolvedValue(new Array(384).fill(0)),
  calculateSimilarity: jest.fn().mockReturnValue(0.85),
  classifyText: jest.fn().mockResolvedValue({ label: 'complete', score: 0.5 }),
}));

jest.mock('../pdfService', () => ({
  processDocument: jest.fn(),
}));

jest.mock('../templateProcessor', () => ({
  analyseTemplate: jest.fn().mockReturnValue({ sections: [], pageCount: 1 }),
}));

const TrainingExample = require('../../models/TrainingExample');
const Report = require('../../models/Report');
const mlService = require('../mlService');
const {
  predictQualityFromTraining,
  applyContextAwareErrorRescoring,
  buildTrainingExamplesFromLabeledReports,
  processTrainingExample,
  getActiveTemplate,
} = require('../trainingService');
const { processDocument } = require('../pdfService');
const { analyseTemplate } = require('../templateProcessor');

const chainableFind = (resolvedValue) => ({
  select: jest.fn().mockResolvedValue(resolvedValue),
});

describe('trainingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('predictQualityFromTraining', () => {
    test('returns uncertain with no training examples', async () => {
      TrainingExample.find.mockReturnValue(chainableFind([]));

      // Provide enough medium-compliance errors so the rule score falls in
      // the uncertain band (combined probability between 0.45 and 0.7).
      const analysisResults = {
        errors: [
          { type: 'compliance', severity: 'medium' },
          { type: 'compliance', severity: 'medium' },
          { type: 'compliance', severity: 'medium' },
        ],
        errorSummary: {},
      };

      const result = await predictQualityFromTraining('A'.repeat(250), analysisResults);

      expect(result.label).toBe('uncertain');
      expect(typeof result.confidence).toBe('number');
      expect(result.matchedExamples).toBe(0);
    });

    test('returns a label and confidence between 0 and 1 with training data', async () => {
      const goodExamples = Array.from({ length: 3 }, () => ({
        type: 'good',
        embedding: new Array(384).fill(0.5),
        manualOverride: true,
        detectedErrorCount: 0,
      }));
      const badExamples = [
        {
          type: 'bad',
          embedding: new Array(384).fill(-0.5),
          manualOverride: false,
          detectedErrorCount: 20,
        },
      ];

      TrainingExample.find.mockReturnValue(
        chainableFind([...goodExamples, ...badExamples])
      );

      const result = await predictQualityFromTraining('A'.repeat(250), {
        errors: [],
        errorSummary: {},
      });

      expect(['good', 'bad', 'uncertain']).toContain(result.label);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result).toHaveProperty('goodScore');
      expect(result).toHaveProperty('badScore');
      expect(result).toHaveProperty('method');
    });

    test('returns bad when high-severity compliance errors exist', async () => {
      const result = await predictQualityFromTraining('A'.repeat(250), {
        errors: [{ type: 'compliance', severity: 'high' }],
        errorSummary: {},
      });

      expect(result.label).toBe('bad');
      expect(result.confidence).toBe(0.9);
    });
  });

  describe('applyContextAwareErrorRescoring', () => {
    test('returns original errors unchanged when no training examples exist', async () => {
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      TrainingExample.find.mockReturnValue(chainableFind([]));

      const errors = [
        { type: 'formatting', severity: 'medium', message: 'Bad spacing' },
        { type: 'compliance', severity: 'high', message: 'Missing section' },
      ];

      const result = await applyContextAwareErrorRescoring(errors);

      expect(result.errors).toEqual(errors);
      expect(result.adjustments.suppressed).toBe(0);
      expect(result.adjustments.downgraded).toBe(0);
    });

    test('returns object with errors array and adjustments object', async () => {
      const trainingExamples = [
        { type: 'good', sourceReport: { toString: () => 'r1' } },
        { type: 'good', sourceReport: { toString: () => 'r2' } },
        { type: 'bad', sourceReport: { toString: () => 'r3' } },
      ];

      TrainingExample.find.mockReturnValue(chainableFind(trainingExamples));

      Report.find.mockReturnValue(
        chainableFind([
          {
            _id: { toString: () => 'r1' },
            errors: [{ type: 'formatting', message: 'Bad spacing' }],
          },
          {
            _id: { toString: () => 'r2' },
            errors: [{ type: 'formatting', message: 'Bad spacing' }],
          },
          {
            _id: { toString: () => 'r3' },
            errors: [{ type: 'compliance', message: 'Missing section' }],
          },
        ])
      );

      const errors = [
        { type: 'formatting', severity: 'medium', message: 'Bad spacing' },
        { type: 'compliance', severity: 'high', message: 'Missing section' },
      ];

      const result = await applyContextAwareErrorRescoring(errors);

      expect(Array.isArray(result.errors)).toBe(true);
      expect(result).toHaveProperty('adjustments');
      expect(result.adjustments).toHaveProperty('suppressed');
      expect(result.adjustments).toHaveProperty('downgraded');
      expect(typeof result.adjustments.suppressed).toBe('number');
      expect(typeof result.adjustments.downgraded).toBe('number');
    });

    test('suppresses errors accepted in good reports and downgrades milder accepted patterns', async () => {
      const trainingExamples = [
        { type: 'good', sourceReport: { toString: () => 'g1' } },
        { type: 'good', sourceReport: { toString: () => 'g2' } },
        { type: 'good', sourceReport: { toString: () => 'g3' } },
        { type: 'bad', sourceReport: { toString: () => 'b1' } },
      ];

      TrainingExample.find.mockReturnValue(chainableFind(trainingExamples));
      Report.find.mockReturnValue(
        chainableFind([
          {
            _id: { toString: () => 'g1' },
            errors: [
              { type: 'formatting', message: 'Accepted spacing' },
              { type: 'missing_data', message: 'Mostly accepted field' },
            ],
          },
          {
            _id: { toString: () => 'g2' },
            errors: [
              { type: 'formatting', message: 'Accepted spacing' },
              { type: 'missing_data', message: 'Mostly accepted field' },
            ],
          },
          {
            _id: { toString: () => 'g3' },
            errors: [
              { type: 'missing_data', message: 'Mostly accepted field' },
            ],
          },
          {
            _id: { toString: () => 'b1' },
            errors: [
              { type: 'missing_data', message: 'Mostly accepted field' },
            ],
          },
        ])
      );

      const result = await applyContextAwareErrorRescoring([
        { type: 'formatting', severity: 'medium', message: 'Accepted spacing' },
        { type: 'missing_data', severity: 'high', message: 'Mostly accepted field' },
        { type: 'compliance', severity: 'high', message: 'Always kept' },
      ]);

      expect(result.adjustments).toEqual({ suppressed: 1, downgraded: 1, skipped: false });
      expect(result.errors).toEqual([
        expect.objectContaining({
          type: 'missing_data',
          severity: 'low',
          message: 'Mostly accepted field (accepted in similar good reports)',
        }),
        { type: 'compliance', severity: 'high', message: 'Always kept' },
      ]);
    });

    test('returns skipped adjustments when context profile lookup fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      TrainingExample.find.mockImplementation(() => {
        throw new Error('profile failed');
      });
      const errors = [{ type: 'formatting', severity: 'medium', message: 'Spacing' }];

      const result = await applyContextAwareErrorRescoring(errors);

      expect(result).toEqual({
        errors,
        adjustments: { suppressed: 0, downgraded: 0, skipped: true },
      });
      expect(warnSpy).toHaveBeenCalledWith(
        'Context-aware error rescoring skipped:',
        'profile failed'
      );
      warnSpy.mockRestore();
    });

    test('returns empty adjustments when given empty errors array', async () => {
      const result = await applyContextAwareErrorRescoring([]);

      expect(result.errors).toEqual([]);
      expect(result.adjustments).toEqual({ suppressed: 0, downgraded: 0 });
    });
  });

  describe('buildTrainingExamplesFromLabeledReports', () => {
    test('creates TrainingExample documents from labeled reports', async () => {
      const mockReports = [
        {
          _id: 'report1',
          filename: 'test.pdf',
          filePath: '/uploads/test.pdf',
          fileSize: 1024,
          trainingLabel: 'good',
          extractedText: 'A'.repeat(300),
          analyzedBy: 'user1',
          metadata: { pageCount: 5, sections: ['Intro'] },
          errorCount: 2,
        },
        {
          _id: 'report2',
          filename: 'bad.pdf',
          filePath: '/uploads/bad.pdf',
          fileSize: 2048,
          trainingLabel: 'bad',
          extractedText: 'B'.repeat(300),
          analyzedBy: 'user2',
          metadata: { pageCount: 3 },
          errorCount: 10,
        },
      ];

      Report.find.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockReports),
      });

      TrainingExample.findOneAndUpdate.mockResolvedValue({});
      mlService.getEmbedding.mockResolvedValue(new Array(384).fill(0.1));

      const result = await buildTrainingExamplesFromLabeledReports();

      expect(result).toHaveProperty('labeledReports', 2);
      expect(result).toHaveProperty('createdOrUpdated', 2);
      expect(result).toHaveProperty('skipped', 0);
      expect(TrainingExample.findOneAndUpdate).toHaveBeenCalledTimes(2);

      const firstCall = TrainingExample.findOneAndUpdate.mock.calls[0];
      expect(firstCall[0]).toEqual({ sourceReport: 'report1' });
      expect(firstCall[1]).toMatchObject({
        filename: 'test.pdf',
        type: 'good',
        status: 'trained',
      });
      expect(firstCall[2]).toMatchObject({ upsert: true, new: true });
    });

    test('skips reports with text shorter than MIN_TEXT_LENGTH', async () => {
      Report.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: 'short',
            filename: 'short.pdf',
            trainingLabel: 'good',
            extractedText: 'too short',
            analyzedBy: 'user1',
            metadata: {},
          },
        ]),
      });

      const result = await buildTrainingExamplesFromLabeledReports();

      expect(result.createdOrUpdated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(TrainingExample.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test('skips reports when embedding generation fails', async () => {
      Report.find.mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: 'noEmbed',
            filename: 'noEmbed.pdf',
            trainingLabel: 'good',
            extractedText: 'A'.repeat(300),
            analyzedBy: 'user1',
            metadata: {},
          },
        ]),
      });

      mlService.getEmbedding.mockResolvedValue(null);

      const result = await buildTrainingExamplesFromLabeledReports();

      expect(result.createdOrUpdated).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });

  describe('getActiveTemplate', () => {
    test('returns null when no active template exists', async () => {
      TrainingExample.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      const result = await getActiveTemplate();

      expect(result).toBeNull();
      expect(TrainingExample.findOne).toHaveBeenCalledWith({
        type: 'template',
        isActive: true,
        status: 'trained',
      });
    });

    test('returns template data when an active template exists', async () => {
      const templateData = {
        filename: 'template.pdf',
        metadata: { sections: ['Header', 'Body'] },
        embedding: new Array(384).fill(0),
        extractedText: 'Template content...',
        trainedAt: new Date(),
      };

      TrainingExample.findOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(templateData),
        }),
      });

      const result = await getActiveTemplate();

      expect(result).toEqual(templateData);
      expect(result.filename).toBe('template.pdf');
    });
  });

  describe('processTrainingExample', () => {
    test('trains a standard example with metadata and embedding', async () => {
      const example = {
        _id: 'example-1',
        type: 'good',
        filePath: '/uploads/good.pdf',
        save: jest.fn().mockResolvedValue(),
      };
      TrainingExample.findById.mockResolvedValue(example);
      processDocument.mockResolvedValue({
        text: 'A'.repeat(300),
        numPages: 2,
        sections: [{ title: 'Summary' }, { title: 'Action Plan' }],
      });
      mlService.getEmbedding.mockResolvedValue([0.1, 0.2]);

      const result = await processTrainingExample('example-1');

      expect(result).toBe(example);
      expect(example.status).toBe('trained');
      expect(example.extractedText).toBe('A'.repeat(300));
      expect(example.metadata).toEqual({
        pageCount: 2,
        sections: ['Summary', 'Action Plan'],
        documentType: 'training-upload',
      });
      expect(example.embedding).toEqual([0.1, 0.2]);
      expect(example.trainedAt).toBeInstanceOf(Date);
      expect(example.save).toHaveBeenCalledTimes(2);
    });

    test('trains template examples with analysed template metadata', async () => {
      const example = {
        _id: 'template-1',
        type: 'template',
        filePath: '/uploads/template.pdf',
        save: jest.fn().mockResolvedValue(),
      };
      TrainingExample.findById.mockResolvedValue(example);
      const templateText = 'Template '.repeat(80).trim();
      processDocument.mockResolvedValue({
        text: templateText,
        pageCount: 4,
        sections: [{ title: 'Required Section' }],
        headerFields: { referenceNumber: 'REF-1' },
      });
      analyseTemplate.mockReturnValue({ sections: ['Required Section'], pageCount: 4 });
      mlService.getEmbedding.mockResolvedValue([0.3, 0.4]);

      await processTrainingExample('template-1');

      expect(analyseTemplate).toHaveBeenCalledWith(
        templateText,
        {
          pageCount: 4,
          sections: [{ title: 'Required Section' }],
          headerFields: { referenceNumber: 'REF-1' },
        }
      );
      expect(example.metadata).toEqual({ sections: ['Required Section'], pageCount: 4 });
      expect(example.embedding).toEqual([0.3, 0.4]);
      expect(example.status).toBe('trained');
    });

    test('fails missing and too-short training examples', async () => {
      TrainingExample.findById.mockResolvedValueOnce(null);

      await expect(processTrainingExample('missing')).rejects.toThrow(
        'Training example not found'
      );

      const example = {
        _id: 'short',
        type: 'bad',
        filePath: '/uploads/short.pdf',
        save: jest.fn().mockResolvedValue(),
      };
      TrainingExample.findById.mockResolvedValueOnce(example);
      processDocument.mockResolvedValue({ text: 'too short' });

      await expect(processTrainingExample('short')).rejects.toThrow(
        'Extracted text too short for training'
      );
      expect(example.status).toBe('failed');
      expect(example.extractedText).toBe('too short');
      expect(example.save).toHaveBeenCalledTimes(3);
    });
  });
});
