import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home', () => {
  it('identifies the project', () => {
    render(<Home />);
    expect(
      screen.getByRole('heading', { name: 'Grace Abounds NZ' }),
    ).toBeInTheDocument();
  });
});
