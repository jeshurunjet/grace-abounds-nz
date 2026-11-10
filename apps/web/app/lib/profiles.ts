import type { AppRole } from '../../auth';

export type PersonProfile = {
  id: string;
  userId: string;
  role: AppRole;
  title: string;
  name: string;
  shortName: string;
  email: string;
  phone: string;
  bio: string;
  photo: string;
  workspace: string;
  workspaceHref: string;
  calendarId?: string;
};

export const profiles: PersonProfile[] = [
  {
    id: 'pastor-bartolome-sanchez',
    userId: 'pastor-1',
    role: 'pastor',
    title: 'Senior Pastor',
    name: 'Pastor Bartolome R. Sanchez',
    shortName: 'Bartolome Sanchez',
    email: 'bartolome@graceaboundsnz.org',
    phone: '+64 21 482 761',
    bio: 'Serving Grace Abounds with a heart for discipleship, pastoral care, and church planting across New Zealand and the Pacific.',
    photo:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=faces&fit=crop&w=600&h=600&q=85',
    workspace: 'Pastor Workspace',
    workspaceHref: '/pastor',
    calendarId: 'pastor-calendar-1',
  },
  {
    id: 'admin-maria-santos',
    userId: 'admin-1',
    role: 'admin',
    title: 'Church Administrator',
    name: 'Maria Santos',
    shortName: 'Maria Santos',
    email: 'admin@graceaboundsnz.org',
    phone: '+64 21 730 194',
    bio: 'Supporting our ministries, members, events, and digital publishing so every team can serve with clarity and care.',
    photo:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=faces&fit=crop&w=600&h=600&q=85',
    workspace: 'Admin Dashboard',
    workspaceHref: '/admin',
  },
  {
    id: 'member-michael-tane',
    userId: 'member-1',
    role: 'member',
    title: 'Grace Member',
    name: 'Michael Tane',
    shortName: 'Michael Tane',
    email: 'michael.tane@example.com',
    phone: '+64 21 555 018',
    bio: 'Part of the Manukau campus and the South Auckland Connect Group.',
    photo:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=faces&fit=crop&w=600&h=600&q=85',
    workspace: 'Member Dashboard',
    workspaceHref: '/members',
  },
];

export const profileById = (id?: string) =>
  profiles.find((profile) => profile.id === id);
export const profileByRole = (role?: AppRole) =>
  profiles.find((profile) => profile.role === role) ?? profiles[2]!;

const ROLE_TITLES: Record<AppRole, string> = {
  pastor: 'Pastor',
  admin: 'Administrator',
  member: 'Member',
};
export const DEFAULT_AVATAR = '/images/avatar-default.svg';
const IMAGE_HOSTS = ['lh3.googleusercontent.com', 'images.unsplash.com'];

/** Only same-site paths or configured image hosts are rendered. */
export function safeAvatar(image?: string | null) {
  if (!image) return DEFAULT_AVATAR;
  if (image.startsWith('/') && !image.startsWith('//')) return image;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && IMAGE_HOSTS.includes(url.hostname)
      ? image
      : DEFAULT_AVATAR;
  } catch {
    return DEFAULT_AVATAR;
  }
}

/**
 * Display details for the signed-in account, from the real session. The
 * profile id is the canonical user id; there is no demo-profile fallback.
 */
export function accountProfile(user?: {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role?: AppRole;
}) {
  const name =
    user?.name?.trim() || user?.email?.split('@')[0] || 'Your account';
  return {
    id: user?.id ?? '',
    name,
    shortName: name,
    title: ROLE_TITLES[user?.role ?? 'member'],
    photo: safeAvatar(user?.image),
  };
}
