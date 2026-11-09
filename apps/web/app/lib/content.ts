import { publicPages } from './page-content';
import type { Activity, ActivityException, Participation } from './activities';
import { seedActivities, seedActivityExceptions } from './activity-seed';
export type PublishStatus = 'draft' | 'published' | 'archived';
export const publishStatuses: PublishStatus[] = [
  'draft',
  'published',
  'archived',
];
export type Sermon = {
  id: string;
  slug: string;
  title: string;
  series: string;
  speaker: string;
  date: string;
  duration: string;
  image: string;
  summary: string;
  status: PublishStatus;
  progress: number;
  mediaUrl?: string;
};
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  image: string;
  status: PublishStatus;
};
export type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: 'member' | 'pastor' | 'admin';
  status: 'active' | 'suspended';
};
export type AppointmentRequest = {
  id: string;
  userId: string;
  type: string;
  preferredDate: string;
  message: string;
  status: 'pending' | 'confirmed' | 'completed' | 'declined';
  createdAt: string;
};
export type ParticipationApplication = {
  id: string;
  userId: string;
  opportunity: string;
  status: 'submitted' | 'reviewing' | 'approved' | 'declined';
  createdAt: string;
};
export type ServiceAssignment = {
  id: string;
  userId: string;
  title: string;
  date: string;
  time: string;
  location: string;
  status: 'assigned' | 'confirmed' | 'declined';
};
export type MemberPrayerRequest = {
  id: string;
  userId: string;
  request: string;
  status: 'new' | 'praying' | 'completed';
  createdAt: string;
};
export type SiteContent = {
  heroEyebrow: string;
  heroTitle: string;
  heroAccent: string;
  heroCopy: string;
  story: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  footerAddress: string;
  facebookUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  homeVerseText: string;
  homeVerseReference: string;
  givingVerseText: string;
  givingVerseReference: string;
  authVerses: string;
  givingAccount: string;
  givingBank: string;
  givingNumber: string;
};
export type MessageRecord = {
  id: string;
  memberId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
};
export type ContentState = {
  messages: MessageRecord[];
  pages: typeof publicPages;
  site: SiteContent;
  sermons: Sermon[];
  /** Live data: edited by pastor/admin without the approval workflow. */
  activities: Activity[];
  activityExceptions: ActivityException[];
  participations: Participation[];
  team: TeamMember[];
  users: UserRecord[];
  appointmentRequests: AppointmentRequest[];
  participationApplications: ParticipationApplication[];
  serviceAssignments: ServiceAssignment[];
  memberPrayerRequests: MemberPrayerRequest[];
};

const image = (id: string, size = '900x600') =>
  `https://images.unsplash.com/photo-${id}?w=${size.split('x')[0]}&h=${size.split('x')[1]}&fit=crop&auto=format`;

export const seedContent: ContentState = {
  messages: [],
  pages: publicPages,
  site: {
    heroEyebrow: 'Auckland, New Zealand · Sundays 10:00am',
    heroTitle: 'Grace',
    heroAccent: 'Abounds.',
    heroCopy:
      'A community of faith rooted in love, growing in grace, and reaching the world with the hope of Jesus Christ.',
    story:
      'Grace Abounds International was planted in 2012 by Bartolome and Maria Sanchez in a rented hall in Manukau with 23 people. What started as a Bible study in their home grew into a thriving community spanning three Auckland locations.\n\nToday we serve over 800 people every Sunday, with life groups meeting throughout the week, a growing missions presence in the Pacific, and a commitment to seeing our city transformed by the Gospel.\n\nWe are a church for the everyday New Zealander — diverse, passionate, and unapologetically full of faith.',
    contactEmail: 'hello@graceaboundsnz.org',
    contactPhone: '+64 9 123 4567',
    contactAddress: '45 Great South Road, Manukau, Auckland 2104',
    footerAddress: '45 Great South Road, Manukau, Auckland 2104',
    facebookUrl: 'https://www.facebook.com/',
    instagramUrl: 'https://www.instagram.com/',
    youtubeUrl: 'https://www.youtube.com/',
    homeVerseText: 'From his fullness we have all received, grace upon grace.',
    homeVerseReference: 'John 1:16',
    givingVerseText:
      'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.',
    givingVerseReference: '2 Corinthians 9:7',
    authVerses:
      'His grace is sufficient for every season.|2 Corinthians 12:9\nBe strong and courageous. Do not be afraid; for the Lord your God will be with you wherever you go.|Joshua 1:9\nThe Lord is my shepherd; I shall not want.|Psalm 23:1',
    givingAccount: 'Grace Abounds Church NZ Trust',
    givingBank: 'ANZ Bank New Zealand',
    givingNumber: '06-0261-0123456-00',
  },
  activities: seedActivities,
  activityExceptions: seedActivityExceptions,
  participations: [],
  sermons: [
    {
      id: 's1',
      slug: 'walking-in-the-spirit',
      title: 'Walking in the Spirit',
      series: 'Life in the Spirit',
      speaker: 'Pastor Bartolome R. Sanchez',
      date: '4 Oct 2026',
      duration: '42 min',
      image: image('1507003211169-0a1dd7228f2d', '1200x675'),
      summary:
        'A practical message about living each day attentive to the leading of the Holy Spirit.',
      status: 'published',
      progress: 100,
    },
    {
      id: 's2',
      slug: 'the-grace-of-giving',
      title: 'The Grace of Giving',
      series: 'Generosity',
      speaker: 'Pastor Sarah Keil',
      date: '28 Sep 2026',
      duration: '38 min',
      image: image('1478737270239-2f02b77fc618', '1200x675'),
      summary: 'Discover generosity as an expression of worship and trust.',
      status: 'published',
      progress: 100,
    },
    {
      id: 's3',
      slug: 'rooted-and-built-up',
      title: 'Rooted and Built Up',
      series: 'Foundations',
      speaker: 'Pastor Bartolome R. Sanchez',
      date: '21 Sep 2026',
      duration: '45 min',
      image: image('1504711434969-e33886168f5c', '1200x675'),
      summary: 'Building a resilient life on the foundation of Jesus.',
      status: 'draft',
      progress: 72,
    },
    {
      id: 's4',
      slug: 'a-hope-that-holds',
      title: 'A Hope That Holds',
      series: 'Living Hope',
      speaker: 'Mereana Example',
      date: '14 Sep 2026',
      duration: '36 min',
      image: image('1529156069898-49953e39b3ac', '1200x675'),
      summary: 'How the hope of Jesus steadies us in seasons of uncertainty.',
      status: 'published',
      progress: 100,
    },
    {
      id: 's5',
      slug: 'the-practice-of-peace',
      title: 'The Practice of Peace',
      series: 'The Way of Jesus',
      speaker: 'Pastor Bartolome R. Sanchez',
      date: '7 Sep 2026',
      duration: '41 min',
      image: image('1492551557933-34265f7af79e', '1200x675'),
      summary: 'Simple practices that make room for the peace of Christ.',
      status: 'published',
      progress: 100,
    },
    {
      id: 's6',
      slug: 'for-the-city',
      title: 'For the City',
      series: 'Faith in Action',
      speaker: 'Wiremu Example',
      date: '31 Aug 2026',
      duration: '39 min',
      image: image('1517457373958-b7bdd4587205', '1200x675'),
      summary: 'Joining God in the work of renewal wherever we live and serve.',
      status: 'published',
      progress: 100,
    },
    {
      id: 's7',
      slug: 'prayer-that-listens',
      title: 'Prayer That Listens',
      series: 'Teach Us to Pray',
      speaker: 'Mereana Example',
      date: '24 Aug 2026',
      duration: '44 min',
      image: image('1438032005730-c779502df39b', '1200x675'),
      summary: 'Learning to slow down, listen, and respond to God in prayer.',
      status: 'draft',
      progress: 100,
    },
    {
      id: 's8',
      slug: 'welcome-home',
      title: 'Welcome Home',
      series: 'House of Grace',
      speaker: 'Pastor Bartolome R. Sanchez',
      date: '17 Aug 2026',
      duration: '34 min',
      image: image('1507003211169-0a1dd7228f2d', '1200x675'),
      summary: 'The open invitation of grace and the community it creates.',
      status: 'published',
      progress: 100,
    },
  ],
  team: [
    {
      id: 't1',
      name: 'Pastor Bartolome R. Sanchez',
      role: 'Senior Pastor',
      bio: 'Bartolome has served as Senior Pastor for over 12 years, with a heart for discipleship and church planting throughout the Pacific and beyond.',
      image: image('1507003211169-0a1dd7228f2d', '500x500'),
      status: 'published',
    },
    {
      id: 't2',
      name: 'Pastor Sarah Keil',
      role: 'Associate Pastor',
      bio: "Sarah leads our pastoral care and women's ministry, with a passion for seeing people walk in freedom and wholeness.",
      image: image('1494790108377-be9c29b29330', '500x500'),
      status: 'published',
    },
    {
      id: 't3',
      name: 'Rev. Daniel Parata',
      role: 'Worship & Creative',
      bio: 'Daniel oversees our worship team and creative arts, cultivating environments where people encounter God’s presence.',
      image: image('1472099645785-5658abf4ff4e', '500x500'),
      status: 'published',
    },
    {
      id: 't4',
      name: 'Lisa Ngata',
      role: 'Kids & Youth Director',
      bio: 'Lisa is passionate about raising the next generation and runs our Kids Church and Young Adults programmes.',
      image: image('1438761681033-6461ffad8d80', '500x500'),
      status: 'published',
    },
  ],
  users: [
    {
      id: 'u1',
      name: 'Michael Example',
      email: 'member@example.org',
      role: 'member',
      status: 'active',
    },
    {
      id: 'u2',
      name: 'Pastor Example',
      email: 'pastor@example.org',
      role: 'pastor',
      status: 'active',
    },
    {
      id: 'u3',
      name: 'Admin Example',
      email: 'admin@example.org',
      role: 'admin',
      status: 'active',
    },
  ],
  appointmentRequests: [],
  participationApplications: [],
  serviceAssignments: [
    {
      id: 'assignment-1',
      userId: 'u1',
      title: 'Welcome Team',
      date: '2026-10-11',
      time: '9:15am',
      location: 'Grace Centre',
      status: 'assigned',
    },
    {
      id: 'assignment-2',
      userId: 'u1',
      title: 'Connect Night',
      date: '2026-10-14',
      time: '7:00pm',
      location: 'Community Room',
      status: 'confirmed',
    },
    {
      id: 'assignment-3',
      userId: 'u1',
      title: 'Worship Rehearsal',
      date: '2026-10-18',
      time: '9:30am',
      location: 'Main Auditorium',
      status: 'assigned',
    },
  ],
  memberPrayerRequests: [],
};
