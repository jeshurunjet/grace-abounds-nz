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
          Status
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
          >
            {['draft', 'published', 'archived'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </label>
      );
    const multiline =
      value.length > 100 ||
      /story|copy|body|bio|summary|verses|opportunities/i.test(name);
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
  if (Array.isArray(value))
    return (
      <fieldset className="cms-collection">
        <legend>{label(name)}</legend>
        {value.map((item, index) => (
          <details key={index}>
            <summary>
              {typeof item === 'object' && !Array.isArray(item)
                ? (item.title ?? item.name ?? `Item ${index + 1}`)
                : `${label(name)} ${index + 1}`}
            </summary>
            <Fields
              value={item}
              name={`Item ${index + 1}`}
              onChange={(next) =>
                onChange(value.map((entry, i) => (i === index ? next : entry)))
              }
            />
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
              disabled={value.length <= 1 && name !== 'resources'}
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
              !value.length && name === 'resources'
                ? {
                    id: crypto.randomUUID(),
                    title: 'New resource',
                    type: 'PDF',
                    url: '',
                    description: '',
                  }
                : typeof value[0] === 'string'
                  ? ''
                  : Array.isArray(value[0])
                    ? structuredClone(value[0])
                    : {
                        ...structuredClone(value[value.length - 1]),
                        ...(value[value.length - 1]?.id
                          ? { id: crypto.randomUUID() }
                          : {}),
                      },
            ])
          }
        >
          Add item
        </button>
      </fieldset>
    );
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
