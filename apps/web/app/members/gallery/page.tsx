'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { FileText, Folder } from 'lucide-react';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { MemberShell } from '../../components/member-shell';
import {
  CollectionSection,
  type FieldSpec,
} from '../../components/editor-kit/collection-section';
import { api, errorMessage } from '../../lib/api-client';

type LibraryFolder = { id: string; name: string; parentId: string | null };
type LibraryResource = {
  id: string;
  title: string;
  description: string;
  type: string;
  url: string;
  folderId: string | null;
  visibility: 'public' | 'members';
};

const resourceBlank = {
  title: '',
  description: '',
  type: 'Document',
  url: '',
  folderId: null,
  visibility: 'members',
  status: 'draft',
};
const folderBlank = { name: '', parentId: null };
const safeHref = (url: string) =>
  url.startsWith('https://') || (url.startsWith('/') && !url.startsWith('//'))
    ? url
    : undefined;

/**
 * The shared library (Gallery). Members browse published resources; Pastor
 * and Admin also see management controls for folders and resources in the
 * same place. File uploads arrive in Phase 2D; until then a resource links
 * to an https:// address or a site path.
 */
export default function GalleryPage() {
  const { data } = useSession();
  const staff = data?.user?.role === 'pastor' || data?.user?.role === 'admin';
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string | null>(null);
  const [library, setLibrary] = useState<{
    folders: LibraryFolder[];
    resources: LibraryResource[];
  } | null>(null);
  const [error, setError] = useState('');
  const [folderOptions, setFolderOptions] = useState<[string, string][]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      setLibrary(
        (
          await api<{ folders: LibraryFolder[]; resources: LibraryResource[] }>(
            '/member/library',
          )
        ).data,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const resources = (library?.resources ?? []).filter(
    (item) =>
      (folder === null || item.folderId === folder) &&
      `${item.title} ${item.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const resourceFields: FieldSpec[] = [
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'long' },
    {
      key: 'type',
      label: 'Type',
      kind: 'text',
      hint: 'For example PDF, Slides, Audio.',
    },
    {
      key: 'url',
      label: 'Link',
      kind: 'text',
      hint: 'An https:// address or a site path. File uploads are coming later.',
    },
    {
      key: 'folderId',
      label: 'Folder',
      kind: 'select',
      options: [['', 'No folder'], ...folderOptions],
    },
    {
      key: 'visibility',
      label: 'Who can open it',
      kind: 'select',
      options: [
        ['members', 'Signed-in members'],
        ['public', 'Anyone (public)'],
      ],
    },
    { key: 'status', label: 'Visibility', kind: 'status' },
  ];
  const folderFields: FieldSpec[] = [
    { key: 'name', label: 'Folder name', kind: 'text' },
    {
      key: 'parentId',
      label: 'Inside',
      kind: 'select',
      options: [['', 'Top level'], ...folderOptions],
    },
  ];

  return (
    <MemberShell>
      <div className="resource-gallery-page">
        <Breadcrumbs
          items={[{ label: 'Home', href: '/members' }, { label: 'Gallery' }]}
        />
        <header className="resource-gallery-heading">
          <div>
            <p className="eyebrow">Member library</p>
            <h1>Gallery</h1>
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
        {error && (
          <div className="publishing-errors" role="alert">
            <p>The library couldn’t be loaded. {error}</p>
            <button
              className="button button-outline"
              onClick={() => void load()}
            >
              Try again
            </button>
          </div>
        )}
        {!!library?.folders.length && (
          <div className="calendar-filters" role="group" aria-label="Folders">
            <button
              aria-pressed={folder === null}
              className={folder === null ? 'active' : ''}
              onClick={() => setFolder(null)}
            >
              All files
            </button>
            {library.folders.map((item) => (
              <button
                key={item.id}
                aria-pressed={folder === item.id}
                className={folder === item.id ? 'active' : ''}
                onClick={() => setFolder(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        <p className="resource-count">
          {library
            ? `${resources.length} ${resources.length === 1 ? 'file' : 'files'}`
            : 'Loading…'}
        </p>
        <div className="file-grid">
          {library && !resources.length && (
            <p>
              {query || folder
                ? 'No resources match.'
                : 'Resources will appear here when the church publishes them.'}
            </p>
          )}
          {resources.map((item) => (
            <a
              className="file-card"
              key={item.id}
              style={
                { '--file-color': 'var(--palette-maple)' } as CSSProperties
              }
              href={safeHref(item.url)}
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

        {staff && (
          <section
            className="kit-page library-manage"
            aria-labelledby="library-manage"
          >
            <h2 id="library-manage" className="staff-tools-label">
              Manage the library
            </h2>
            <CollectionSection
              collection="folders"
              noun="folder"
              icon={Folder}
              title="Folders"
              blank={folderBlank}
              fields={folderFields}
              summary={(row) => ({ title: String(row.name) })}
              onChange={(rows) => {
                setFolderOptions(
                  rows.map(
                    (row) => [row.id, String(row.name)] as [string, string],
                  ),
                );
                void load();
              }}
            />
            <CollectionSection
              collection="resources"
              noun="resource"
              icon={FileText}
              title="Resources"
              description="Drafts and archived resources are never shown to members."
              blank={resourceBlank}
              fields={resourceFields}
              summary={(row) => ({
                title: String(row.title),
                detail: [
                  row.type,
                  row.visibility === 'public' ? 'Public' : 'Members',
                ]
                  .filter(Boolean)
                  .join(' · '),
              })}
              onChange={() => void load()}
            />
          </section>
        )}
      </div>
    </MemberShell>
  );
}
