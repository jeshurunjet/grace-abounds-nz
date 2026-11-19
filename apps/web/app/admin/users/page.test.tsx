import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import PeoplePage from './page';

/*
 * Phase 4C: People is the canonical directory. The page no longer reads
 * browser-stored users, offers no role changes, deletion or prototype
 * activity panels; it hosts the server-backed directory only.
 */
const content = vi.hoisted(() => ({ used: false }));
vi.mock('../../components/content-provider', () => ({
  useContent: () => {
    content.used = true;
    return {};
  },
}));
vi.mock('../../components/admin-shell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../../components/people-directory', () => ({
  PeopleDirectory: () => <p>Canonical directory</p>,
}));

describe('People page', () => {
  it('hosts the canonical directory without browser users or role controls', () => {
    render(<PeoplePage />);
    expect(screen.getByRole('heading', { name: 'People' })).toBeInTheDocument();
    expect(screen.getByText('Canonical directory')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/Review account deletion/)).toBeNull();
    expect(screen.queryByText(/Service assignments|Participation/)).toBeNull();
    expect(content.used).toBe(false);
  });
});
