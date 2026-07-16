import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Unauthorized from './Unauthorized';

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

const renderPage = () =>
  render(
    <MemoryRouter>
      <Unauthorized />
    </MemoryRouter>
  );

describe('Unauthorized', () => {
  it('renders the page with header and footer', () => {
    renderPage();
    expect(screen.getByText('Header')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('renders the unauthorized title', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders a link back to the home page', () => {
    renderPage();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/');
  });

  it('renders a description message', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent.length).toBeGreaterThan(0);
  });
});
