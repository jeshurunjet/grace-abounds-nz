import {
  CalendarCheck,
  CalendarCog,
  Globe,
  Heart,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';

export type StaffTool = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: 'website' | 'activities' | 'sermons' | 'members' | 'care';
};

/** The staff tools each role may open (shown on Home). The server enforces
 * the same rules. */
export function staffTools(role: string): StaffTool[] {
  const tiles: StaffTool[] = [
    {
      href: '/admin/cms',
      title: 'Website content',
      description:
        'Photos, stories, leadership and contact details on the public website.',
      icon: Globe,
      tone: 'website',
    },
    {
      href: role === 'pastor' ? '/pastor#calendar' : '/admin#calendar',
      title: 'Activities',
      description:
        'Create and edit services, groups and events from the calendar on Home.',
      icon: CalendarCog,
      tone: 'activities',
    },
    {
      href: '/admin/sermons',
      title: 'Sermons',
      description: 'Sermon details and recordings.',
      icon: Video,
      tone: 'sermons',
    },
    {
      href: '/admin/users',
      title: 'People',
      description:
        'Find member accounts and suspend or reactivate access when needed.',
      icon: Users,
      tone: 'members',
    },
  ];
  if (role === 'pastor')
    tiles.push({
      href: '/pastor/care',
      title: 'Pastoral care',
      description:
        'Prayer requests and appointment requests. Private to pastors.',
      icon: Heart,
      tone: 'care',
    });
  // Admin schedules appointments without seeing topics, messages or notes.
  if (role === 'admin')
    tiles.push({
      href: '/admin/appointments',
      title: 'Appointments',
      description: 'Suggest and confirm appointment times. No private details.',
      icon: CalendarCheck,
      tone: 'care',
    });
  return tiles;
}
