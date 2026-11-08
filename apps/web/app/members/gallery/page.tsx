'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { MemberShell } from '../../components/member-shell';
import { useContent } from '../../components/content-provider';

export default function GalleryPage() {
  const [query, setQuery] = useState('');
  const { content } = useContent();
  const resources = content.pages.resources;
  const filtered = resources.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <MemberShell>
      <div className="resource-gallery-page">
        <Breadcrumbs
          items={[
            { label: 'Member Dashboard', href: '/members' },
            { label: 'Resource Gallery' },
          ]}
        />
        <header className="resource-gallery-heading">
          <div>
            <p className="eyebrow">Member library</p>
            <h1>Resource Gallery</h1>
            <p>
              Study notes, ministry resources, and practical tools for your
              week.
            </p>
          </div>
          <label className="resource-search-field">
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              aria-label="Search resources"
              placeholder="Search resources…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>
        <p className="resource-count">
          {filtered.length} {filtered.length === 1 ? 'file' : 'files'}
        </p>
        <div className="file-grid">
          {!filtered.length && (
            <p>
              {query
                ? 'No resources match your search.'
                : 'Resources will appear here when the church publishes them.'}
            </p>
          )}
          {filtered.map((item) => (
            <a
              className="file-card"
              key={item.title}
              style={{ '--file-color': '#B95428' } as CSSProperties}
              href={
                item.url.startsWith('https://') ||
                (item.url.startsWith('/') && !item.url.startsWith('//'))
                  ? item.url
                  : undefined
              }
              target="_blank"
              rel="noreferrer"
            >
              <span className="file-art">
                <svg aria-hidden="true" viewBox="0 0 56 68">
                  <path d="M9 2h25l13 14v50H9z" />
                  <path d="M34 2v15h13" />
                  <path d="M17 31h22M17 40h22M17 49h15" />
                </svg>
                <b>{item.type}</b>
              </span>
              <span className="file-copy">
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </a>
          ))}
        </div>
      </div>
    </MemberShell>
  );
}
