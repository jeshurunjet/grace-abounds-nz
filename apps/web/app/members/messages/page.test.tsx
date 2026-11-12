import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import MessagesPage from './page';

vi.mock('../../components/member-shell', () => ({
  MemberShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('Messages (future feature)', () => {
  it('a direct visit shows a clear unavailable state, not the prototype chat', () => {
    render(<MessagesPage />);
    expect(
      screen.getByRole('heading', { name: 'Messaging isn’t available yet' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute(
      'href',
      '/members',
    );
  });
});
