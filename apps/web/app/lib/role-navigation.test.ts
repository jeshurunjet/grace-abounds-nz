import { describe, expect, it } from 'vitest';
import { getRoleNavigation, isRouteActive } from './role-navigation';

describe('role navigation', () => {
  it.each([
    ['member', '/members', 'Member Dashboard'],
    ['pastor', '/pastor', 'Pastor Workspace'],
    ['admin', '/admin', 'Admin Dashboard'],
  ] as const)('maps %s to its workspace', (role, href, label) => {
    expect(getRoleNavigation(role)).toMatchObject({
      workspaceHref: href,
      workspaceLabel: label,
    });
  });

  it('uses the member workspace only when the role is unavailable', () => {
    expect(getRoleNavigation(undefined).workspaceHref).toBe('/members');
  });

  it('matches nested routes without making a root dashboard globally active', () => {
    expect(isRouteActive('/admin/cms/editor', '/admin/cms')).toBe(true);
    expect(isRouteActive('/admin/cms', '/admin')).toBe(true);
    expect(isRouteActive('/admin/cms', '/')).toBe(false);
  });
});
