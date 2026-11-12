import type {
  PageContentMap,
  PageKey,
  PublicContentBundle,
  SiteSettings,
} from '@grace-abounds/validation';
import type { ContentState, SiteContent } from './content';

/*
 * Converts between the API's named content shapes and the shapes the
 * existing components read (content.site / content.pages). Components stay
 * unchanged; positional tuples exist only on the component side.
 */

type LegacyPages = ContentState['pages'];
const heroRoutes = {
  location: '/location',
  'next-steps': '/next-steps',
  give: '/give',
  events: '/events',
  sermons: '/sermons',
} as const;
type HeroPage = keyof typeof heroRoutes;
type Hero = PageContentMap['home']['hero'];
const emptyHero: Hero = { eyebrow: '', title: '', accent: '', copy: '' };

/** Published bundle → the component-side site and pages fields. */
export function toLegacy(
  bundle: PublicContentBundle | null,
  base: LegacyPages,
): { site: SiteContent; pages: LegacyPages } {
  const s = bundle?.site;
  const p = bundle?.pages;
  const site: SiteContent = {
    heroEyebrow: p?.home.hero.eyebrow ?? '',
    heroTitle: p?.home.hero.title ?? '',
    heroAccent: p?.home.hero.accent ?? '',
    heroCopy: p?.home.hero.copy ?? '',
    homeVerseText: p?.home.verse.text ?? '',
    homeVerseReference: p?.home.verse.reference ?? '',
    story: p?.about.story ?? '',
    contactEmail: s?.contact.email ?? '',
    contactPhone: s?.contact.phone ?? '',
    contactAddress: s?.contact.address ?? '',
    footerAddress: s?.footerAddress ?? '',
    facebookUrl: s?.social.facebook ?? '',
    instagramUrl: s?.social.instagram ?? '',
    youtubeUrl: s?.social.youtube ?? '',
    authVerses: (s?.authVerses ?? [])
      .map((v) => `${v.text}|${v.reference}`)
      .join('\n'),
    givingVerseText: p?.give.verse.text ?? '',
    givingVerseReference: p?.give.verse.reference ?? '',
    givingAccount: s?.giving.accountName ?? '',
    givingBank: s?.giving.bank ?? '',
    givingNumber: s?.giving.accountNumber ?? '',
  };
  const heroes = Object.fromEntries(
    (Object.keys(heroRoutes) as HeroPage[]).map((key) => [
      heroRoutes[key],
      p?.[key].hero ?? emptyHero,
    ]),
  ) as LegacyPages['heroes'];
  const pages: LegacyPages = {
    ...base,
    heroImages: p?.home.heroImages ?? [],
    gallery: p?.home.gallery ?? [],
    aboutIntro: p?.about.intro ?? '',
    aboutImage: p?.about.image ?? '',
    aboutHeroImage: p?.about.heroImage ?? '',
    ministryYears: p?.about.ministryYears ?? '',
    officeHours: p?.about.officeHours ?? '',
    values: (p?.about.values ?? []).map((v) => [v.number, v.title, v.body]),
    givingImpact: (p?.give.impact ?? []).map((i) => [
      i.percent,
      i.title,
      i.body,
    ]),
    heroes,
  };
  return { site, pages };
}

const verses = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [verse = '', reference = ''] = line.split('|');
      return { text: verse.trim(), reference: reference.trim() };
    });

/** Component-side fields → the shared settings document. */
export function siteFromLegacy(site: SiteContent): SiteSettings {
  return {
    contact: {
      email: site.contactEmail,
      phone: site.contactPhone,
      address: site.contactAddress,
    },
    footerAddress: site.footerAddress,
    social: {
      facebook: site.facebookUrl,
      instagram: site.instagramUrl,
      youtube: site.youtubeUrl,
    },
    authVerses: verses(site.authVerses),
    giving: {
      accountName: site.givingAccount,
      bank: site.givingBank,
      accountNumber: site.givingNumber,
    },
  };
}

/** Component-side fields → one page document. */
export function pageFromLegacy<K extends PageKey>(
  key: K,
  site: SiteContent,
  pages: LegacyPages,
): PageContentMap[K] {
  const hero = (route: (typeof heroRoutes)[HeroPage]) => ({
    ...pages.heroes[route],
  });
  const documents: PageContentMap = {
    home: {
      hero: {
        eyebrow: site.heroEyebrow,
        title: site.heroTitle,
        accent: site.heroAccent,
        copy: site.heroCopy,
      },
      verse: { text: site.homeVerseText, reference: site.homeVerseReference },
      heroImages: [...pages.heroImages],
      gallery: [...pages.gallery],
    },
    about: {
      intro: pages.aboutIntro,
      story: site.story,
      heroImage: pages.aboutHeroImage,
      image: pages.aboutImage,
      ministryYears: pages.ministryYears,
      officeHours: pages.officeHours,
      values: pages.values.map(([number = '', title = '', body = '']) => ({
        number,
        title,
        body,
      })),
    },
    location: { hero: hero('/location') },
    'next-steps': { hero: hero('/next-steps') },
    give: {
      hero: hero('/give'),
      verse: {
        text: site.givingVerseText,
        reference: site.givingVerseReference,
      },
      impact: pages.givingImpact.map(
        ([percent = '', title = '', body = '']) => ({
          percent,
          title,
          body,
        }),
      ),
    },
    events: { hero: hero('/events') },
    sermons: { hero: hero('/sermons') },
  };
  return documents[key];
}
