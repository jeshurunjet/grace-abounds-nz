import type {
  LocationInput,
  NextStepInput,
  TeamMemberInput,
} from './collections.ts';

/*
 * Starting records for an EMPTY development database (content:seed only).
 * Never a runtime fallback. Campus keys match the ids activities use.
 */
const portrait = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=500&h=500&fit=crop&auto=format`;

export const defaultLocations: (LocationInput & { key: string })[] = [
  {
    key: 'manukau',
    name: 'Grace Centre — Manukau',
    kind: 'Main Campus',
    address: '45 Great South Road, Manukau, Auckland 2104',
    image:
      'https://images.unsplash.com/photo-1519741497674-611481863552?w=700&h=400&fit=crop&auto=format',
    status: 'published',
  },
  {
    key: 'botany',
    name: 'Grace East — Botany',
    kind: 'Campus',
    address: '12 Chapel Road, Botany, Auckland 2013',
    image:
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=700&h=400&fit=crop&auto=format',
    status: 'published',
  },
  {
    key: 'henderson',
    name: 'Grace West — Henderson',
    kind: 'Campus',
    address: '8 Lincoln Road, Henderson, Auckland 0612',
    image:
      'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=700&h=400&fit=crop&auto=format',
    status: 'published',
  },
];

export const defaultNextSteps: NextStepInput[] = [
  {
    title: 'New to Faith',
    subtitle: 'Starting Your Journey',
    heading: 'Welcome to the Family',
    body: "Whether you've just prayed to receive Jesus for the first time, or you're curious about what it means to follow Him — you're in the right place. We'd love to walk alongside you as you begin this journey.",
    icon: '✦',
    cta: { kind: 'interest', label: 'Plan Your Visit', target: 'New to Faith' },
    path: [
      'Attend a Sunday service at any of our campuses',
      'Connect with our welcome team after the service',
      'Join our Foundations Course (6 weeks, free)',
      'Get connected to a life group in your area',
    ],
    status: 'published',
  },
  {
    title: 'Connect Groups',
    subtitle: 'Life in Community',
    heading: 'Find Your People',
    body: 'Connect Groups are the heartbeat of Grace Abounds International. These are small communities of 8–16 people who meet weekly in homes and cafés across Auckland to study the Bible, pray together, and do life.',
    icon: '◈',
    cta: { kind: 'interest', label: 'Find a Group', target: 'Connect Groups' },
    path: [
      'Browse groups by area or life stage',
      'Attend a trial visit — no commitment needed',
      'Get introduced to the group leader',
      'Join and do life together',
    ],
    status: 'published',
  },
  {
    title: 'Baptism',
    subtitle: 'A Public Declaration',
    heading: 'Take the Next Step',
    body: "Baptism is one of the most significant moments in a believer's life — a public declaration that you've put your trust in Jesus and chosen to follow Him.",
    icon: '◎',
    cta: { kind: 'interest', label: 'Register for Baptism', target: 'Baptism' },
    path: [
      'Attend a Baptism Info Evening (1 hour)',
      'Share your story with a pastor',
      'Invite your people to be there',
      'Be baptised!',
    ],
    status: 'published',
  },
  {
    title: 'Leadership',
    subtitle: 'Grow to Lead',
    heading: 'Lead Where You Are',
    body: "We believe every person has a God-given calling to lead in some capacity. Whether it's serving on a Sunday, leading a life group, or joining our internship programme — there's a place for you to grow.",
    icon: '◇',
    cta: { kind: 'interest', label: 'Start Serving', target: 'Leadership' },
    path: [
      'Start serving in any area of the church',
      'Apply for our Leadership Track programme',
      'Join a mentoring relationship with a senior leader',
      'Pioneer something new',
    ],
    status: 'published',
  },
  {
    title: 'Worship Team',
    subtitle: 'Music & Production',
    heading: 'Help Lead the Church in Worship',
    body: 'Use your musical, vocal, production, or creative gifts to serve our gatherings. The team includes musicians, vocalists, sound, lighting, livestream, and presentation volunteers.',
    icon: '♫',
    cta: {
      kind: 'interest',
      label: 'Join the Worship Team',
      target: 'Worship & Music Ministry',
    },
    path: [
      'Tell us where you would like to serve',
      'Meet the worship or production leader',
      'Attend an orientation and skills session',
      'Join a rehearsal and serving roster',
    ],
    status: 'published',
  },
];

export const defaultTeam: TeamMemberInput[] = [
  {
    name: 'Pastor Bartolome R. Sanchez',
    role: 'Senior Pastor',
    bio: 'Bartolome has served as Senior Pastor for over 12 years, with a heart for discipleship and church planting throughout the Pacific and beyond.',
    image: portrait('1507003211169-0a1dd7228f2d'),
    status: 'published',
  },
  {
    name: 'Pastor Sarah Keil',
    role: 'Associate Pastor',
    bio: "Sarah leads our pastoral care and women's ministry, with a passion for seeing people walk in freedom and wholeness.",
    image: portrait('1494790108377-be9c29b29330'),
    status: 'published',
  },
  {
    name: 'Rev. Daniel Parata',
    role: 'Worship & Creative',
    bio: 'Daniel oversees our worship team and creative arts, cultivating environments where people encounter God’s presence.',
    image: portrait('1472099645785-5658abf4ff4e'),
    status: 'published',
  },
  {
    name: 'Lisa Ngata',
    role: 'Kids & Youth Director',
    bio: 'Lisa is passionate about raising the next generation and runs our Kids Church and Young Adults programmes.',
    image: portrait('1438761681033-6461ffad8d80'),
    status: 'published',
  },
];
