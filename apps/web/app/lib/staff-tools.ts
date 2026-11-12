import {
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
      href: '/admin/events',
      title: 'Activities',
      description:
        'Create and edit the services, groups, studies and teams that appear on the calendar.',
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
    role === 'pastor'
      ? {
          href: '/admin/users',
          title: 'Members & roles',
          description: 'Member accounts and who can manage what.',
          icon: Users,
          tone: 'members',
        }
      : {
          href: '/admin/users',
          title: 'Member directory',
          description:
            'Look up member accounts. Role changes are made by the pastor.',
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
  return tiles;
}
