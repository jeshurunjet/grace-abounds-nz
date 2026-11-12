import type { AppRole } from '../../auth';

export type RoleNavigation = {
  role: AppRole;
  workspaceHref: '/members' | '/pastor' | '/admin';
  workspaceLabel: 'Member Dashboard' | 'Pastor Workspace' | 'Admin Dashboard';
};

export const roleNavigation: Record<AppRole, RoleNavigation> = {
  member: {
    role: 'member',
    workspaceHref: '/members',
    workspaceLabel: 'Member Dashboard',
  },
  pastor: {
    role: 'pastor',
    workspaceHref: '/pastor',
    workspaceLabel: 'Pastor Workspace',
  },
  admin: {
    role: 'admin',
    workspaceHref: '/admin',
    workspaceLabel: 'Admin Dashboard',
  },
};

export function getRoleNavigation(role?: AppRole | null) {
  return roleNavigation[role ?? 'member'];
}

/** Staff tools reached from the Manage hub keep "Manage" highlighted. */
const MANAGE_ROUTES = [
  '/admin/manage',
  '/admin/cms',
  '/admin/events',
  '/admin/sermons',
  '/admin/users',
  '/pastor/care',
];
export function isManageRoute(pathname: string) {
  return MANAGE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function isRouteActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
