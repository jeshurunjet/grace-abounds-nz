import type { PageContentMap, SiteSettings } from './content.js';

/*
 * Development starting content, written to an EMPTY database by the explicit
 * `content:seed` command only. Never used as a runtime fallback: the bank
 * details and contacts below are placeholders, not approved church details.
 */

export const defaultSiteSettings: SiteSettings = {
  contact: {
    email: 'hello@graceaboundsnz.org',
    phone: '+64 9 123 4567',
    address: '45 Great South Road, Manukau, Auckland 2104',
  },
  footerAddress: '45 Great South Road, Manukau, Auckland 2104',
  social: {
    facebook: 'https://www.facebook.com/',
    instagram: 'https://www.instagram.com/',
    youtube: 'https://www.youtube.com/',
  },
  authVerses: [
    {
      text: 'His grace is sufficient for every season.',
      reference: '2 Corinthians 12:9',
    },
    {
      text: 'Be strong and courageous. Do not be afraid; for the Lord your God will be with you wherever you go.',
      reference: 'Joshua 1:9',
    },
    {
      text: 'The Lord is my shepherd; I shall not want.',
      reference: 'Psalm 23:1',
    },
  ],
  giving: {
    accountName: 'Grace Abounds Church NZ Trust',
    bank: 'ANZ Bank New Zealand',
    accountNumber: '06-0261-0123456-00',
  },
};

const unsplash = (id: string, w: number, h: number) =>
  `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&auto=format`;
const heroImages = [
  '/images/hero-1.jpg',
  '/images/hero-6.jpg',
  '/images/hero-2.jpg',
  '/images/hero-3.jpg',
  '/images/hero-4.jpg',
  '/images/hero-5.jpg',
];

export const defaultPages: PageContentMap = {
  home: {
    hero: {
      eyebrow: 'Auckland, New Zealand · Sundays 10:00am',
      title: 'Grace',
      accent: 'Abounds.',
      copy: 'A community of faith rooted in love, growing in grace, and reaching the world with the hope of Jesus Christ.',
    },
    verse: {
      text: 'From his fullness we have all received, grace upon grace.',
      reference: 'John 1:16',
    },
    heroImages,
    gallery: heroImages,
  },
  about: {
    intro:
      'Grace Abounds International began with a small group of families in South Auckland with a big vision: to see every person in New Zealand encounter the transforming love of God.',
    story:
      'Grace Abounds International was planted in 2012 by Bartolome and Maria Sanchez in a rented hall in Manukau with 23 people. What started as a Bible study in their home grew into a thriving community spanning three Auckland locations.\n\nToday we serve over 800 people every Sunday, with life groups meeting throughout the week, a growing missions presence in the Pacific, and a commitment to seeing our city transformed by the Gospel.\n\nWe are a church for the everyday New Zealander — diverse, passionate, and unapologetically full of faith.',
    heroImage: unsplash('1529156069898-49953e39b3ac', 1600, 600),
    image: unsplash('1492551557933-34265f7af79e', 700, 500),
    ministryYears: '12+',
    officeHours: 'Mon–Fri, 9:00am – 4:00pm',
    values: [
      {
        number: '01',
        title: 'Scripture',
        body: 'The Bible is our foundation — we believe it is the inspired Word of God, authoritative for faith and life.',
      },
      {
        number: '02',
        title: 'Community',
        body: 'Life is better together. We pursue authentic relationships marked by love, honesty, and mutual commitment.',
      },
      {
        number: '03',
        title: 'Mission',
        body: 'We exist to reach people far from God and bring them into a life-giving relationship with Jesus.',
      },
      {
        number: '04',
        title: 'Generosity',
        body: 'We are called to give freely as we have freely received — with our time, resources, and gifting.',
      },
    ],
  },
  location: {
    hero: {
      eyebrow: 'Find Your Place',
      title: 'Locations &',
      accent: 'Community',
      copy: 'Three campuses across Auckland, plus connect groups and Bible studies throughout the week.',
    },
  },
  'next-steps': {
    hero: {
      eyebrow: 'Take a Step',
      title: 'Next',
      accent: 'Steps',
      copy: 'Wherever you are on your journey with God, there is always a meaningful next step. We are here to help you find it.',
    },
  },
  give: {
    hero: {
      eyebrow: 'Generosity',
      title: 'Give',
      accent: 'Generously.',
      copy: 'We believe giving is an act of worship and an expression of trust in God. Every gift supports our mission to reach New Zealand and the Pacific with the hope of Jesus.',
    },
    verse: {
      text: 'Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver.',
      reference: '2 Corinthians 9:7',
    },
    impact: [
      {
        percent: '40%',
        title: 'Local Ministry',
        body: 'Sunday services, life groups, kids and youth programmes, and pastoral care.',
      },
      {
        percent: '30%',
        title: 'Missions & Outreach',
        body: 'Pacific missions trips, community outreach, and church planting partnerships.',
      },
      {
        percent: '30%',
        title: 'Facilities & Operations',
        body: 'Maintaining our campuses and investing in technology to reach more people.',
      },
    ],
  },
  events: {
    hero: {
      eyebrow: "What's On",
      title: 'Events &',
      accent: 'Calendar',
      copy: 'Gather, grow, and find your place in the life of our community.',
    },
  },
  sermons: {
    hero: {
      eyebrow: 'The Word',
      title: 'Sermons &',
      accent: 'Messages',
      copy: 'Watch recent messages and explore teaching from Grace Abounds.',
    },
  },
};
