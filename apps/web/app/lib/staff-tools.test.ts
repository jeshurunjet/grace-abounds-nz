import { describe, expect, it } from 'vitest';
import { staffTools } from './staff-tools';
import { workspaceLinks } from '../components/admin-shell';

describe('workspace navigation by role', () => {
  it('every role keeps Calendar and Gallery in the sidebar; there is no Manage stop', () => {
    for (const role of ['member', 'admin', 'pastor']) {
      const labels = workspaceLinks(role).map((link) => link.label);
      expect(labels).toEqual(
        expect.arrayContaining([
          'Main website',
          'Home',
          'Calendar',
          'Gallery',
          'Settings',
          'Help',
        ]),
      );
      expect(labels).not.toContain('Manage');
    }
  });

  it('shows each staff role only the tools it may use', () => {
    const titles = (role: string) => staffTools(role).map((tool) => tool.title);
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
});
