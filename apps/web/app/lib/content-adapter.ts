import {
  pageKeys,
  type PageContentMap,
  type PageKey,
  type PublicCollections,
  type PublicContentBundle,
  type PublicNextStep,
  type SiteSettings,
} from '@grace-abounds/validation';
import type { ContentState, SiteContent, TeamMember } from './content';

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

/**
 * The component-side fields one published resource controls. Heroes are kept
 * separate so a single page's introduction merges into `pages.heroes`.
 */
export type PublishedPatch = {
  site: Partial<SiteContent>;
  pages: Partial<Omit<LegacyPages, 'heroes'>>;
  heroes: Partial<LegacyPages['heroes']>;
};
export type ContentResource = 'site' | PageKey;

/** Shared settings → their component-side fields. */
function siteToLegacy(s: SiteSettings): PublishedPatch {
  return {
    site: {
      contactEmail: s.contact.email,
      contactPhone: s.contact.phone,
      contactAddress: s.contact.address,
      footerAddress: s.footerAddress,
      facebookUrl: s.social.facebook,
      instagramUrl: s.social.instagram,
      youtubeUrl: s.social.youtube,
      authVerses: s.authVerses
        .map((v) => `${v.text}|${v.reference}`)
        .join('\n'),
      givingAccount: s.giving.accountName,
      givingBank: s.giving.bank,
      givingNumber: s.giving.accountNumber,
    },
    pages: {},
    heroes: {},
  };
}

/** One page document → its component-side fields. */
function pageToLegacy<K extends PageKey>(
  key: K,
  data: PageContentMap[K],
): PublishedPatch {
  const patch: PublishedPatch = { site: {}, pages: {}, heroes: {} };
  if (key in heroRoutes)
    patch.heroes[heroRoutes[key as HeroPage]] = (data as { hero: Hero }).hero;
  if (key === 'home') {
    const home = data as PageContentMap['home'];
    patch.site = {
      heroEyebrow: home.hero.eyebrow,
      heroTitle: home.hero.title,
      heroAccent: home.hero.accent,
      heroCopy: home.hero.copy,
      homeVerseText: home.verse.text,
      homeVerseReference: home.verse.reference,
    };
    patch.pages = { heroImages: home.heroImages, gallery: home.gallery };
  } else if (key === 'about') {
    const about = data as PageContentMap['about'];
    patch.site = { story: about.story };
    patch.pages = {
      aboutIntro: about.intro,
      aboutImage: about.image,
      aboutHeroImage: about.heroImage,
      ministryYears: about.ministryYears,
      officeHours: about.officeHours,
      values: about.values.map((v) => [v.number, v.title, v.body]),
    };
  } else if (key === 'give') {
    const give = data as PageContentMap['give'];
    patch.site = {
      givingVerseText: give.verse.text,
      givingVerseReference: give.verse.reference,
    };
    patch.pages = {
      givingImpact: give.impact.map((i) => [i.percent, i.title, i.body]),
    };
  }
  return patch;
}

/** A server-confirmed resource (`{ data }` of a save or load) → its fields. */
export function resourceToLegacy(
  resource: ContentResource,
  data: SiteSettings | PageContentMap[PageKey],
): PublishedPatch {
  return resource === 'site'
    ? siteToLegacy(data as SiteSettings)
    : pageToLegacy(resource, data as PageContentMap[PageKey]);
}

/** Applies a patch to component-side content without touching other fields. */
export function mergePatch<T extends { site: SiteContent; pages: LegacyPages }>(
  target: T,
  patch: PublishedPatch,
): T {
  return {
    ...target,
    site: { ...target.site, ...patch.site },
    pages: {
      ...target.pages,
      ...patch.pages,
      heroes: { ...target.pages.heroes, ...patch.heroes },
    } as LegacyPages,
  };
}

const blankSite: SiteContent = {
  heroEyebrow: '',
  heroTitle: '',
  heroAccent: '',
  heroCopy: '',
  story: '',
  contactEmail: '',
  contactPhone: '',
  contactAddress: '',
  footerAddress: '',
  facebookUrl: '',
  instagramUrl: '',
  youtubeUrl: '',
  homeVerseText: '',
  homeVerseReference: '',
  givingVerseText: '',
  givingVerseReference: '',
  authVerses: '',
  givingAccount: '',
  givingBank: '',
  givingNumber: '',
};

/** Published bundle → the component-side site and pages fields (blank if none). */
/** Where a Next steps call to action goes (Phase 2B destinations). */
export function nextStepHref(step: Pick<PublicNextStep, 'title' | 'cta'>) {
  const { kind, target } = step.cta;
  if (kind === 'appointment') return '/members?panel=appointment';
  if (kind === 'calendar')
    return target
      ? `/events/${encodeURIComponent(target)}`
      : '/members/calendar';
  if (kind === 'link') return target || '/next-steps';
  return `/members?join=${encodeURIComponent(target || step.title)}`;
}

/** Published database collections → the shapes existing components read. */
export function collectionsToLegacy(
  collections: PublicCollections | undefined,
) {
  return {
    locations: (collections?.locations ?? []).map((item) => ({
      id: item.key,
      name: item.name,
      address: item.address,
      type: item.kind,
      image: item.image,
    })),
    steps: (collections?.steps ?? []).map((item) => ({
      icon: item.icon,
      title: item.title,
      subtitle: item.subtitle,
      heading: item.heading,
      body: item.body,
      cta: item.cta.label,
      memberHref: nextStepHref(item),
      path: item.path,
    })),
    team: (collections?.team ?? []).map((item): TeamMember => ({
      id: item.id,
      name: item.name,
      role: item.role,
      bio: item.bio,
      image: item.image,
      status: 'published',
    })),
  };
}

export function toLegacy(
  bundle: PublicContentBundle | null,
  base: LegacyPages,
): { site: SiteContent; pages: LegacyPages; team: TeamMember[] } {
  let result = {
    site: { ...blankSite },
    pages: {
      ...base,
      heroImages: [],
      gallery: [],
      aboutIntro: '',
      aboutImage: '',
      aboutHeroImage: '',
      ministryYears: '',
      officeHours: '',
      values: [],
      givingImpact: [],
      heroes: Object.fromEntries(
        Object.values(heroRoutes).map((route) => [route, emptyHero]),
      ) as LegacyPages['heroes'],
    } as LegacyPages,
  };
  const { locations, steps, team } = collectionsToLegacy(bundle?.collections);
  result.pages = {
    ...result.pages,
    locations,
    steps,
    resources: [],
  } as LegacyPages;
  if (!bundle) return { ...result, team };
  result = mergePatch(result, siteToLegacy(bundle.site));
  for (const key of pageKeys)
    result = mergePatch(result, pageToLegacy(key, bundle.pages[key]));
  return { ...result, team };
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
