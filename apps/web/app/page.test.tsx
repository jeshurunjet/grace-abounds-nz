import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('renders the public homepage and calls to action', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: /Grace Abounds/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "I'm New Here" })).toHaveAttribute(
      'href',
      '/next-steps',
    );
    expect(
      screen.getByRole('heading', { name: 'Events & Announcements' }),
    ).toBeInTheDocument();
  });
});
