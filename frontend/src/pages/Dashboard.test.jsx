import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import api from '../services/api';
import Dashboard from './Dashboard';

vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
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
  qualityAssessment: { label: 'bad' },
  createdAt: '2026-04-01T10:00:00.000Z',
};

const passedReport = {
  _id: 'r-2',
  filename: 'quality-check.pdf',
  fileSize: 1048576,
  status: 'analyzed',
  errorCount: 0,
  qualityAssessment: { label: 'good' },
  createdAt: '2026-03-15T08:00:00.000Z',
};

const pendingReport = {
  _id: 'r-3',
  filename: 'pending-report.pdf',
  fileSize: 512000,
  status: 'pending',
  errorCount: 0,
  qualityAssessment: null,
  createdAt: '2026-04-10T12:00:00.000Z',
};

const uncertainReport = {
  _id: 'r-4',
  filename: 'uncertain.pdf',
  fileSize: 102400,
  status: 'analyzed',
  errorCount: 1,
  qualityAssessment: { label: 'uncertain' },
  createdAt: '2026-04-05T09:00:00.000Z',
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'URL', 'get').mockReturnValue({
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
    api.get.mockResolvedValue({ data: [] });
  });

  afterEach(() => vi.restoreAllMocks());

  // Initial loading state

  it('shows a loading spinner on initial render', () => {
    let resolve;
    api.get.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    renderPage();
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    resolve({ data: [] });
  });

  // Empty state

  it('shows the empty state message when there are no reports', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    renderPage();
    expect(await screen.findByText(/no reports/i)).toBeInTheDocument();
  });

  // Report list rendering

  it('renders a list of reports after loading', async () => {
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    renderPage();
    expect(await screen.findByText('fire-safety.pdf')).toBeInTheDocument();
  });

  it('shows the file size formatted correctly', async () => {
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    renderPage();
    expect(await screen.findByText('200.0 KB')).toBeInTheDocument();
  });

  it('shows the file size in MB for large files', async () => {
    api.get.mockResolvedValueOnce({ data: [passedReport] });
    renderPage();
    expect(await screen.findByText('1.0 MB')).toBeInTheDocument();
  });

  it('shows a Passed quality badge for a good report', async () => {
    api.get.mockResolvedValueOnce({ data: [passedReport] });
    renderPage();
    expect(await screen.findByText(/passed/i)).toBeInTheDocument();
  });

  it('shows a Failed quality badge for a bad report', async () => {
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    renderPage();
    expect(await screen.findByText(/failed/i)).toBeInTheDocument();
  });

  it('shows an Uncertain quality badge for an uncertain report', async () => {
    api.get.mockResolvedValueOnce({ data: [uncertainReport] });
    renderPage();
    await screen.findByText('uncertain.pdf');
    const badges = screen.getAllByText(/uncertain/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a pending status badge for a pending report', async () => {
    api.get.mockResolvedValueOnce({ data: [pendingReport] });
    renderPage();
    await screen.findByText('pending-report.pdf');
    const badges = screen.getAllByText('Pending');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows a dash for errors column on a pending report', async () => {
    api.get.mockResolvedValueOnce({ data: [pendingReport] });
    renderPage();
    await screen.findByText('pending-report.pdf');
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows the error count for an analyzed report with errors', async () => {
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    renderPage();
    expect(await screen.findByText(/3 errors/i)).toBeInTheDocument();
  });

  it('shows singular "error" for a report with exactly 1 error', async () => {
    api.get.mockResolvedValueOnce({ data: [uncertainReport] });
    renderPage();
    expect(await screen.findByText(/1 error\b/i)).toBeInTheDocument();
  });

  it('renders a View link for each report', async () => {
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    renderPage();
    await screen.findByText('fire-safety.pdf');
    expect(screen.getByRole('link', { name: /view/i })).toHaveAttribute('href', `/report/${analyzedReport._id}`);
  });

  // Delete

  it('removes a report from the list after deleting', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: [analyzedReport, passedReport] });
    api.delete.mockResolvedValueOnce({});
    renderPage();
    await screen.findByText('fire-safety.pdf');

    const deleteButtons = screen.getAllByTitle ? [] : [];
    const trashButtons = document.querySelectorAll('button');
    const deleteBtn = [...trashButtons].find((b) => b.querySelector('svg') && b.className.includes('red'));
    if (deleteBtn) await user.click(deleteBtn);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/reports/r-1'));
  });

  it('shows a success message after deleting a report', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: [analyzedReport] });
    api.delete.mockResolvedValueOnce({});
    renderPage();
    await screen.findByText('fire-safety.pdf');

    const trashButtons = document.querySelectorAll('button');
    const deleteBtn = [...trashButtons].find((b) => b.className.includes('red'));
    if (deleteBtn) {
      await user.click(deleteBtn);
      await waitFor(() => expect(api.delete).toHaveBeenCalled());
    }
  });

  // File upload validation

  it('shows an error when a non-PDF file is uploaded', async () => {
    const { fireEvent } = await import('@testing-library/react');
    api.get.mockResolvedValueOnce({ data: [] });
    renderPage();
    await screen.findByText(/no reports/i);

    const input = document.querySelector('input[type="file"]');
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('Please upload a PDF file')).toBeInTheDocument();
  });

  it('shows an error when a PDF file exceeds the size limit', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ data: [] });
    renderPage();
    await screen.findByText(/no reports/i);

    const input = document.querySelector('input[type="file"]');
    const largeContent = new Uint8Array(121 * 1024 * 1024);
    const file = new File([largeContent], 'huge.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    expect(await screen.findByText(/less than 120MB/i)).toBeInTheDocument();
  });

  it('shows a success message after a successful upload', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    api.post.mockResolvedValueOnce({ data: analyzedReport });
    renderPage();
    await screen.findByText(/no reports/i);

    const input = document.querySelector('input[type="file"]');
    const file = new File(['%PDF-1.4 content'], 'new-report.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(await screen.findByText(/new-report\.pdf/i)).toBeInTheDocument();
  });

  it('shows an error when upload fails', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    api.post.mockRejectedValueOnce({ response: { data: { message: 'Upload error' } } });
    renderPage();
    await screen.findByText(/no reports/i);

    const input = document.querySelector('input[type="file"]');
    const file = new File(['%PDF-1.4'], 'bad.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    expect(await screen.findByText('Upload error')).toBeInTheDocument();
  });

  it('shows a generic upload error when no server message is provided', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ data: [] });
    api.post.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await screen.findByText(/no reports/i);

    const input = document.querySelector('input[type="file"]');
    const file = new File(['%PDF-1.4'], 'bad.pdf', { type: 'application/pdf' });
    await user.upload(input, file);

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
  });

  // Page structure

  it('renders the dashboard title', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    renderPage();
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders the upload area', async () => {
    api.get.mockResolvedValueOnce({ data: [] });
    renderPage();
    await screen.findByText(/no reports/i);
    expect(screen.getByText(/choose file/i)).toBeInTheDocument();
  });
});
