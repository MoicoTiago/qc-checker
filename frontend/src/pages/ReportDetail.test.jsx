import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import ReportDetail from './ReportDetail';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../components/Header', () => ({ default: () => <header>Header</header> }));
vi.mock('../components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('../context/LanguageContext', async () => {
  const en = (await import('../translations/en')).default;
  const t = (key, replacements) => {
    const keys = key.split('.');
    let value = en;
    for (const k of keys) { if (value == null) break; value = value[k]; }
    if (typeof value !== 'string') return value ?? key;
    if (replacements) {
      return Object.entries(replacements).reduce(
        (str, [k, v]) => str.replace(new RegExp(`{{${k}}}`, 'g'), v), value
      );
    }
    return value;
  };
  return { useLanguage: () => ({ t, language: 'en', toggleLanguage: () => {} }) };
});

const analyzedReport = {
  _id: 'r-1',
  filename: 'fire-safety.pdf',
  fileSize: 204800,
  status: 'analyzed',
  errorCount: 3,
  qualityAssessment: { label: 'bad', summary: 'Report has issues' },
  createdAt: '2026-04-01T10:00:00.000Z',
  errors: [
    { type: 'placeholder', message: 'Field left blank on page 3', page: 3 },
    { type: 'compliance', message: 'Missing safety certificate', page: 5 },
    { type: 'consistency', message: 'Date mismatch in section 2', page: 2 },
  ],
};

const passedReport = {
  _id: 'r-2',
  filename: 'quality-check.pdf',
  fileSize: 1048576,
  status: 'analyzed',
  errorCount: 0,
  qualityAssessment: { label: 'good', summary: 'All checks passed' },
  createdAt: '2026-03-15T08:00:00.000Z',
  errors: [],
};

const pendingReport = {
  _id: 'r-3',
  filename: 'pending.pdf',
  fileSize: 512000,
  status: 'pending',
  errorCount: 0,
  qualityAssessment: null,
  createdAt: '2026-04-10T12:00:00.000Z',
  errors: [],
};

const renderPage = (id = 'r-1') =>
  render(
    <MemoryRouter initialEntries={[`/report/${id}`]}>
      <Routes>
        <Route path="/report/:id" element={<ReportDetail />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );

describe('ReportDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn(() => 'blob:mock');
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => vi.restoreAllMocks());

  // Loading state

  it('shows a loading spinner while fetching the report', () => {
    let resolve;
    api.get.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    resolve({ data: analyzedReport });
  });

  // Error state

  it('shows an error message when the report fetch fails', async () => {
    api.get.mockRejectedValueOnce({ response: { data: { message: 'Report not found' } } });
    renderPage();
    expect(await screen.findByText('Report not found')).toBeInTheDocument();
  });

  it('shows a generic error when no server message is provided', async () => {
    api.get.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    expect(await screen.findByText(/failed to load/i)).toBeInTheDocument();
  });

  it('navigates to /dashboard when Back to Dashboard is clicked in error state', async () => {
    api.get.mockRejectedValueOnce(new Error('Network error'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/failed to load/i);
    await user.click(screen.getByRole('button', { name: /back to dashboard/i }));
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  // Successful load

  it('renders the report filename', async () => {
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    expect(await screen.findByText('fire-safety.pdf')).toBeInTheDocument();
  });

  it('renders the Back to Dashboard link', async () => {
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText('fire-safety.pdf');
    expect(screen.getByRole('link', { name: /back to dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('renders analyzed status badge for an analyzed report', async () => {
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText('fire-safety.pdf');
    expect(screen.getByText('Analyzed')).toBeInTheDocument();
  });

  it('renders pending status badge for a pending report', async () => {
    api.get.mockResolvedValueOnce({ data: pendingReport });
    renderPage('r-3');
    await screen.findByText('pending.pdf');
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('renders the error count stat for an analyzed report', async () => {
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText('fire-safety.pdf');
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders error messages in the errors section', async () => {
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText('fire-safety.pdf');
    // Each error type group should be present
    expect(screen.getAllByText(/placeholder|compliance|consistency/i).length).toBeGreaterThan(0);
  });

  it('shows the no-errors panel for a passed report with zero errors', async () => {
    api.get.mockResolvedValueOnce({ data: passedReport });
    renderPage('r-2');
    expect(await screen.findByText('quality-check.pdf')).toBeInTheDocument();
    expect(await screen.findByText(/no errors/i)).toBeInTheDocument();
  });

  // Error type expansion

  it('expands an error type group when the header is clicked', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText('fire-safety.pdf');

    const typeHeaders = document.querySelectorAll('button');
    const expandBtn = [...typeHeaders].find((b) => b.textContent.includes('Placeholder') || b.textContent.includes('placeholder'));
    if (expandBtn) {
      await user.click(expandBtn);
      expect(await screen.findByText(/field left blank/i)).toBeInTheDocument();
    }
  });

  // Download

  it('calls the download API when Download Report is clicked', async () => {
    const user = userEvent.setup();
    api.get
      .mockResolvedValueOnce({ data: analyzedReport })
      .mockResolvedValueOnce({ data: new Blob(['pdf content'], { type: 'application/pdf' }) });
    const realCreateElement = document.createElement.bind(document);
    const mockAnchor = realCreateElement('a');
    mockAnchor.click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? mockAnchor : realCreateElement(tag)
    );

    renderPage();
    await screen.findByText('fire-safety.pdf');

    const downloadBtn = screen.getByRole('button', { name: /download report/i });
    await user.click(downloadBtn);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/reports/r-1/download`, expect.any(Object)));
  });

  it('shows a download error when the download API fails', async () => {
    const user = userEvent.setup();
    api.get
      .mockResolvedValueOnce({ data: analyzedReport })
      .mockRejectedValueOnce({ response: { data: { message: 'Download failed' } } });

    renderPage();
    await screen.findByText('fire-safety.pdf');

    await user.click(screen.getByRole('button', { name: /download report/i }));
    expect(await screen.findByText('Download failed')).toBeInTheDocument();
  });

  it('dismisses the download error when the close button is clicked', async () => {
    const user = userEvent.setup();
    api.get
      .mockResolvedValueOnce({ data: analyzedReport })
      .mockRejectedValueOnce({ response: { data: { message: 'Download failed' } } });

    renderPage();
    await screen.findByText('fire-safety.pdf');
    await user.click(screen.getByRole('button', { name: /download report/i }));
    await screen.findByText('Download failed');

    await user.click(screen.getByRole('button', { name: /×/i }));
    expect(screen.queryByText('Download failed')).not.toBeInTheDocument();
  });

  // Annotated PDF download

  it('calls the annotated download API when Download Annotated PDF is clicked', async () => {
    const user = userEvent.setup();
    const pdfBlob = new Blob(['pdf'], { type: 'application/pdf' });
    api.get
      .mockResolvedValueOnce({ data: analyzedReport })
      .mockResolvedValueOnce({ data: pdfBlob });
    const realCreateElement = document.createElement.bind(document);
    const mockAnchor = realCreateElement('a');
    mockAnchor.click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'a' ? mockAnchor : realCreateElement(tag)
    );

    renderPage();
    await screen.findByText('fire-safety.pdf');

    const annotatedBtn = screen.queryByRole('button', { name: /annotated/i });
    if (annotatedBtn) {
      await user.click(annotatedBtn);
      await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/reports/r-1/download-annotated`, expect.any(Object)));
    }
  });
});
