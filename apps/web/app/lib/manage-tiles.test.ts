import { describe, expect, it } from 'vitest';
import { manageTiles } from './manage-tiles';
import { workspaceLinks } from '../components/admin-shell';
import { isManageRoute } from './role-navigation';

describe('workspace navigation by role', () => {
  it('members keep Calendar and Resources in the sidebar; staff find them under Manage', () => {
    const labels = (role: string) => workspaceLinks(role).map((l) => l.label);
    for (const role of ['member', 'admin', 'pastor'])
      expect(labels(role)).toEqual(
        expect.arrayContaining([
          'Main website',
          'Home',
          'Messages',
          'Settings',
          'Help',
        ]),
      );
    expect(labels('member')).toEqual(
      expect.arrayContaining(['Calendar', 'Resources']),
    );
    expect(labels('member')).not.toContain('Manage');
    for (const role of ['admin', 'pastor']) {
      expect(labels(role)).toContain('Manage');
      expect(labels(role)).not.toContain('Calendar');
      const tiles = manageTiles(role).map((t) => t.href);
      expect(tiles).toEqual(
        expect.arrayContaining(['/members/calendar', '/members/gallery']),
      );
    }
  });

  it('shows each role only the tools it may use', () => {
    const titles = (role: string) => manageTiles(role).map((t) => t.title);
    expect(titles('admin')).toEqual([
      'Website content',
      'Activities',
      'Calendar',
      'Resources',
      'Sermons',
      'Member directory',
    ]);
    expect(titles('pastor')).toEqual([
      'Website content',
      'Activities',
      'Calendar',
      'Resources',
      'Sermons',
      'Members & roles',
      'Pastoral care',
    ]);
  });

  it('keeps Manage highlighted inside its tools', () => {
    expect(isManageRoute('/admin/cms')).toBe(true);
    expect(isManageRoute('/pastor/care')).toBe(true);
    expect(isManageRoute('/members/messages')).toBe(false);
  });
});
