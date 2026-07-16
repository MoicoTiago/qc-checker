import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './LanguageContext';
import Header from '../components/Header';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    user: null,
    logout: vi.fn(),
  }),
}));

const TestConsumer = () => {
  const { language, t, toggleLanguage } = useLanguage();
  return (
    <div>
      <span data-testid="language">{language}</span>
      <span data-testid="brand">{t('header.brand')}</span>
      <button data-testid="toggle" onClick={toggleLanguage}>Toggle</button>
    </div>
  );
};

const renderWithProvider = (ui) =>
  render(<LanguageProvider>{ui}</LanguageProvider>);

describe('LanguageContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to English', () => {
    renderWithProvider(<TestConsumer />);
    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });

  it('t() returns English strings', () => {
    renderWithProvider(<TestConsumer />);
    expect(screen.getByTestId('brand')).toHaveTextContent('QC Checker');
  });

  it('t() returns Welsh strings after toggle', async () => {
    const user = userEvent.setup();
    renderWithProvider(<TestConsumer />);

    await user.click(screen.getByTestId('toggle'));

    expect(screen.getByTestId('brand')).toHaveTextContent('Gwiriwr CC');
  });

  it('t() supports placeholder replacement', () => {
    const Placeholder = () => {
      const { t } = useLanguage();
      return <span data-testid="welcome">{t('header.welcome', { name: 'John' })}</span>;
    };

    renderWithProvider(<Placeholder />);
    expect(screen.getByTestId('welcome')).toHaveTextContent('Welcome, John');
  });

  it('t() falls back to English for missing Welsh keys', async () => {
    const user = userEvent.setup();

    const FallbackTest = () => {
      const { t, toggleLanguage } = useLanguage();
      return (
        <div>
          <span data-testid="value">{t('howItWorks.skipToContent')}</span>
          <button data-testid="toggle" onClick={toggleLanguage}>Toggle</button>
        </div>
      );
    };

    renderWithProvider(<FallbackTest />);
    await user.click(screen.getByTestId('toggle'));

    const displayed = screen.getByTestId('value').textContent;
    expect(displayed).toBeTruthy();
    expect(displayed).not.toBe('howItWorks.skipToContent');
  });

  it('t() returns the key itself if not found in either language', () => {
    const MissingKey = () => {
      const { t } = useLanguage();
      return <span data-testid="missing">{t('totally.made.up.key')}</span>;
    };

    renderWithProvider(<MissingKey />);
    expect(screen.getByTestId('missing')).toHaveTextContent('totally.made.up.key');
  });

  it('toggleLanguage switches between en and cy', async () => {
    const user = userEvent.setup();
    renderWithProvider(<TestConsumer />);

    expect(screen.getByTestId('language')).toHaveTextContent('en');

    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('language')).toHaveTextContent('cy');

    await user.click(screen.getByTestId('toggle'));
    expect(screen.getByTestId('language')).toHaveTextContent('en');
  });

  it('persists language in localStorage', async () => {
    const user = userEvent.setup();
    renderWithProvider(<TestConsumer />);

    await user.click(screen.getByTestId('toggle'));

    expect(localStorage.getItem('language')).toBe('cy');
  });

  it('language toggle button works in Header', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LanguageProvider>
          <Header />
        </LanguageProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('QC Checker')).toBeInTheDocument();

    const toggleButton = screen.getByTitle('Cymraeg');
    await user.click(toggleButton);

    expect(screen.getByText('Gwiriwr CC')).toBeInTheDocument();
  });
});
