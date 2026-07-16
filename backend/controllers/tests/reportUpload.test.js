const fs = require('fs');

jest.mock('../../models/Report', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  aggregate: jest.fn(),
}));

jest.mock('fs', () => ({
  unlink: jest.fn(),
  existsSync: jest.fn(),
}));

jest.mock('../../services/pdfService', () => ({
  processDocument: jest.fn(),
}));

jest.mock('../../services/errorDetection', () => ({
  analyzeDocument: jest.fn(),
}));

jest.mock('../../services/trainingService', () => ({
  predictQualityFromTraining: jest.fn(),
}));

jest.mock('../../services/reportPdfService', () => ({
  generateReportPdf: jest.fn(),
}));

jest.mock('../../services/annotatedPdfService', () => ({
  generateAnnotatedPdf: jest.fn(),
}));

jest.mock('../../services/timeEstimationService', () => ({
  getReportTimeMetrics: jest.fn(() => ({
    savedMinutes: 0,
    manualMinutes: 0,
    aiMinutes: 0,
  })),
}));

jest.mock('../../services/auditService', () => ({
  log: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
}));
jest.mock('../../models/Team', () => ({
  findOne: jest.fn(),
}));

const Report = require('../../models/Report');
const { processDocument } = require('../../services/pdfService');
const { analyzeDocument } = require('../../services/errorDetection');
const { predictQualityFromTraining } = require('../../services/trainingService');
const { generateReportPdf } = require('../../services/reportPdfService');
const { generateAnnotatedPdf } = require('../../services/annotatedPdfService');
const audit = require('../../services/auditService');
const Team = require('../../models/Team');
const {
  uploadReport,
  analyzeReport,
  getReports,
  getReportById,
  deleteReport,
  getReportStats,
  getReportText,
  downloadReport,
  downloadAnnotatedPdf,
} = require('../reportController');

const mockReport = {
  _id: 'report-123',
  filename: 'test.pdf',
  filePath: '/uploads/test.pdf',
  fileSize: 1024,
  status: 'processing',
};

const createRes = () => {
  const res = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
    setHeader: jest.fn(() => res),
    send: jest.fn(() => res),
  };
  return res;
};

const createReportStream = () => ({
  pipe: jest.fn(),
  end: jest.fn(),
});

const createReportFindChain = (reports) => {
  const sort = jest.fn().mockResolvedValue(reports);
  const populate = jest.fn(() => ({ sort }));
  const select = jest.fn(() => ({ populate }));

  Report.find.mockReturnValue({ select });

  return { select, populate, sort };
};

const createReportByIdPopulateChain = (report) => {
  const populate = jest.fn().mockResolvedValue(report);

  Report.findById.mockReturnValue({ populate });

  return { populate };
};

const createReportByIdSelectChain = (report) => {
  const select = jest.fn().mockResolvedValue(report);

  Report.findById.mockReturnValue({ select });

  return { select };
};

describe('uploadReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Report.findByIdAndUpdate.mockResolvedValue({});
    processDocument.mockResolvedValue({
      text: 'Sample extracted text',
      sections: [],
      headerFields: {},
      numPages: 1,
      wordCount: 3,
    });
    analyzeDocument.mockResolvedValue({
      errors: [],
      errorCount: 0,
      errorSummary: {
        placeholder: 0,
        consistency: 0,
        compliance: 0,
        formatting: 0,
        missing_data: 0,
      },
      estimatedManualReviewMinutes: 0,
      estimatedAiReviewMinutes: 0,
      estimatedTimeSavedMinutes: 0,
      timeSavedPercent: 0,
    });
    predictQualityFromTraining.mockResolvedValue({
      label: 'good',
      confidence: 1,
      goodScore: 1,
      badScore: 0,
      matchedExamples: [],
      method: 'test',
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
  });

  test('returns 400 when no file is attached', async () => {
    const req = { user: { _id: 'user-1' } };
    const res = createRes();

    await uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Please upload a PDF file' });
    expect(Report.create).not.toHaveBeenCalled();
  });

  test('creates a report with status "processing" when file is provided', async () => {
    Report.create.mockResolvedValue(mockReport);

    const req = {
      user: { _id: 'user-1' },
      file: { originalname: 'test.pdf', path: '/uploads/test.pdf', size: 1024 },
    };
    const res = createRes();

    await uploadReport(req, res);

    expect(Report.create).toHaveBeenCalledWith({
      filename: 'test.pdf',
      filePath: '/uploads/test.pdf',
      fileSize: 1024,
      analyzedBy: 'user-1',
      status: 'processing',
    });
  });

  test('returns 201 with report data on success', async () => {
    Report.create.mockResolvedValue(mockReport);

    const req = {
      user: { _id: 'user-1' },
      file: { originalname: 'test.pdf', path: '/uploads/test.pdf', size: 1024 },
    };
    const res = createRes();

    await uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      _id: 'report-123',
      filename: 'test.pdf',
      fileSize: 1024,
      status: 'processing',
      message: 'File uploaded successfully. Processing started.',
    });
  });

  test('cleans up uploaded file when a database error occurs', async () => {
    Report.create.mockRejectedValue(new Error('DB write failed'));

    const req = {
      user: { _id: 'user-1' },
      file: { originalname: 'test.pdf', path: '/uploads/test.pdf', size: 1024 },
    };
    const res = createRes();

    await uploadReport(req, res);

    expect(fs.unlink).toHaveBeenCalledWith('/uploads/test.pdf', expect.any(Function));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'DB write failed' });
  });

  test('response includes _id, filename, fileSize, status, and message', async () => {
    Report.create.mockResolvedValue(mockReport);

    const req = {
      user: { _id: 'user-1' },
      file: { originalname: 'test.pdf', path: '/uploads/test.pdf', size: 1024 },
    };
    const res = createRes();

    await uploadReport(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('_id');
    expect(body).toHaveProperty('filename');
    expect(body).toHaveProperty('fileSize');
    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('message');
  });
});

describe('reportController read/delete/stat handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
  });

  test('getReports returns admin report list without extracted text', async () => {
    const reports = [
      { _id: 'report-1', filename: 'a.pdf' },
      { _id: 'report-2', filename: 'b.pdf' },
    ];
    const { select, populate, sort } = createReportFindChain(reports);
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createRes();

    await getReports(req, res);

    expect(Report.find).toHaveBeenCalledWith({});
    expect(select).toHaveBeenCalledWith('-extractedText');
    expect(populate).toHaveBeenCalledWith('analyzedBy', 'name email');
    expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.json).toHaveBeenCalledWith(reports);
  });

  test('getReports scopes regular users to their own reports', async () => {
    const reports = [{ _id: 'report-1', filename: 'mine.pdf' }];
    createReportFindChain(reports);
    const req = { user: { _id: 'user-1', role: 'user' } };
    const res = createRes();

    await getReports(req, res);

    expect(Report.find).toHaveBeenCalledWith({ analyzedBy: 'user-1' });
    expect(res.json).toHaveBeenCalledWith(reports);
  });

  test('getReports returns 500 when the report query fails', async () => {
    Report.find.mockImplementation(() => {
      throw new Error('find failed');
    });
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createRes();

    await getReports(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'find failed' });
  });

  test('getReportById returns a populated report when authorized', async () => {
    const report = {
      _id: 'report-1',
      analyzedBy: { _id: { toString: () => 'user-1' } },
    };
    const { populate } = createReportByIdPopulateChain(report);
    const req = { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } };
    const res = createRes();

    await getReportById(req, res);

    expect(Report.findById).toHaveBeenCalledWith('report-1');
    expect(populate).toHaveBeenCalledWith('analyzedBy', 'name email');
    expect(res.json).toHaveBeenCalledWith(report);
  });

  test('getReportById handles missing and unauthorized reports', async () => {
    createReportByIdPopulateChain(null);
    const missingRes = createRes();

    await getReportById(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    createReportByIdPopulateChain({
      _id: 'report-1',
      analyzedBy: { _id: { toString: () => 'other-user' } },
    });
    const unauthorizedRes = createRes();

    await getReportById(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(403);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({
      message: 'Not authorized to view this report',
    });
  });

  test('deleteReport removes an authorized report and audits the deletion', async () => {
    const report = {
      _id: 'report-1',
      filename: 'test.pdf',
      filePath: '/uploads/test.pdf',
      analyzedBy: { toString: () => 'user-1' },
    };
    Report.findById.mockResolvedValue(report);
    Report.findByIdAndDelete.mockResolvedValue(report);
    audit.log.mockResolvedValue();
    const req = {
      params: { id: 'report-1' },
      user: { _id: 'user-1', email: 'user@example.com', role: 'user' },
    };
    const res = createRes();

    await deleteReport(req, res);

    expect(fs.existsSync).toHaveBeenCalledWith('/uploads/test.pdf');
    expect(fs.unlink).toHaveBeenCalledWith('/uploads/test.pdf', expect.any(Function));
    expect(Report.findByIdAndDelete).toHaveBeenCalledWith('report-1');
    expect(audit.log).toHaveBeenCalledWith(
      'report_deleted',
      expect.objectContaining({
        req,
        userId: 'user-1',
        email: 'user@example.com',
      })
    );
    expect(res.json).toHaveBeenCalledWith({ message: 'Report deleted successfully' });
  });

  test('deleteReport handles missing and unauthorized reports', async () => {
    Report.findById.mockResolvedValueOnce(null);
    const missingRes = createRes();

    await deleteReport(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    Report.findById.mockResolvedValueOnce({
      _id: 'report-1',
      analyzedBy: { toString: () => 'other-user' },
    });
    const unauthorizedRes = createRes();

    await deleteReport(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(403);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({
      message: 'Not authorized to delete this report',
    });
  });

  test('getReportStats returns aggregate totals and percentage', async () => {
    Report.aggregate.mockResolvedValue([
      {
        totalReports: 2,
        totalErrors: 5,
        totalTimeSaved: 3,
        totalManualReviewMinutes: 10,
        totalAiReviewMinutes: 4,
        totalTimeSavedMinutes: 6,
        placeholderErrors: 1,
        consistencyErrors: 1,
        complianceErrors: 1,
        formattingErrors: 1,
        missingDataErrors: 1,
      },
    ]);
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createRes();

    await getReportStats(req, res);

    expect(Report.aggregate).toHaveBeenCalledWith(expect.any(Array));
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalReports: 2,
        totalErrors: 5,
        totalTimeSaved: 6,
        totalManualReviewMinutes: 10,
        totalAiReviewMinutes: 4,
        totalTimeSavedMinutes: 6,
        timeSavedPercent: 60,
      })
    );
  });

  test('getReportStats returns zero defaults when there are no reports', async () => {
    Report.aggregate.mockResolvedValue([]);
    const req = { user: { _id: 'admin-1', role: 'admin' } };
    const res = createRes();

    await getReportStats(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalReports: 0,
        totalErrors: 0,
        totalTimeSaved: 0,
        timeSavedPercent: 0,
      })
    );
  });

  test('getReportText returns extracted text for an authorized report', async () => {
    const report = {
      filename: 'test.pdf',
      extractedText: 'Extracted text',
      analyzedBy: { toString: () => 'user-1' },
    };
    const { select } = createReportByIdSelectChain(report);
    const req = { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } };
    const res = createRes();

    await getReportText(req, res);

    expect(select).toHaveBeenCalledWith('extractedText filename analyzedBy');
    expect(res.json).toHaveBeenCalledWith({
      filename: 'test.pdf',
      text: 'Extracted text',
    });
  });

  test('getReportText handles missing and unauthorized reports', async () => {
    createReportByIdSelectChain(null);
    const missingRes = createRes();

    await getReportText(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    createReportByIdSelectChain({
      filename: 'test.pdf',
      extractedText: 'Secret',
      analyzedBy: { toString: () => 'other-user' },
    });
    const unauthorizedRes = createRes();

    await getReportText(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(403);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({ message: 'Not authorized' });
  });

  test('analyzeReport marks an authorized report processing and starts background analysis', async () => {
    const report = {
      _id: 'report-1',
      analyzedBy: { toString: () => 'user-1' },
      filePath: '/uploads/report.pdf',
      status: 'analyzed',
      save: jest.fn().mockResolvedValue(),
    };
    Report.findById.mockResolvedValue(report);
    const req = {
      params: { id: 'report-1' },
      user: { _id: 'user-1', role: 'user' },
    };
    const res = createRes();

    await analyzeReport(req, res);

    expect(report.status).toBe('processing');
    expect(report.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      message: 'Analysis started',
      reportId: 'report-1',
    });
    expect(processDocument).toHaveBeenCalledWith('/uploads/report.pdf');
  });

  test('analyzeReport handles missing, unauthorized, and missing-file reports', async () => {
    Report.findById.mockResolvedValueOnce(null);
    const missingRes = createRes();

    await analyzeReport(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    Report.findById.mockResolvedValueOnce({
      _id: 'report-1',
      analyzedBy: { toString: () => 'other-user' },
      filePath: '/uploads/report.pdf',
    });
    const unauthorizedRes = createRes();

    await analyzeReport(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(403);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({ message: 'Not authorized' });

    Report.findById.mockResolvedValueOnce({
      _id: 'report-1',
      analyzedBy: { toString: () => 'user-1' },
      filePath: '/uploads/missing.pdf',
    });
    fs.existsSync.mockReturnValueOnce(false);
    const missingFileRes = createRes();

    await analyzeReport(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      missingFileRes
    );

    expect(missingFileRes.status).toHaveBeenCalledWith(400);
    expect(missingFileRes.json).toHaveBeenCalledWith({ message: 'PDF file not found' });
  });

  test('downloadReport streams generated report PDF with team context', async () => {
    const report = {
      _id: 'report-1',
      filename: 'source.pdf',
      analyzedBy: {
        _id: { toString: () => 'user-1' },
        name: 'Ada',
        email: 'ada@example.com',
      },
    };
    const { populate } = createReportByIdPopulateChain(report);
    const team = { _id: 'team-1', name: 'QA Team' };
    Team.findOne.mockReturnValue({
      populate: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(team) })),
    });
    const doc = createReportStream();
    generateReportPdf.mockReturnValue(doc);
    const req = {
      params: { id: 'report-1' },
      user: { _id: 'user-1', role: 'user' },
    };
    const res = createRes();

    await downloadReport(req, res);

    expect(populate).toHaveBeenCalledWith('analyzedBy', 'name email');
    expect(Team.findOne).toHaveBeenCalledWith({ members: 'user-1' });
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="QC_Report_source.pdf"'
    );
    expect(generateReportPdf).toHaveBeenCalledWith(report, report.analyzedBy, team);
    expect(doc.pipe).toHaveBeenCalledWith(res);
    expect(doc.end).toHaveBeenCalled();
  });

  test('downloadReport handles missing and unauthorized reports', async () => {
    createReportByIdPopulateChain(null);
    const missingRes = createRes();

    await downloadReport(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    createReportByIdPopulateChain({
      _id: 'report-1',
      filename: 'source.pdf',
      analyzedBy: { _id: { toString: () => 'other-user' } },
    });
    const unauthorizedRes = createRes();

    await downloadReport(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      unauthorizedRes
    );

    expect(unauthorizedRes.status).toHaveBeenCalledWith(403);
    expect(unauthorizedRes.json).toHaveBeenCalledWith({ message: 'Not authorized' });
  });

  test('downloadAnnotatedPdf sends generated annotated PDF', async () => {
    const report = {
      _id: 'report-1',
      filename: 'source report.pdf',
      status: 'analyzed',
      filePath: '/uploads/source.pdf',
      analyzedBy: { toString: () => 'user-1' },
      errors: [{ message: 'Issue', originalText: 'XXX' }],
    };
    Report.findById.mockResolvedValue(report);
    generateAnnotatedPdf.mockResolvedValue(Buffer.from('annotated'));
    const req = {
      params: { id: 'report-1' },
      user: { _id: 'user-1', role: 'user' },
    };
    const res = createRes();

    await downloadAnnotatedPdf(req, res);

    expect(generateAnnotatedPdf).toHaveBeenCalledWith(report);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="source_report_ANNOTATED.pdf"'
    );
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', Buffer.from('annotated').length);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('annotated'));
  });

  test('downloadAnnotatedPdf validates report state and source file', async () => {
    Report.findById.mockResolvedValueOnce(null);
    const missingRes = createRes();

    await downloadAnnotatedPdf(
      { params: { id: 'missing-report' }, user: { _id: 'user-1', role: 'user' } },
      missingRes
    );

    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(missingRes.json).toHaveBeenCalledWith({ message: 'Report not found' });

    Report.findById.mockResolvedValueOnce({
      _id: 'report-1',
      analyzedBy: { toString: () => 'user-1' },
      status: 'processing',
    });
    const notAnalyzedRes = createRes();

    await downloadAnnotatedPdf(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      notAnalyzedRes
    );

    expect(notAnalyzedRes.status).toHaveBeenCalledWith(400);
    expect(notAnalyzedRes.json).toHaveBeenCalledWith({
      message: 'Report has not been analyzed yet',
    });

    Report.findById.mockResolvedValueOnce({
      _id: 'report-1',
      analyzedBy: { toString: () => 'user-1' },
      status: 'analyzed',
      filePath: '/uploads/source.pdf',
      errors: [],
    });
    const noErrorsRes = createRes();

    await downloadAnnotatedPdf(
      { params: { id: 'report-1' }, user: { _id: 'user-1', role: 'user' } },
      noErrorsRes
    );

    expect(noErrorsRes.status).toHaveBeenCalledWith(400);
    expect(noErrorsRes.json).toHaveBeenCalledWith({ message: 'No errors to annotate' });
  });
});
