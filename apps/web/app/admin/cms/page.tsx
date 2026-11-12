'use client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Contact,
  ExternalLink,
  Footprints,
  HandHeart,
  Heart,
  Images,
  Landmark,
  MapPin,
  Plus,
  Quote,
  Trash,
  Users,
} from 'lucide-react';
import {
  pageKeys,
  type PageContentMap,
  type PageKey,
  type SiteSettings,
} from '@grace-abounds/validation';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import { useToast } from '../../components/toast';
import Image from '../../components/site-image';
import { KitConfirm } from '../../components/editor-kit/confirm';
import {
  CollectionSection,
  type FieldSpec,
} from '../../components/editor-kit/collection-section';
import { SidePanel } from '../../components/editor-kit/side-panel';
import {
  KitPhoto,
  KitText,
  ListRow,
  RowList,
  SaveStatus,
  SectionCard,
  type SaveState,
} from '../../components/editor-kit/parts';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { getRoleNavigation } from '../../lib/role-navigation';
import type { ContentState, SiteContent } from '../../lib/content';
import {
  mergePatch,
  pageFromLegacy,
  resourceToLegacy,
  siteFromLegacy,
  toLegacy,
} from '../../lib/content-adapter';
import { isImageRef } from '@grace-abounds/validation';

/*
 * Website content editor, built on the shared editor kit.
 *
 * Page headings (each page's hero) are fixed and not shown here (owner
 * decision, 12 Nov 2026); the API refuses changes to them.
 *
 * Two save boundaries, matching the API:
 * - Page documents (fields and lists such as values or photos): edits go into
 *   the page draft; list panels say "Apply to page"; the page-level
 *   "Save and publish" commits each changed resource with If-Match.
 * - Collections not yet in the database (campuses, steps, leadership,
 *   resources) save in this browser until Phase 2 slice 2.
 */

const tabs = [
  'Home',
  'About',
  'Locations',
  'Next steps',
  'Giving',
  'Site details',
] as const;
type Tab = (typeof tabs)[number];
type Resource = 'site' | PageKey;
type Draft = { site: SiteContent; pages: ContentState['pages'] };
type Pages = ContentState['pages'];

const tabResources: Record<Tab, Resource[]> = {
  Home: ['home'],
  About: ['about'],
  Locations: [],
  'Next steps': [],
  Giving: ['give', 'site'],
  'Site details': ['site'],
};
const tabPath: Record<Tab, string> = {
  Home: '/',
  About: '/about',
  Locations: '/location',
  'Next steps': '/next-steps',
  Giving: '/give',
  'Site details': '/',
};
const resourceLabel: Record<Resource, string> = {
  site: 'Site details',
  home: 'Home',
  about: 'About',
  location: 'Locations',
  'next-steps': 'Next steps',
  give: 'Giving',
  events: 'Events',
  sermons: 'Sermons',
};
/** Site fields stored in a page document rather than shared settings. */
const siteFieldPage: Partial<Record<keyof SiteContent, PageKey>> = {
  homeVerseText: 'home',
  homeVerseReference: 'home',
  story: 'about',
  givingVerseText: 'give',
  givingVerseReference: 'give',
};
const pageFieldPage: Partial<Record<keyof Pages, PageKey>> = {
  heroImages: 'home',
  gallery: 'home',
  aboutIntro: 'about',
  aboutHeroImage: 'about',
  aboutImage: 'about',
  ministryYears: 'about',
  officeHours: 'about',
  values: 'about',
  givingImpact: 'give',
};

// ---------- Page-document lists (edited in the panel, applied to the draft) ----------
type DocList =
  'heroImages' | 'gallery' | 'values' | 'givingImpact' | 'authVerses';
type DocItem = string | string[];
const docLists: Record<
  DocList,
  {
    noun: string;
    resource: Resource;
    required?: boolean;
    blank: DocItem;
  }
> = {
  heroImages: {
    noun: 'slideshow photo',
    resource: 'home',
    required: true,
    blank: '',
  },
  gallery: {
    noun: 'gallery photo',
    resource: 'home',
    required: true,
    blank: '',
  },
  values: { noun: 'value', resource: 'about', blank: ['', '', ''] },
  givingImpact: { noun: 'giving area', resource: 'give', blank: ['', '', ''] },
  authVerses: { noun: 'sign-in verse', resource: 'site', blank: ['', ''] },
};
const verseLines = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [verse = '', reference = ''] = line.split('|');
      return [verse, reference];
    });
function readDocList(draft: Draft, list: DocList): DocItem[] {
  if (list === 'authVerses') return verseLines(draft.site.authVerses);
  return draft.pages[list] as DocItem[];
}
function writeDocList(draft: Draft, list: DocList, items: DocItem[]): Draft {
  if (list === 'authVerses')
    return {
      ...draft,
      site: {
        ...draft.site,
        authVerses: (items as string[][])
          .map(([verse = '', reference = '']) => `${verse}|${reference}`)
          .join('\n'),
      },
    };
  return { ...draft, pages: { ...draft.pages, [list]: items } as Pages };
}

type PanelState = {
  kind: 'doc';
  list: DocList;
  index: number | null;
  value: DocItem;
  original: DocItem;
};

const initials = (name: string) =>
  name
    .replace(/^(Pastor|Rev\.)\s+/, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
function thumb(src: unknown, fallback: string): ReactNode {
  return typeof src === 'string' && isImageRef(src) ? (
    <Image unoptimized src={src} alt="" width={88} height={88} />
  ) : (
    <span aria-hidden="true">{fallback}</span>
  );
}

// ---------- Database collections (Phase 2B): one Save per record ----------
const teamBlank = { name: '', role: '', bio: '', image: '', status: 'draft' };
const teamFields: FieldSpec[] = [
  { key: 'name', label: 'Name', kind: 'text' },
  { key: 'role', label: 'Role', kind: 'text' },
  { key: 'bio', label: 'Short bio', kind: 'long' },
  { key: 'image', label: 'Photo', kind: 'photo' },
  { key: 'status', label: 'Visibility', kind: 'status' },
];
const locationBlank = {
  name: '',
  kind: 'Campus',
  address: '',
  image: '',
  status: 'draft',
};
const locationFields: FieldSpec[] = [
  {
    key: 'name',
    label: 'Name',
    kind: 'text',
    hint: 'For example “Grace East — Botany”.',
  },
  { key: 'kind', label: 'Kind of campus', kind: 'text' },
  { key: 'address', label: 'Address', kind: 'text' },
  { key: 'image', label: 'Photo', kind: 'photo' },
  { key: 'status', label: 'Visibility', kind: 'status' },
];
const stepBlank = {
  title: '',
  subtitle: '',
  heading: '',
  body: '',
  icon: '',
  cta: { kind: 'interest', label: '', target: '' },
  path: [],
  status: 'draft',
};
const stepFields: FieldSpec[] = [
  { key: 'title', label: 'Title', kind: 'text' },
  { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  { key: 'heading', label: 'Card heading', kind: 'text' },
  { key: 'body', label: 'Description', kind: 'long' },
  { key: 'icon', label: 'Symbol', kind: 'text', hint: 'One character, e.g. ✦' },
  { key: 'cta.label', label: 'Button label', kind: 'text' },
  {
    key: 'cta.kind',
    label: 'Button goes to',
    kind: 'select',
    options: [
      ['interest', 'A next-step request (members sign in to send it)'],
      ['appointment', 'An appointment request'],
      ['calendar', 'An activity in the calendar'],
      ['link', 'A web page'],
    ],
  },
  {
    key: 'cta.target',
    label: 'Details',
    kind: 'text',
    hint: 'Request name, activity web name (e.g. foundations-class) or https:// link. Leave blank to use the title.',
  },
  { key: 'path', label: 'Journey steps', kind: 'lines' },
  { key: 'status', label: 'Visibility', kind: 'status' },
];

export default function CmsPage() {
  const { content, ready, storageError, retrySave, applyPublished } =
    useContent();
  const toast = useToast();
  const { data: session } = useSession();
  const homeHref = getRoleNavigation(session?.user?.role).workspaceHref;
  const [tab, setTab] = useState<Tab>('Home');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmed, setConfirmed] = useState<
    Partial<Record<Resource, unknown>>
  >({});
  const [versions, setVersions] = useState<Partial<Record<Resource, number>>>(
    {},
  );
  const [dirty, setDirty] = useState<Set<Resource>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);
  const [panel, setPanel] = useState<PanelState | null>(null);
  const [confirm, setConfirm] = useState<null | 'remove' | 'discard'>(null);

  /** Loads the latest published content and versions (staff only). */
  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [site, ...pages] = await Promise.all([
        api<SiteSettings>('/staff/site'),
        ...pageKeys.map((key) =>
          api<PageContentMap[PageKey]>(`/staff/pages/${key}`),
        ),
      ]);
      const bundle = {
        site: site.data,
        pages: Object.fromEntries(
          pageKeys.map((key, i) => [key, pages[i]!.data]),
        ),
      } as { site: SiteSettings; pages: PageContentMap };
      setDraft(toLegacy(bundle, content.pages));
      setConfirmed({ site: site.data, ...bundle.pages });
      setVersions({
        site: site.version,
        ...Object.fromEntries(
          pageKeys.map((key, i) => [key, pages[i]!.version]),
        ),
      });
      setDirty(new Set());
      setConflict(false);
      setSaveError('');
      setFieldErrors([]);
    } catch (failure) {
      setLoadError(errorMessage(failure));
    }
    // content.pages supplies only the browser-kept collections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (ready) void load();
  }, [ready, load]);
  useEffect(() => {
    if (dirty.size === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const markDirty = (resource: Resource) => {
    setJustSaved(false);
    setDirty((current) => new Set(current).add(resource));
  };
  const editSite = (key: keyof SiteContent) => (next: string) => {
    setDraft(
      (current) =>
        current && { ...current, site: { ...current.site, [key]: next } },
    );
    markDirty(siteFieldPage[key] ?? 'site');
  };
  const editPage = (key: keyof Pages) => (next: string) => {
    setDraft(
      (current) =>
        current && {
          ...current,
          pages: { ...current.pages, [key]: next } as Pages,
        },
    );
    const page = pageFieldPage[key];
    if (page) markDirty(page);
  };

  const pending = tabResources[tab].filter((resource) => dirty.has(resource));
  async function save() {
    if (!draft || pending.length === 0 || saving) return;
    setSaving(true);
    setSaveError('');
    setFieldErrors([]);
    const published: string[] = [];
    try {
      for (const resource of pending) {
        const body =
          resource === 'site'
            ? siteFromLegacy(draft.site)
            : pageFromLegacy(resource, draft.site, draft.pages);
        const result = await api<SiteSettings | PageContentMap[PageKey]>(
          resource === 'site' ? '/staff/site' : `/staff/pages/${resource}`,
          {
            method: 'PATCH',
            version: versions[resource],
            body: JSON.stringify(body),
          },
        );
        // Only this confirmed resource becomes published, using the server's
        // canonical data. Other drafts stay unsaved.
        const patch = resourceToLegacy(resource, result.data);
        applyPublished(patch);
        setDraft((current) => current && mergePatch(current, patch));
        setConfirmed((current) => ({ ...current, [resource]: result.data }));
        setVersions((current) => ({ ...current, [resource]: result.version }));
        setDirty((current) => {
          const next = new Set(current);
          next.delete(resource);
          return next;
        });
        published.push(resourceLabel[resource]);
      }
      setJustSaved(true);
      toast.push(`${published.join(' and ')} published.`, 'success');
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
        setConflict(true);
        setSaveError(
          'Someone else published changes to this page since you opened it. Your edits are still here; load the latest version before publishing again.',
        );
      } else {
        if (failure instanceof ApiError && failure.fieldErrors)
          setFieldErrors(
            Object.entries(failure.fieldErrors).map(
              ([field, message]) => `${field}: ${message}`,
            ),
          );
        setSaveError(
          `${published.length ? `${published.join(' and ')} published, but the rest was not. ` : ''}${errorMessage(failure)}`,
        );
      }
    } finally {
      setSaving(false);
    }
  }
  /** Puts this tab's changed resources back to their last published version. */
  function discardPage() {
    setDraft((current) => {
      if (!current) return current;
      return pending.reduce(
        (next, resource) =>
          confirmed[resource] === undefined
            ? next
            : mergePatch(
                next,
                resourceToLegacy(resource, confirmed[resource] as SiteSettings),
              ),
        current,
      );
    });
    setDirty((current) => {
      const next = new Set(current);
      pending.forEach((resource) => next.delete(resource));
      return next;
    });
    setSaveError('');
    setFieldErrors([]);
  }

  // ---------- Panels ----------
  const panelDirty =
    !!panel && JSON.stringify(panel.value) !== JSON.stringify(panel.original);
  const openDoc = (list: DocList, index: number | null) => {
    if (!draft) return;
    const items = readDocList(draft, list);
    const value = index === null ? docLists[list].blank : items[index]!;
    setPanel({ kind: 'doc', list, index, value, original: value });
  };
  const moveDoc = (list: DocList, index: number, delta: number) => {
    if (!draft) return;
    const items = [...readDocList(draft, list)];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target]!, items[index]!];
    setDraft(writeDocList(draft, list, items));
    markDirty(docLists[list].resource);
  };
  async function applyPanel() {
    if (!panel || !draft) return;
    if (panel.kind === 'doc') {
      const items = [...readDocList(draft, panel.list)];
      if (panel.index === null) items.push(panel.value);
      else items[panel.index] = panel.value;
      setDraft(writeDocList(draft, panel.list, items));
      markDirty(docLists[panel.list].resource);
      setPanel(null);
    }
  }
  async function removeFromPanel() {
    if (!panel || panel.index === null || !draft) return;
    if (panel.kind === 'doc') {
      const items = readDocList(draft, panel.list).filter(
        (_, i) => i !== panel.index,
      );
      setDraft(writeDocList(draft, panel.list, items));
      markDirty(docLists[panel.list].resource);
      setPanel(null);
    }
    setConfirm(null);
  }
  const canRemove =
    !!panel &&
    panel.index !== null &&
    !(
      panel.kind === 'doc' &&
      docLists[panel.list].required &&
      draft &&
      readDocList(draft, panel.list).length <= 1
    );

  // ---------- Rendering helpers ----------
  const view = draft ?? { site: content.site, pages: content.pages };
  const saveState: SaveState = saving
    ? 'saving'
    : pending.length
      ? 'dirty'
      : saveError
        ? 'failed'
        : justSaved
          ? 'saved'
          : 'clean';
  const disabled = !draft || saving;

  function docSection(
    list: DocList,
    icon: typeof Images,
    title: string,
    description: string,
  ) {
    const items = draft ? readDocList(draft, list) : [];
    const { noun } = docLists[list];
    const photo = list === 'heroImages' || list === 'gallery';
    return (
      <SectionCard
        icon={icon}
        title={title}
        description={description}
        action={
          <button
            type="button"
            className="kit-add"
            disabled={disabled}
            onClick={() => openDoc(list, null)}
          >
            <Plus aria-hidden="true" size={16} />
            Add {noun}
          </button>
        }
      >
        <RowList empty={`No ${noun}s yet.`}>
          {items.map((item, index) => {
            const parts = Array.isArray(item) ? item : [item];
            const name = photo
              ? `${list === 'heroImages' ? 'Slideshow' : 'Gallery'} photo ${index + 1}`
              : list === 'authVerses'
                ? parts[1] || `Verse ${index + 1}`
                : parts[1] || `${noun} ${index + 1}`;
            return (
              <ListRow
                key={`${list}-${index}`}
                media={
                  photo ? (
                    thumb(item, '')
                  ) : list === 'authVerses' ? (
                    <Quote aria-hidden="true" size={18} />
                  ) : (
                    parts[0]
                  )
                }
                title={name}
                detail={
                  photo
                    ? String(item)
                    : list === 'authVerses'
                      ? parts[0]
                      : parts[2]
                }
                editLabel={`Edit ${name}`}
                onEdit={() => openDoc(list, index)}
                onMoveUp={
                  index > 0 && !disabled
                    ? () => moveDoc(list, index, -1)
                    : undefined
                }
                onMoveDown={
                  index < items.length - 1 && !disabled
                    ? () => moveDoc(list, index, 1)
                    : undefined
                }
              />
            );
          })}
        </RowList>
      </SectionCard>
    );
  }
  function panelFields() {
    if (!panel) return null;
    const set = (value: DocItem) =>
      setPanel((current) => current && ({ ...current, value } as PanelState));
    if (panel.kind === 'doc') {
      if (typeof panel.value === 'string')
        return (
          <KitPhoto
            label="Photo link"
            value={panel.value}
            onChange={(next) => set(next)}
          />
        );
      const tuple = panel.value;
      const labels =
        panel.list === 'values'
          ? ['Number', 'Value', 'Description']
          : panel.list === 'givingImpact'
            ? ['Percentage', 'Area', 'Description']
            : ['Verse', 'Reference'];
      return labels.map((label, position) => (
        <KitText
          key={label}
          label={label}
          multiline={label === 'Description' || label === 'Verse'}
          rows={3}
          value={tuple[position] ?? ''}
          onChange={(next) =>
            set(tuple.map((part, i) => (i === position ? next : part)))
          }
        />
      ));
    }
    return null;
  }
  const panelNoun = panel ? docLists[panel.list].noun : '';
  const panelTitle = panel
    ? `${panel.index === null ? 'Add' : 'Edit'} ${panelNoun}`
    : '';

  return (
    <AdminShell>
      <div className="kit-page">
        <Link className="kit-back" href={homeHref}>
          <ArrowLeft aria-hidden="true" size={16} />
          Home
        </Link>
        <header className="kit-page-head">
          <h1>Website content</h1>
          <SaveStatus state={saveState} />
        </header>
        {loadError && (
          <div className="publishing-errors" role="alert">
            <p>Website content couldn’t be loaded. {loadError}</p>
            <button
              className="button button-outline"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {storageError && (
          <div className="publishing-errors" role="alert">
            <p>{storageError}</p>
            <button className="button button-outline" onClick={retrySave}>
              Retry save
            </button>
          </div>
        )}
        <div className="kit-tabs" role="tablist" aria-label="Public pages">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() => setTab(item)}
            >
              {item}
              {tabResources[item].some((resource) => dirty.has(resource)) &&
                ' •'}
            </button>
          ))}
          <Link className="kit-tabs-end" href={tabPath[tab]}>
            View page
            <ExternalLink aria-hidden="true" size={14} />
          </Link>
        </div>

        <div role="tabpanel" aria-label={tab} className="kit-page">
          {tab === 'Home' && (
            <>
              <SectionCard
                icon={BookOpen}
                title="Featured verse"
                description="Shown on the home page."
              >
                <KitText
                  label="Verse text"
                  multiline
                  rows={3}
                  value={view.site.homeVerseText}
                  onChange={editSite('homeVerseText')}
                />
                <KitText
                  label="Reference"
                  value={view.site.homeVerseReference}
                  onChange={editSite('homeVerseReference')}
                />
              </SectionCard>
              {docSection(
                'heroImages',
                Images,
                'Slideshow photos',
                'The photos behind the home page heading, in order.',
              )}
              {docSection(
                'gallery',
                Images,
                'Community gallery',
                'The photo strip further down the home page.',
              )}
            </>
          )}
          {tab === 'About' && (
            <>
              <SectionCard
                icon={BookOpen}
                title="Our story"
                description="The welcome paragraph and the longer history."
              >
                <KitText
                  label="Intro paragraph"
                  multiline
                  rows={3}
                  value={view.pages.aboutIntro}
                  onChange={editPage('aboutIntro')}
                />
                <KitText
                  label="History"
                  multiline
                  rows={6}
                  value={view.site.story}
                  onChange={editSite('story')}
                />
              </SectionCard>
              <SectionCard icon={Images} title="Photos">
                <KitPhoto
                  label="Banner photo"
                  value={view.pages.aboutHeroImage}
                  onChange={editPage('aboutHeroImage')}
                />
                <KitPhoto
                  label="Story photo"
                  value={view.pages.aboutImage}
                  onChange={editPage('aboutImage')}
                />
              </SectionCard>
              {docSection(
                'values',
                Heart,
                'Our values',
                'Shown as numbered cards.',
              )}
              <SectionCard icon={Contact} title="Quick facts">
                <div className="kit-grid">
                  <KitText
                    label="Office hours"
                    value={view.pages.officeHours}
                    onChange={editPage('officeHours')}
                  />
                  <KitText
                    label="Years of ministry"
                    value={view.pages.ministryYears}
                    onChange={editPage('ministryYears')}
                  />
                </div>
              </SectionCard>
              <CollectionSection
                collection="team"
                noun="person"
                icon={Users}
                title="Leadership team"
                description="People shown on the About page. Each person saves on their own."
                blank={teamBlank}
                fields={teamFields}
                summary={(row) => ({
                  title: String(row.name),
                  detail: String(row.role ?? ''),
                  media: thumb(row.image, initials(String(row.name)) || '•'),
                })}
              />
            </>
          )}
          {tab === 'Locations' && (
            <>
              <CollectionSection
                collection="locations"
                noun="campus"
                icon={MapPin}
                title="Campuses"
                description="Campus details. Service times come from Activities."
                blank={locationBlank}
                fields={locationFields}
                summary={(row) => ({
                  title: String(row.name),
                  detail: String(row.address ?? ''),
                  media: thumb(row.image, initials(String(row.name)) || '•'),
                })}
              />
              <p className="kit-empty">
                <Link href="/admin/events">
                  Manage services, groups and events
                </Link>
              </p>
            </>
          )}
          {tab === 'Next steps' && (
            <CollectionSection
              collection="next-steps"
              noun="step"
              icon={Footprints}
              title="Next steps"
              description="Journeys on the Next steps page. Each saves on its own."
              blank={stepBlank}
              fields={stepFields}
              summary={(row) => ({
                title: String(row.title),
                detail: String(row.subtitle ?? ''),
                media: (
                  <span aria-hidden="true">{String(row.icon || '•')}</span>
                ),
              })}
            />
          )}
          {tab === 'Giving' && (
            <>
              <SectionCard icon={BookOpen} title="Giving verse">
                <KitText
                  label="Verse text"
                  multiline
                  rows={3}
                  value={view.site.givingVerseText}
                  onChange={editSite('givingVerseText')}
                />
                <KitText
                  label="Reference"
                  value={view.site.givingVerseReference}
                  onChange={editSite('givingVerseReference')}
                />
              </SectionCard>
              {docSection(
                'givingImpact',
                HandHeart,
                'Where giving goes',
                'Areas and percentages shown on the Giving page.',
              )}
              <SectionCard
                icon={Landmark}
                title="Bank details"
                description="Shared with the rest of the site."
              >
                <div className="kit-grid">
                  <KitText
                    label="Account name"
                    value={view.site.givingAccount}
                    onChange={editSite('givingAccount')}
                  />
                  <KitText
                    label="Bank"
                    value={view.site.givingBank}
                    onChange={editSite('givingBank')}
                  />
                  <KitText
                    label="Account number"
                    value={view.site.givingNumber}
                    onChange={editSite('givingNumber')}
                  />
                </div>
              </SectionCard>
            </>
          )}
          {tab === 'Site details' && (
            <>
              <SectionCard
                icon={Contact}
                title="Contact details"
                description="Used in the footer and contact links."
              >
                <div className="kit-grid">
                  <KitText
                    label="Email"
                    value={view.site.contactEmail}
                    onChange={editSite('contactEmail')}
                  />
                  <KitText
                    label="Phone"
                    value={view.site.contactPhone}
                    onChange={editSite('contactPhone')}
                  />
                </div>
                <KitText
                  label="Address"
                  value={view.site.contactAddress}
                  onChange={editSite('contactAddress')}
                />
                <KitText
                  label="Footer address"
                  value={view.site.footerAddress}
                  onChange={editSite('footerAddress')}
                />
              </SectionCard>
              <SectionCard
                icon={ExternalLink}
                title="Social links"
                description="Full https:// addresses, or leave blank."
              >
                <KitText
                  label="Facebook"
                  value={view.site.facebookUrl}
                  onChange={editSite('facebookUrl')}
                />
                <KitText
                  label="Instagram"
                  value={view.site.instagramUrl}
                  onChange={editSite('instagramUrl')}
                />
                <KitText
                  label="YouTube"
                  value={view.site.youtubeUrl}
                  onChange={editSite('youtubeUrl')}
                />
              </SectionCard>
              {docSection(
                'authVerses',
                Quote,
                'Sign-in verses',
                'One is shown on the sign-in page.',
              )}
              <p className="kit-note">
                Member resources now live in the{' '}
                <Link href="/members/gallery">Gallery</Link>, where staff add
                and edit them.
              </p>
            </>
          )}
        </div>

        {saveError && (
          <div className="publishing-errors" role="alert">
            <p>{saveError}</p>
            {fieldErrors.length > 0 && (
              <ul>
                {fieldErrors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {conflict && (
              <button
                className="button button-outline"
                onClick={() => void load()}
              >
                Load latest (discards your unsaved edits)
              </button>
            )}
          </div>
        )}

        {pending.length > 0 && (
          <div className="kit-savebar">
            <span>Unsaved changes on this page</span>
            <button
              type="button"
              className="button button-outline"
              disabled={saving}
              onClick={() => setConfirm('discard')}
            >
              Discard
            </button>
            <button
              type="button"
              className="button"
              disabled={saving || conflict}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save and publish'}
            </button>
          </div>
        )}
      </div>

      <SidePanel
        open={!!panel}
        title={panelTitle}
        eyebrow={tab}
        dirty={panelDirty}
        onClose={() => setPanel(null)}
        footer={(requestClose) => (
          <>
            {panel?.index !== null && (
              <button
                type="button"
                className="kit-remove"
                disabled={!canRemove}
                title={canRemove ? undefined : 'At least one is required.'}
                onClick={() => setConfirm('remove')}
              >
                <Trash aria-hidden="true" size={16} />
                Remove
              </button>
            )}
            <span className="kit-spacer" />
            <button
              type="button"
              className="button button-outline"
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void applyPanel()}
            >
              Apply to page
            </button>
          </>
        )}
      >
        <p className="kit-note">
          Applies to this page’s draft. Select “Save and publish” to put it
          live.
        </p>
        {panelFields()}
      </SidePanel>

      <KitConfirm
        open={confirm === 'remove'}
        title={`Remove this ${panelNoun}?`}
        confirmLabel="Remove"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void removeFromPanel()}
      >
        <p>
          It comes off the page draft. Nothing changes on the website until you
          save and publish.
        </p>
      </KitConfirm>
      <KitConfirm
        open={confirm === 'discard'}
        title="Discard unsaved changes on this page?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          discardPage();
          setConfirm(null);
        }}
      >
        <p>This page goes back to what is live on the website.</p>
      </KitConfirm>
    </AdminShell>
  );
}
