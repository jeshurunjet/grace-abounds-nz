'use client';
import Image from '../../components/site-image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  isImageRef,
  pageKeys,
  type PageContentMap,
  type PageKey,
  type SiteSettings,
} from '@grace-abounds/validation';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import { useToast } from '../../components/toast';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import type { ContentState, SiteContent } from '../../lib/content';
import {
  mergePatch,
  pageFromLegacy,
  resourceToLegacy,
  siteFromLegacy,
  toLegacy,
} from '../../lib/content-adapter';
import { validatePublicContent } from '../../lib/content-validation';

const labels: Record<string, string> = {
  '/location': 'Locations',
  '/next-steps': 'Next steps',
  '/give': 'Giving',
  '/events': 'Events',
  '/sermons': 'Sermons',
  heroImages: 'Hero slideshow images',
  gallery: 'Community parallax gallery',
  heroes: 'Page headings and introductions',
  givingImpact: 'Giving impact',
  memberHref: 'Member action URL',
  path: 'Journey steps',
  adminHref: 'Management URL',
};
function label(key: string) {
  return (
    labels[key] ??
    key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
  );
}
// Records stored as fixed-position tuples. Each position is a named field:
// whole records can be added, removed and reordered, but never their fields.
const tupleFields: Record<string, string[]> = {
  values: ['Number', 'Value', 'Description'],
  givingImpact: ['Percentage', 'Area', 'Description'],
};
// Collections the public site cannot render without at least one entry.
const requiredCollections = new Set([
  'heroImages',
  'gallery',
  'locations',
  'steps',
]);
const hints: Record<string, string> = {
  steps:
    'Public Next steps journeys. Members can also request these from the member area.',
  locations: 'Campus details. Service times come from Activities & calendar.',
};
// A new record starts blank and unpublished rather than copying another record.
function blankFrom(template: unknown): unknown {
  if (typeof template === 'string') return '';
  if (typeof template === 'number') return 0;
  if (Array.isArray(template)) return [];
  if (template && typeof template === 'object')
    return Object.fromEntries(
      Object.entries(template).map(([key, entry]) => [
        key,
        key === 'id'
          ? crypto.randomUUID()
          : key === 'status'
            ? 'draft'
            : blankFrom(entry),
      ]),
    );
  return '';
}
function TextField({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const multiline =
    value.length > 100 ||
    /story|copy|body|bio|summary|verses|opportunities|description/i.test(name);
  // Photo fields preview the image and say so when it can't be loaded.
  const [failed, setFailed] = useState('');
  const preview = /image|gallery/i.test(name) && isImageRef(value);
  return (
    <label>
      {label(name)}
      {preview && failed !== value && (
        <Image
          className="cms-image-preview"
          unoptimized
          src={value}
          alt="Content image preview"
          width={320}
          height={180}
          onError={() => setFailed(value)}
        />
      )}
      {preview && failed === value && (
        <span className="form-note" role="alert">
          This photo couldn’t be loaded. Check the link — some websites don’t
          allow their photos to be shown on other sites.
        </span>
      )}
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}
// The editor uses the same typed content tree as the public pages.
function Fields({
  value,
  onChange,
  name,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  name: string;
}) {
  if (
    typeof value === 'string' &&
    (name === 'memberOpportunities' || name === 'authVerses')
  ) {
    const keys =
      name === 'memberOpportunities'
        ? ['name', 'description', 'href']
        : ['verse', 'reference'];
    const items = value
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        Object.fromEntries(
          keys.map((key, index) => [key, line.split('|')[index] ?? '']),
        ),
      );
    return (
      <>
        {hints[name] && <p className="form-note">{hints[name]}</p>}
        <Fields
          name={
            name === 'memberOpportunities'
              ? 'Member opportunities'
              : 'Login verses'
          }
          value={items}
          onChange={(next) =>
            onChange(
              (next as Record<string, string>[])
                .map((item) => keys.map((key) => item[key] ?? '').join('|'))
                .join('\n'),
            )
          }
        />
      </>
    );
  }
  if (typeof value === 'number')
    return (
      <label>
        {label(name)}
        <input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
    );
  if (typeof value === 'string') {
    if (name === 'status')
      return (
        <label>
          Visibility
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="draft">Keep as draft</option>
            <option value="published">Include on public website</option>
            <option value="archived">Archive</option>
          </select>
        </label>
      );
    return <TextField name={name} value={value} onChange={onChange} />;
  }
  if (Array.isArray(value)) {
    const shape = tupleFields[name];
    const canRemove = !requiredCollections.has(name) || value.length > 1;
    return (
      <fieldset className="cms-collection">
        <legend>{label(name)}</legend>
        {hints[name] && <p className="form-note">{hints[name]}</p>}
        {!value.length && (
          <p className="form-note">
            No items yet. Add one, or leave this section empty.
          </p>
        )}
        {value.map((item, index) => (
          <details key={index}>
            <summary>
              {(shape
                ? (item as string[])[
                    ['Number', 'Percentage'].includes(shape[0]!) ? 1 : 0
                  ]
                : typeof item === 'object'
                  ? (item.title ?? item.name)
                  : typeof item === 'string' && item.length < 60
                    ? item
                    : '') || `${label(name)} ${index + 1}`}
            </summary>
            {shape ? (
              shape.map((field, position) => (
                <div key={field} className="cms-field">
                  <TextField
                    name={field}
                    value={String((item as string[])[position] ?? '')}
                    onChange={(next) =>
                      onChange(
                        value.map((entry, i) =>
                          i === index
                            ? shape.map((_, p) =>
                                p === position
                                  ? next
                                  : String((entry as string[])[p] ?? ''),
                              )
                            : entry,
                        ),
                      )
                    }
                  />
                </div>
              ))
            ) : (
              <Fields
                value={item}
                name={typeof item === 'string' ? name : `Item ${index + 1}`}
                onChange={(next) =>
                  onChange(
                    value.map((entry, i) => (i === index ? next : entry)),
                  )
                }
              />
            )}
            <div className="form-actions">
              {[-1, 1].map((direction) => (
                <button
                  type="button"
                  className="button button-outline"
                  disabled={
                    index + direction < 0 || index + direction >= value.length
                  }
                  key={direction}
                  onClick={() => {
                    const next = [...value];
                    [next[index], next[index + direction]] = [
                      next[index + direction],
                      next[index],
                    ];
                    onChange(next);
                  }}
                >
                  {direction === -1 ? 'Move up' : 'Move down'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-danger"
              disabled={!canRemove}
              title={canRemove ? undefined : 'At least one item is required.'}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Remove item
            </button>
          </details>
        ))}
        <button
          type="button"
          className="button button-outline"
          onClick={() =>
            onChange([
              ...value,
              shape
                ? shape.map(() => '')
                : !value.length && name === 'resources'
                  ? {
                      id: crypto.randomUUID(),
                      title: 'New resource',
                      type: 'PDF',
                      url: '',
                      description: '',
                    }
                  : !value.length && name === 'team'
                    ? {
                        id: crypto.randomUUID(),
                        name: '',
                        role: '',
                        bio: '',
                        image: '',
                        status: 'draft',
                      }
                    : value.length
                      ? blankFrom(value[value.length - 1])
                      : '',
            ])
          }
        >
          Add item
        </button>
      </fieldset>
    );
  }
  if (value && typeof value === 'object')
    return (
      <>
        {Object.entries(value)
          .filter(([key]) => !['id', 'adminHref'].includes(key))
          .map(([key, entry]) => (
            <div key={key} className="cms-field">
              <Fields
                name={key}
                value={entry}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
            </div>
          ))}
      </>
    );
  return null;
}
const tabs = [
  'Home',
  'About',
  'Locations',
  'Next steps',
  'Giving',
  'Events',
  'Sermons',
  'Shared',
] as const;
type Tab = (typeof tabs)[number];
type Resource = 'site' | PageKey;
type Draft = { site: SiteContent; pages: ContentState['pages'] };
type Versions = Partial<Record<Resource, number>>;

/** Which saved resource each tab publishes. */
const tabResources: Record<Tab, Resource[]> = {
  Home: ['home'],
  About: ['about'],
  Locations: ['location'],
  'Next steps': ['next-steps'],
  Giving: ['give', 'site'],
  Events: ['events'],
  Sermons: ['sermons'],
  Shared: ['site'],
};
/** Site fields that belong to a page document rather than shared settings. */
const siteFieldPage: Partial<Record<keyof SiteContent, PageKey>> = {
  heroEyebrow: 'home',
  heroTitle: 'home',
  heroAccent: 'home',
  heroCopy: 'home',
  homeVerseText: 'home',
  homeVerseReference: 'home',
  story: 'about',
  givingVerseText: 'give',
  givingVerseReference: 'give',
};
const pageFieldPage: Partial<Record<keyof ContentState['pages'], PageKey>> = {
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
const heroPage: Record<string, PageKey> = {
  '/location': 'location',
  '/next-steps': 'next-steps',
  '/give': 'give',
  '/events': 'events',
  '/sermons': 'sermons',
};
/** Collections still kept in this browser until Phase 2 slice 2. */
const localPageFields = ['locations', 'steps', 'resources'] as const;
const LOCAL_NOTE =
  'Saved in this browser only until this list moves to the database in the next update.';
const resourceLabel = (resource: Resource) =>
  resource === 'site'
    ? 'Shared settings'
    : (labels[`/${resource}`] ?? resource);

export default function CmsPage() {
  const { content, update, ready, storageError, retrySave, applyPublished } =
    useContent();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('Home');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [versions, setVersions] = useState<Versions>({});
  const [dirty, setDirty] = useState<Set<Resource>>(new Set());
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [conflict, setConflict] = useState(false);

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
      const legacy = toLegacy(bundle, content.pages);
      setDraft(legacy);
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

  const markDirty = (resource: Resource) =>
    setDirty((current) => new Set(current).add(resource));
  const editSite = (key: keyof SiteContent, next: unknown) => {
    setDraft(
      (current) =>
        current && { ...current, site: { ...current.site, [key]: next } },
    );
    markDirty(siteFieldPage[key] ?? 'site');
  };
  const editPage = (key: keyof ContentState['pages'], next: unknown) => {
    setDraft(
      (current) =>
        current && {
          ...current,
          pages: { ...current.pages, [key]: next } as Draft['pages'],
        },
    );
    const page = pageFieldPage[key];
    if (page) markDirty(page);
  };
  const editHero = (route: string, next: unknown) => {
    setDraft(
      (current) =>
        current && {
          ...current,
          pages: {
            ...current.pages,
            heroes: { ...current.pages.heroes, [route]: next },
          } as Draft['pages'],
        },
    );
    markDirty(heroPage[route]!);
  };

  const pending = tabResources[tab].filter((resource) => dirty.has(resource));
  async function save() {
    if (!draft || pending.length === 0) return;
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
        // canonical (trimmed, validated) data. Other drafts stay unsaved.
        const patch = resourceToLegacy(resource, result.data);
        applyPublished(patch);
        setDraft((current) => current && mergePatch(current, patch));
        setVersions((current) => ({ ...current, [resource]: result.version }));
        setDirty((current) => {
          const next = new Set(current);
          next.delete(resource);
          return next;
        });
        published.push(resourceLabel(resource));
      }
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

  const view = draft ?? { site: content.site, pages: content.pages };
  const warnings = validatePublicContent({ ...content, ...view });
  const status = saving
    ? 'Saving…'
    : pending.length
      ? 'Unsaved changes'
      : draft
        ? 'Published'
        : 'Loading…';
  const siteKeys: Record<Tab, (keyof ContentState['site'])[]> = {
    Home: [
      'heroEyebrow',
      'heroTitle',
      'heroAccent',
      'heroCopy',
      'homeVerseText',
      'homeVerseReference',
    ],
    About: ['story'],
    Locations: [],
    'Next steps': [],
    Giving: [
      'givingVerseText',
      'givingVerseReference',
      'givingAccount',
      'givingBank',
      'givingNumber',
    ],
    Events: [],
    Sermons: [],
    Shared: [
      'contactEmail',
      'contactPhone',
      'contactAddress',
      'footerAddress',
      'facebookUrl',
      'instagramUrl',
      'youtubeUrl',
      'authVerses',
    ],
  };
  const pageKeysByTab: Record<Tab, (keyof ContentState['pages'])[]> = {
    Home: ['heroImages', 'gallery'],
    About: [
      'aboutIntro',
      'aboutHeroImage',
      'aboutImage',
      'ministryYears',
      'values',
      'officeHours',
    ],
    Locations: ['locations'],
    'Next steps': ['steps'],
    Giving: ['givingImpact'],
    Events: [],
    Sermons: [],
    Shared: ['resources'],
  };
  const heroKey = (
    {
      Locations: '/location',
      'Next steps': '/next-steps',
      Giving: '/give',
      Events: '/events',
      Sermons: '/sermons',
    } as const
  )[tab as 'Locations' | 'Next steps' | 'Giving' | 'Events' | 'Sermons'];
  const isLocal = (key: keyof ContentState['pages']) =>
    (localPageFields as readonly string[]).includes(key);
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Public website</p>
        <h1>Website content</h1>
        <p>
          Manage all seven public pages. Changes go live on the website when you
          select Save. <Link href="/">View the live site</Link>
        </p>
      </header>
      {loadError && (
        <div className="publishing-errors" role="alert">
          <p>Website content couldn’t be loaded. {loadError}</p>
          <button className="button button-outline" onClick={() => void load()}>
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
      {warnings.length > 0 && (
        <div className="publishing-errors" role="status">
          <strong>Check these before visitors see them</strong>
          <ul>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="cms-workbench">
        <aside className="cms-page-list" aria-label="Public pages">
          <p className="eyebrow">Public pages</p>
          {tabs.map((item) => (
            <button
              key={item}
              onClick={() => setTab(item)}
              aria-pressed={tab === item}
              className={tab === item ? 'active' : ''}
            >
              {item}
              {tabResources[item].some((resource) => dirty.has(resource)) &&
                ' •'}
            </button>
          ))}
          <p className="form-note">
            Saving publishes immediately. Member activity stays private.
          </p>
        </aside>
        <section className="panel cms-form">
          <h2>{tab}</h2>
          <fieldset disabled={!draft || saving} className="cms-fields">
            {siteKeys[tab].map((key) => (
              <Fields
                key={key}
                name={key}
                value={view.site[key]}
                onChange={(next) => editSite(key, next)}
              />
            ))}
            {heroKey && (
              <Fields
                name="Page introduction"
                value={view.pages.heroes[heroKey]}
                onChange={(next) => editHero(heroKey, next)}
              />
            )}
            {pageKeysByTab[tab]
              .filter((key) => !isLocal(key))
              .map((key) => (
                <Fields
                  key={key}
                  name={key}
                  value={view.pages[key]}
                  onChange={(next) => editPage(key, next)}
                />
              ))}
          </fieldset>
          <div className="form-actions">
            <button
              className="button"
              disabled={!draft || saving || pending.length === 0 || conflict}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save and publish'}
            </button>
            <span className="form-note" role="status" aria-live="polite">
              {status}
            </span>
            {conflict && (
              <button
                className="button button-outline"
                onClick={() => void load()}
              >
                Load latest (discards your unsaved edits)
              </button>
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
            </div>
          )}
          {/* Collections not yet in the database: unchanged behaviour. */}
          <fieldset disabled={!ready} className="cms-fields">
            {pageKeysByTab[tab].filter(isLocal).map((key) => (
              <div key={key}>
                <p className="form-note">{LOCAL_NOTE}</p>
                <Fields
                  name={key}
                  value={content.pages[key]}
                  onChange={(next) =>
                    update(
                      (state) =>
                        ({
                          ...state,
                          pages: { ...state.pages, [key]: next },
                        }) as ContentState,
                    )
                  }
                />
              </div>
            ))}
            {tab === 'About' && (
              <div>
                <p className="form-note">{LOCAL_NOTE}</p>
                <Fields
                  name="Leadership profiles"
                  value={content.team}
                  onChange={(next) =>
                    update((state) => ({
                      ...state,
                      team: next as ContentState['team'],
                    }))
                  }
                />
              </div>
            )}
          </fieldset>
          {(tab === 'Events' || tab === 'Locations') && (
            <Link className="button" href="/admin/events">
              Manage services, groups, studies and events
            </Link>
          )}
          {tab === 'Sermons' && (
            <Link className="button" href="/admin/sermons">
              Manage sermon library
            </Link>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
