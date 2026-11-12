import { describe, expect, it } from 'vitest';
import { manageTiles } from './manage-tiles';
import { workspaceLinks } from '../components/admin-shell';
import { isManageRoute } from './role-navigation';

describe('workspace navigation by role', () => {
  it('keeps member destinations visible and gives staff one Manage entry', () => {
    const labels = (role: string) => workspaceLinks(role).map((l) => l.label);
    for (const role of ['member', 'admin', 'pastor']) {
      expect(labels(role)).toEqual(
        expect.arrayContaining([
          'Main website',
          'Home',
          'Resources',
          'Calendar',
          'Settings',
          'Help',
        ]),
      );
      // Messages stays reachable through the labelled floating shortcut.
      expect(labels(role)).toContain('Messages');
    }
    expect(labels('member')).not.toContain('Manage');
    expect(labels('admin')).toContain('Manage');
    expect(labels('pastor')).toContain('Manage');
  });

  it('shows each role only the tools it may use', () => {
    const titles = (role: string) => manageTiles(role).map((t) => t.title);
    expect(titles('admin')).toEqual([
      'Website content',
      'Activities',
      'Sermons',
      'Member directory',
    ]);
    expect(titles('pastor')).toEqual([
      'Website content',
      'Activities',
      'Sermons',
      'Members & roles',
      'Pastoral care',
    ]);
  });

  it('keeps Manage highlighted inside its tools', () => {
    expect(isManageRoute('/admin/cms')).toBe(true);
    expect(isManageRoute('/pastor/care')).toBe(true);
    expect(isManageRoute('/members/calendar')).toBe(false);
  });
});
