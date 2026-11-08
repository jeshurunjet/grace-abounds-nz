'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import type { ContentState } from '../../lib/content';

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
  groups: ['Group name', 'Leader', 'Schedule', 'Area'],
  studies: ['Study name', 'Description', 'Schedule', 'Location'],
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
  memberOpportunities:
    'Shown only in the member area “Get involved” list. These are separate from the public Next steps journeys below.',
  steps: 'Public Next steps journeys shown on the website.',
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
  return (
    <label>
      {label(name)}
      {(/^\/images\/[^\s]+$/.test(value) ||
        /^https:\/\/images\.unsplash\.com\/[^\s]+$/.test(value)) && (
        <Image
          className="cms-image-preview"
          unoptimized
          src={value}
          alt="Content image preview"
          width={320}
          height={180}
        />
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
          Visibility after approval
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
export default function CmsPage() {
  const { content, update, ready } = useContent();
  const [tab, setTab] = useState<Tab>('Home');
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
    'Next steps': ['memberOpportunities'],
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
  const pageKeys: Record<Tab, (keyof ContentState['pages'])[]> = {
    Home: ['heroImages', 'gallery'],
    About: [
      'aboutIntro',
      'aboutHeroImage',
      'aboutImage',
      'ministryYears',
      'values',
      'officeHours',
    ],
    Locations: ['locations', 'groups', 'studies'],
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
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Public website</p>
        <h1>Website content</h1>
        <p>
          Manage all seven public pages. Changes save automatically to the
          draft. Submit the complete draft for pastor approval above.
        </p>
      </header>
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
            </button>
          ))}
          <p className="form-note">
            Changes to every page are included in one website draft. Private
            member activity stays separate.
          </p>
        </aside>
        <section className="panel cms-form">
          <h2>{tab}</h2>
          <fieldset disabled={!ready} className="cms-fields">
            {siteKeys[tab].map((key) => (
              <Fields
                key={key}
                name={key}
                value={content.site[key]}
                onChange={(next) =>
                  update((state) => ({
                    ...state,
                    site: { ...state.site, [key]: next },
                  }))
                }
              />
            ))}
            {heroKey && (
              <Fields
                name="Page introduction"
                value={content.pages.heroes[heroKey]}
                onChange={(next) =>
                  update(
                    (state) =>
                      ({
                        ...state,
                        pages: {
                          ...state.pages,
                          heroes: { ...state.pages.heroes, [heroKey]: next },
                        },
                      }) as ContentState,
                  )
                }
              />
            )}
            {pageKeys[tab].map((key) => (
              <Fields
                key={key}
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
            ))}
            {tab === 'About' && (
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
            )}
          </fieldset>
          {tab === 'Events' && (
            <Link className="button" href="/admin/events">
              Manage events and calendar entries
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
