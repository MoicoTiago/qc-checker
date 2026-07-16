import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Footer from './Footer';

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

const renderFooter = () =>
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );

describe('Footer', () => {
  it('renders the brand name', () => {
    renderFooter();
    expect(screen.getByText('QC Checker')).toBeInTheDocument();
  });

  it('renders the Quick Links section heading', () => {
    renderFooter();
    expect(screen.getByText('Quick Links')).toBeInTheDocument();
  });

  it('renders the Portfolio section heading', () => {
    renderFooter();
    expect(screen.getByText('Portfolio')).toBeInTheDocument();
  });

  it('renders navigation links for How It Works, User Login, and Admin Login', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /user login/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /admin login/i })).toBeInTheDocument();
  });

  it('links to the public source repository', () => {
    renderFooter();
    expect(screen.getByRole('link', { name: /github source code/i })).toHaveAttribute(
      'href',
      'https://github.com/MoicoTiago/qc-checker'
    );
  });

  it('renders the copyright notice with the current year', () => {
    renderFooter();
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(String(year)))).toBeInTheDocument();
  });

  it('renders the footer description text', () => {
    renderFooter();
    expect(screen.getByText(/AI-powered quality control/i)).toBeInTheDocument();
  });
});
