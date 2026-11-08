export const locations = [
  {
    name: 'Grace Centre — Manukau',
    address: '45 Great South Road, Manukau, Auckland 2104',
    times: ['Sunday 10:00am', 'Wednesday 7:00pm (Life Night)'],
    type: 'Main Campus',
    image:
      'https://images.unsplash.com/photo-1519741497674-611481863552?w=700&h=400&fit=crop&auto=format',
  },
  {
    name: 'Grace East — Botany',
    address: '12 Chapel Road, Botany, Auckland 2013',
    times: ['Sunday 10:00am', 'Thursday 7:00pm (Connect Night)'],
    type: 'Campus',
    image:
      'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=700&h=400&fit=crop&auto=format',
  },
  {
    name: 'Grace West — Henderson',
    address: '8 Lincoln Road, Henderson, Auckland 0612',
    times: ['Sunday 10:00am'],
    type: 'Campus',
    image:
      'https://images.unsplash.com/photo-1438032005730-c779502df39b?w=700&h=400&fit=crop&auto=format',
  },
];
export const groups: [string, string, string, string][] = [
  [
    'South Auckland Young Adults',
    'Mike & Aroha Tane',
    'Tuesday · 7:00pm',
    'Manukau',
  ],
  [
    'Botany Families Group',
    'Daniel & Claire Puru',
    'Wednesday · 7:30pm',
    'Botany',
  ],
  ["Henderson Women's Group", 'Lisa Ngata', 'Thursday · 10:00am', 'Henderson'],
  [
    'Pacific Island Fellowship',
    'Sione & Mele Taufa',
    'Friday · 7:00pm',
    'Papatoetoe',
  ],
  ['Online Connect Group', 'Sarah Keil', 'Wednesday · 8:00pm', 'Online'],
  [
    'Central Auckland Young Professionals',
    'Joshua Kim',
    'Tuesday · 6:30pm',
    'City Centre',
  ],
];
export const studies: [string, string, string, string][] = [
  [
    'Foundations Class',
    'A 6-week introduction to core Christian beliefs. Perfect for those new to faith or wanting a solid theological grounding.',
    'Monthly · Saturdays 9am–12pm',
    'Grace Centre',
  ],
  [
    "Men's Bible Study",
    'A deep-dive study through books of the Bible with a focus on applying Scripture to daily life as men of faith.',
    'Fortnightly · Saturdays 7am',
    'Various Cafés',
  ],
  [
    "Women's Word & Worship",
    'A rich time of study, prayer, and fellowship for women at all stages of life and faith.',
    'Monthly · Friday evenings',
    'Grace Centre',
  ],
];

export const steps = [
  {
    icon: '✦',
    title: 'New to Faith',
    subtitle: 'Starting Your Journey',
    heading: 'Welcome to the Family',
    body: "Whether you've just prayed to receive Jesus for the first time, or you're curious about what it means to follow Him — you're in the right place. We'd love to walk alongside you as you begin this journey.",
    cta: 'Plan Your Visit',
    memberHref: '/members?join=New%20to%20Faith',
    path: [
      'Attend a Sunday service at any of our campuses',
      'Connect with our welcome team after the service',
      'Join our Foundations Course (6 weeks, free)',
      'Get connected to a life group in your area',
    ],
  },
  {
    icon: '◈',
    title: 'Connect Groups',
    subtitle: 'Life in Community',
    heading: 'Find Your People',
    body: 'Connect Groups are the heartbeat of Grace Abounds International. These are small communities of 8–16 people who meet weekly in homes and cafés across Auckland to study the Bible, pray together, and do life.',
    cta: 'Find a Group',
    memberHref: '/members?join=Connect%20Groups',
    path: [
      'Browse groups by area or life stage',
      'Attend a trial visit — no commitment needed',
      'Get introduced to the group leader',
      'Join and do life together',
    ],
  },
  {
    icon: '◎',
    title: 'Baptism',
    subtitle: 'A Public Declaration',
    heading: 'Take the Next Step',
    body: "Baptism is one of the most significant moments in a believer's life — a public declaration that you've put your trust in Jesus and chosen to follow Him.",
    cta: 'Register for Baptism',
    memberHref: '/members?join=Baptism',
    path: [
      'Attend a Baptism Info Evening (1 hour)',
      'Share your story with a pastor',
      'Invite your people to be there',
      'Be baptised!',
    ],
  },
  {
    icon: '◇',
    title: 'Leadership',
    subtitle: 'Grow to Lead',
    heading: 'Lead Where You Are',
    body: "We believe every person has a God-given calling to lead in some capacity. Whether it's serving on a Sunday, leading a life group, or joining our internship programme — there's a place for you to grow.",
    cta: 'Start Serving',
    memberHref: '/members?join=Leadership',
    path: [
      'Start serving in any area of the church',
      'Apply for our Leadership Track programme',
      'Join a mentoring relationship with a senior leader',
      'Pioneer something new',
    ],
  },
  {
    icon: '♫',
    title: 'Worship Team',
    subtitle: 'Music & Production',
    heading: 'Help Lead the Church in Worship',
    body: 'Use your musical, vocal, production, or creative gifts to serve our gatherings. The team includes musicians, vocalists, sound, lighting, livestream, and presentation volunteers.',
    cta: 'Join the Worship Team',
    memberHref: '/members?join=Worship%20%26%20Music%20Ministry',
    adminHref: '/admin/cms',
    path: [
      'Tell us where you would like to serve',
      'Meet the worship or production leader',
      'Attend an orientation and skills session',
      'Join a rehearsal and serving roster',
    ],
  },
];

export const values = [
  [
    '01',
    'Scripture',
    'The Bible is our foundation — we believe it is the inspired Word of God, authoritative for faith and life.',
  ],
  [
    '02',
    'Community',
    'Life is better together. We pursue authentic relationships marked by love, honesty, and mutual commitment.',
  ],
  [
    '03',
    'Mission',
    'We exist to reach people far from God and bring them into a life-giving relationship with Jesus.',
  ],
  [
    '04',
    'Generosity',
    'We are called to give freely as we have freely received — with our time, resources, and gifting.',
  ],
];

export const gallery = [
  '/images/hero-1.jpg',
  '/images/hero-6.jpg',
  '/images/hero-2.jpg',
  '/images/hero-3.jpg',
  '/images/hero-4.jpg',
  '/images/hero-5.jpg',
];

export const pageHeroes = {
  '/location': {
    eyebrow: 'Find Your Place',
    title: 'Locations &',
    accent: 'Community',
    copy: 'Three campuses across Auckland, plus connect groups and Bible studies throughout the week.',
  },
  '/next-steps': {
    eyebrow: 'Take a Step',
    title: 'Next',
    accent: 'Steps',
    copy: 'Wherever you are on your journey with God, there is always a meaningful next step. We are here to help you find it.',
  },
  '/give': {
    eyebrow: 'Generosity',
    title: 'Give',
    accent: 'Generously.',
    copy: 'We believe giving is an act of worship and an expression of trust in God. Every gift supports our mission to reach New Zealand and the Pacific with the hope of Jesus.',
  },
  '/events': {
    eyebrow: "What's On",
    title: 'Events &',
    accent: 'Calendar',
    copy: 'Gather, grow, and find your place in the life of our community.',
  },
  '/sermons': {
    eyebrow: 'The Word',
    title: 'Sermons &',
    accent: 'Messages',
    copy: 'Watch recent messages and explore teaching from Grace Abounds.',
  },
};
export const publicPages = {
  resources: [] as {
    id: string;
    title: string;
    type: string;
    url: string;
    description: string;
  }[],
  locations,
  groups,
  studies,
  steps,
  values,
  gallery,
  heroImages: gallery,
  heroes: pageHeroes,
  aboutIntro:
    'Grace Abounds International began with a small group of families in South Auckland with a big vision: to see every person in New Zealand encounter the transforming love of God.',
  aboutImage:
    'https://images.unsplash.com/photo-1492551557933-34265f7af79e?w=700&h=500&fit=crop&auto=format',
  aboutHeroImage:
    'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=600&fit=crop&auto=format',
  ministryYears: '12+',
  officeHours: 'Mon–Fri, 9:00am – 4:00pm',
  givingImpact: [
    [
      '40%',
      'Local Ministry',
      'Sunday services, life groups, kids and youth programmes, and pastoral care.',
    ],
    [
      '30%',
      'Missions & Outreach',
      'Pacific missions trips, community outreach, and church planting partnerships.',
    ],
    [
      '30%',
      'Facilities & Operations',
      'Maintaining our campuses and investing in technology to reach more people.',
    ],
  ],
};
