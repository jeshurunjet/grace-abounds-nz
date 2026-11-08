import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Footer } from './footer';

describe('Footer', () => {
  it('renders the CMS-ready social links accessibly', () => {
    render(<Footer />);

    for (const label of ['Facebook', 'Instagram', 'YouTube']) {
      const link = screen.getByRole('link', {
        name: `${label} (opens in a new tab)`,
      });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByText('45 Great South Road, Manukau, Auckland 2104')).toBeInTheDocument();
  });
});
