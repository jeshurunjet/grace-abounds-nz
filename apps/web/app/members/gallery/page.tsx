'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Archive,
  ChevronRight,
  Ellipsis,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  Library,
  Link2,
  List,
  Pencil,
  Presentation,
  Search,
  Trash,
  Upload,
  Video,
  type LucideIcon,
} from 'lucide-react';
import {
  classifyLink,
  safeLinkHref,
  type StaffSermon,
} from '@grace-abounds/validation';
import { MemberShell } from '../../components/member-shell';
import { useToast } from '../../components/toast';
import { Badge, type BadgeTone } from '../../components/editor-kit/parts';
import { KitConfirm } from '../../components/editor-kit/confirm';
import {
  editable,
  RecordPanel,
  statusBadge,
  type FieldSpec,
  type RecordRequest,
  type Row,
} from '../../components/editor-kit/record-panel';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { formatSermonDate } from '../../lib/content-adapter';
import { sermonBadge } from '../../lib/sermon-status';

/*
 * The Gallery: one Drive-style file manager for every role (owner decision,
 * "Gallery visual correction"). Folders, breadcrumb, list/grid and one file
 * area. Members open files; Pastor and Admin also get New folder, Add link
 * and per-item Rename / Edit details / Move / Archive / Delete on the same
 * records, each with an explicit Save or confirmation.
 *
 * "Videos & sermons" is always a top-level section. It lists sermons from
 * the Sermon records (approved ones for members; staff also see drafts and
 * pending ones, with a route to the approval editor). File actions here can
 * never publish a video. Uploads (drag and drop, file picker) arrive with
 * verified S3 storage in Phase 2D; until then Upload is shown as unavailable.
 */

const SERMONS = '#sermons';
type Place = string | null;
type BadgeInfo = { tone: BadgeTone; label: string } | undefined;
type FolderItem = {
  id: string;
  name: string;
  parentId: string | null;
  row?: Row;
};
type FileItem = {
  id: string;
  title: string;
  description: string;
  type: string;
  href: string;
  folderId: string | null;
  visibility: string;
  status?: string;
  row?: Row;
};
type SermonItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  live: boolean;
  badge?: BadgeInfo;
};
type MemberLibrary = {
  folders: { id: string; name: string; parentId: string | null }[];
  resources: (Omit<FileItem, 'href'> & { url: string; href?: string })[];
  sermons?: {
    id: string;
    title: string;
    speaker: string;
    series: string;
    date: string;
    href: string;
  }[];
};

const resourceBlank = {
  title: '',
  description: '',
  type: 'Document',
  url: '',
  sermonId: null,
  folderId: null,
  visibility: 'members',
  status: 'draft',
};
const folderBlank = { name: '', parentId: null };
// Stored links are classified once, the same way the server does; anything
// ambiguous (e.g. "/\host") is shown as plain text, never as a link.
const isExternal = (href: string) => classifyLink(href)?.kind === 'external';

function iconFor(item: FileItem): LucideIcon {
  const type = `${item.type} ${item.href}`.toLowerCase();
  if (/sheet|xls|csv/.test(type)) return FileSpreadsheet;
  if (/slide|ppt|presentation/.test(type)) return Presentation;
  if (/image|photo|jpe?g|png|gif|webp/.test(type)) return FileImage;
  if (/audio|mp3|m4a|podcast/.test(type)) return FileAudio;
  if (/zip|archive/.test(type)) return FileArchive;
  if (/pdf|doc|text|notes|guide/.test(type)) return FileText;
  return isExternal(item.href) ? Link2 : FileText;
}

type MenuItem = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  hint?: string;
};
/** A small actions menu (staff only). Escape or a click outside closes it. */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const outside = (event: MouseEvent) => {
      if (
        !menu.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', keys);
    };
  }, [open]);
  return (
    <div className="lib-menu">
      <button
        ref={trigger}
        type="button"
        className="kit-icon-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Ellipsis aria-hidden="true" size={18} />
      </button>
      {open && (
        <div
          ref={menu}
          className="lib-menu-list"
          role="menu"
          aria-label={label}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              title={item.hint}
              onClick={() => {
                setOpen(false);
                // Panels return focus to whatever was focused when they open.
                trigger.current?.focus();
                item.onSelect();
              }}
            >
              <item.icon aria-hidden="true" size={16} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type FolderMode = 'new' | 'rename' | 'move';
type FileMode = 'new' | 'edit' | 'move';

export default function GalleryPage() {
  const { data, status: sessionStatus } = useSession();
  const role = data?.user?.role;
  const staff = role === 'pastor' || role === 'admin';
  const toast = useToast();
  const [place, setPlace] = useState<Place>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [folders, setFolders] = useState<FolderItem[] | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [sermons, setSermons] = useState<SermonItem[]>([]);
  const [liveSermons, setLiveSermons] = useState<[string, string][]>([]);
  const [error, setError] = useState('');
  const [folderPanel, setFolderPanel] = useState<{
    request: RecordRequest;
    mode: FolderMode;
  }>({ request: null, mode: 'new' });
  const [filePanel, setFilePanel] = useState<{
    request: RecordRequest;
    mode: FileMode;
  }>({ request: null, mode: 'new' });
  const [confirm, setConfirm] = useState<{
    kind: 'archive' | 'delete-file' | 'delete-folder';
    row: Row;
    name: string;
  } | null>(null);

  // A remembered list/grid choice is a per-browser convenience only.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gallery-view');
      if (saved === 'grid' || saved === 'list') setView(saved);
    } catch {
      /* Storage unavailable: keep the default. */
    }
  }, []);
  const chooseView = (next: 'list' | 'grid') => {
    setView(next);
    try {
      localStorage.setItem('gallery-view', next);
    } catch {
      /* Storage unavailable. */
    }
  };

  const load = useCallback(async () => {
    setError('');
    try {
      if (staff) {
        const [folderRows, resourceRows, sermonRows] = await Promise.all([
          api<Row[]>('/staff/folders'),
          api<Row[]>('/staff/resources'),
          api<StaffSermon[]>('/staff/sermons'),
        ]);
        const slugs = new Map(
          sermonRows.data.map((item) => [item.id, item.slug] as const),
        );
        setFolders(
          folderRows.data.map((row) => ({
            id: row.id,
            name: String(row.name),
            parentId: (row.parentId as string | null) ?? null,
            row,
          })),
        );
        setFiles(
          resourceRows.data.map((row) => ({
            id: row.id,
            title: String(row.title),
            description: String(row.description ?? ''),
            type: String(row.type ?? ''),
            href: row.sermonId
              ? `/sermons/${slugs.get(String(row.sermonId)) ?? ''}`
              : String(row.url ?? ''),
            folderId: (row.folderId as string | null) ?? null,
            visibility: String(row.visibility),
            status: String(row.status),
            row,
          })),
        );
        const current = sermonRows.data.filter((item) => !item.archived);
        setSermons(
          current.map((item) => ({
            id: item.id,
            title: item.title,
            detail: [item.speaker, formatSermonDate(item.date)]
              .filter(Boolean)
              .join(' · '),
            // Live sermons open their public page; the rest open the editor.
            href: item.live
              ? `/sermons/${item.slug}`
              : `/admin/sermons?sermon=${encodeURIComponent(item.id)}`,
            live: !!item.live,
            badge: sermonBadge(item),
          })),
        );
        setLiveSermons(
          current
            .filter((item) => item.live)
            .map((item) => [item.id, item.title] as [string, string]),
        );
      } else {
        const library = (await api<MemberLibrary>('/member/library')).data;
        setFolders(library.folders);
        setFiles(
          library.resources.map((item) => ({
            ...item,
            href: item.href ?? item.url,
          })),
        );
        setSermons(
          (library.sermons ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            detail: [item.speaker, formatSermonDate(item.date)]
              .filter(Boolean)
              .join(' · '),
            href: item.href,
            live: true,
          })),
        );
      }
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [staff]);
  useEffect(() => {
    if (sessionStatus !== 'loading') void load();
  }, [load, sessionStatus]);

  // ---------- Where we are ----------
  const byId = useMemo(
    () => new Map((folders ?? []).map((folder) => [folder.id, folder])),
    [folders],
  );
  // A folder that was deleted or moved away falls back to the library root.
  const at: Place =
    place === SERMONS || place === null || byId.has(place) ? place : null;
  const trail: FolderItem[] = [];
  for (let id = at === SERMONS ? null : at; id;) {
    const folder = byId.get(id);
    if (!folder || trail.includes(folder)) break;
    trail.unshift(folder);
    id = folder.parentId;
  }
  const pathOf = (folderId: string | null) => {
    const names: string[] = [];
    for (let id = folderId; id;) {
      const folder = byId.get(id);
      if (!folder || names.length > 20) break;
      names.unshift(folder.name);
      id = folder.parentId;
    }
    return names.join(' / ') || 'Library';
  };

  const search = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(search);
  const shownFolders = search
    ? (folders ?? []).filter((folder) => matches(folder.name))
    : at === SERMONS
      ? []
      : (folders ?? []).filter((folder) => folder.parentId === at);
  const shownFiles = search
    ? files.filter((file) => matches(`${file.title} ${file.description}`))
    : at === SERMONS
      ? []
      : files.filter((file) => file.folderId === at);
  const shownSermons =
    search || at === SERMONS
      ? sermons.filter(
          (item) => !search || matches(`${item.title} ${item.detail}`),
        )
      : [];
  const showSermonSection = !search && at === null;
  const count =
    shownFolders.length +
    shownFiles.length +
    shownSermons.length +
    (showSermonSection ? 1 : 0);

  // ---------- Staff actions ----------
  const nonce = () => Date.now() + Math.random();
  const descendants = (id: string) => {
    const out = new Set<string>([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders ?? [])
        if (
          folder.parentId &&
          out.has(folder.parentId) &&
          !out.has(folder.id)
        ) {
          out.add(folder.id);
          grew = true;
        }
    }
    return out;
  };
  const folderChoices = (exclude?: string): [string, string][] => {
    const hidden = exclude ? descendants(exclude) : new Set<string>();
    return (folders ?? [])
      .filter((folder) => !hidden.has(folder.id))
      .map((folder) => [folder.id, pathOf(folder.id)] as [string, string])
      .sort((a, b) => a[1].localeCompare(b[1]));
  };
  const here = at === SERMONS ? null : at;
  const openFolderPanel = (mode: FolderMode, row: Row | null) =>
    setFolderPanel({
      mode,
      request: { row, nonce: nonce(), preset: { parentId: here } },
    });
  const openFilePanel = (mode: FileMode, row: Row | null) =>
    setFilePanel({
      mode,
      request: { row, nonce: nonce(), preset: { folderId: here } },
    });
  const folderFields: FieldSpec[] =
    folderPanel.mode === 'move'
      ? [
          {
            key: 'parentId',
            label: 'Move into',
            kind: 'select',
            options: [
              ['', 'Library (top level)'],
              ...folderChoices(folderPanel.request?.row?.id),
            ],
          },
        ]
      : [{ key: 'name', label: 'Folder name', kind: 'text' }];
  const folderSelect: FieldSpec = {
    key: 'folderId',
    label: filePanel.mode === 'move' ? 'Move into' : 'Folder',
    kind: 'select',
    options: [['', 'Library (top level)'], ...folderChoices()],
  };
  const fileFields: FieldSpec[] =
    filePanel.mode === 'move'
      ? [folderSelect]
      : [
          { key: 'title', label: 'Name', kind: 'text' },
          { key: 'description', label: 'Description', kind: 'long' },
          {
            key: 'type',
            label: 'Type',
            kind: 'text',
            hint: 'For example PDF, Slides, Spreadsheet, Audio.',
          },
          {
            key: 'url',
            label: 'Link',
            kind: 'text',
            hint: 'A site path such as /next-steps, or an https:// link. Links to other websites are published by the Pastor. Videos go in Sermons & videos.',
          },
          {
            key: 'sermonId',
            label: 'Or an approved sermon',
            kind: 'select',
            hint: 'Every approved sermon is already in Videos & sermons. Use this to also place one in a folder; it shows only while the sermon is on the website.',
            options: [['', 'None'], ...liveSermons],
          },
          folderSelect,
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

  async function confirmAction() {
    if (!confirm) return;
    const { kind, row, name } = confirm;
    setConfirm(null);
    try {
      if (kind === 'archive') {
        await api<Row>(`/staff/resources/${row.id}`, {
          method: 'PATCH',
          version: row.version,
          body: JSON.stringify({
            ...editable(row, resourceBlank),
            status: 'archived',
          }),
        });
        toast.push(`${name} archived. Members no longer see it.`, 'success');
      } else {
        await api(
          `/staff/${kind === 'delete-folder' ? 'folders' : 'resources'}/${row.id}`,
          { method: 'DELETE', version: row.version },
        );
        toast.push(`${name} deleted.`, 'success');
      }
    } catch (failure) {
      toast.push(
        failure instanceof ApiError && failure.code === 'VERSION_CONFLICT'
          ? `${name} changed since you opened the Gallery. The latest version is shown now.`
          : errorMessage(failure),
        'error',
      );
    }
    void load();
  }

  const fileMenu = (file: FileItem, row: Row): MenuItem[] => [
    {
      label: 'Edit details',
      icon: Pencil,
      onSelect: () => openFilePanel('edit', row),
    },
    {
      label: 'Move',
      icon: FolderInput,
      onSelect: () => openFilePanel('move', row),
    },
    {
      label: 'Archive',
      icon: Archive,
      disabled: file.status === 'archived',
      onSelect: () => setConfirm({ kind: 'archive', row, name: file.title }),
    },
    {
      label: 'Delete',
      icon: Trash,
      disabled: file.status === 'published',
      hint:
        file.status === 'published'
          ? 'Archive it first; published files are not deleted.'
          : undefined,
      onSelect: () =>
        setConfirm({ kind: 'delete-file', row, name: file.title }),
    },
  ];
  const folderMenu = (folder: FolderItem, row: Row): MenuItem[] => [
    {
      label: 'Rename',
      icon: Pencil,
      onSelect: () => openFolderPanel('rename', row),
    },
    {
      label: 'Move',
      icon: FolderInput,
      onSelect: () => openFolderPanel('move', row),
    },
    {
      label: 'Delete',
      icon: Trash,
      onSelect: () =>
        setConfirm({ kind: 'delete-folder', row, name: folder.name }),
    },
  ];

  // ---------- Rendering ----------
  const go = (target: Place) => {
    setPlace(target);
    setQuery('');
  };
  const navButton = (
    target: Place,
    label: string,
    Icon: LucideIcon,
    depth = 0,
  ) => (
    <button
      type="button"
      className="lib-nav-item"
      style={{ paddingInlineStart: `${0.75 + depth * 0.9}rem` }}
      aria-current={at === target && !search ? 'page' : undefined}
      onClick={() => go(target)}
    >
      <Icon aria-hidden="true" size={16} />
      <span>{label}</span>
    </button>
  );
  const tree = (parentId: string | null, depth: number): ReactNode[] =>
    (folders ?? [])
      .filter((folder) => folder.parentId === parentId)
      .flatMap((folder) => [
        <li key={folder.id}>
          {navButton(folder.id, folder.name, Folder, depth)}
        </li>,
        ...(depth < 6 ? tree(folder.id, depth + 1) : []),
      ]);

  function itemRow(item: {
    key: string;
    icon: LucideIcon;
    name: ReactNode;
    detail: string;
    type: string;
    access?: string;
    badge?: BadgeInfo;
    menu?: ReactNode;
  }) {
    const Icon = item.icon;
    return (
      <li key={item.key} className="lib-item">
        <span className="lib-item-icon" aria-hidden="true">
          <Icon size={view === 'grid' ? 30 : 20} />
        </span>
        <span className="lib-item-name">
          {item.name}
          {item.detail && <small>{item.detail}</small>}
        </span>
        <span className="lib-item-type">{item.type}</span>
        {staff && <span className="lib-item-access">{item.access}</span>}
        <span className="lib-item-badge">
          {item.badge && (
            <Badge tone={item.badge.tone}>{item.badge.label}</Badge>
          )}
        </span>
        <span className="lib-item-actions">{item.menu}</span>
      </li>
    );
  }

  const sermonsEmpty = (
    <div className="lib-empty">
      <Video aria-hidden="true" size={28} />
      <p>
        <strong>No sermon recordings yet.</strong> Each sermon appears here
        automatically once the Pastor approves its recording.
      </p>
      {staff && (
        <Link className="button button-outline" href="/admin/sermons">
          Prepare a sermon
        </Link>
      )}
    </div>
  );

  return (
    <MemberShell>
      <div className="library">
        <header className="lib-head">
          <div className="lib-title">
            <h1>Gallery</h1>
            <p>Study notes, ministry resources and sermon recordings.</p>
          </div>
          <label className="lib-search">
            <Search aria-hidden="true" size={16} />
            <input
              type="search"
              aria-label="Search the library"
              placeholder="Search the library"
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

        <div className="lib-body">
          <nav className="lib-nav" aria-label="Library sections">
            <ul>
              <li>{navButton(null, 'All files', Library)}</li>
              <li>{navButton(SERMONS, 'Videos & sermons', Video)}</li>
            </ul>
            {!!folders?.length && (
              <>
                <p className="lib-nav-label">Folders</p>
                <ul>{tree(null, 0)}</ul>
              </>
            )}
          </nav>

          <section className="lib-main" aria-label="Files">
            <div className="lib-toolbar">
              <nav className="lib-crumbs" aria-label="Folder path">
                {search ? (
                  <span>Search results</span>
                ) : (
                  <>
                    {at === null ? (
                      <span aria-current="page">Library</span>
                    ) : (
                      <button type="button" onClick={() => go(null)}>
                        Library
                      </button>
                    )}
                    {at === SERMONS && (
                      <span className="lib-crumb">
                        <ChevronRight aria-hidden="true" size={14} />
                        <span aria-current="page">Videos &amp; sermons</span>
                      </span>
                    )}
                    {trail.map((folder, index) => (
                      <span key={folder.id} className="lib-crumb">
                        <ChevronRight aria-hidden="true" size={14} />
                        {index === trail.length - 1 ? (
                          <span aria-current="page">{folder.name}</span>
                        ) : (
                          <button type="button" onClick={() => go(folder.id)}>
                            {folder.name}
                          </button>
                        )}
                      </span>
                    ))}
                  </>
                )}
              </nav>
              <div className="lib-actions">
                {staff && at === SERMONS && (
                  <Link className="button button-outline" href="/admin/sermons">
                    <Video aria-hidden="true" size={16} />
                    Manage sermons
                  </Link>
                )}
                {staff && at !== SERMONS && (
                  <>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={!folders}
                      onClick={() => openFolderPanel('new', null)}
                    >
                      <FolderPlus aria-hidden="true" size={16} />
                      New folder
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={!folders}
                      onClick={() => openFilePanel('new', null)}
                    >
                      <Link2 aria-hidden="true" size={16} />
                      Add link
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      disabled
                      aria-describedby="lib-upload-note"
                    >
                      <Upload aria-hidden="true" size={16} />
                      Upload
                    </button>
                  </>
                )}
                <div className="lib-view" role="group" aria-label="View">
                  <button
                    type="button"
                    className="kit-icon-button"
                    aria-label="List view"
                    aria-pressed={view === 'list'}
                    onClick={() => chooseView('list')}
                  >
                    <List aria-hidden="true" size={18} />
                  </button>
                  <button
                    type="button"
                    className="kit-icon-button"
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                    onClick={() => chooseView('grid')}
                  >
                    <LayoutGrid aria-hidden="true" size={18} />
                  </button>
                </div>
              </div>
            </div>
            {staff && at !== SERMONS && (
              <p id="lib-upload-note" className="lib-note">
                File uploads are not available yet. Add a link for now.
              </p>
            )}
            {at === SERMONS && !search && (
              <p className="lib-note">
                {staff
                  ? 'Sermons are prepared and approved in Sermons & videos. Members see a sermon here only after the Pastor approves it.'
                  : 'Recordings of recent messages.'}
              </p>
            )}

            <p className="lib-count" aria-live="polite">
              {folders
                ? `${count} ${count === 1 ? 'item' : 'items'}`
                : 'Loading…'}
            </p>

            {folders && at === SERMONS && !search && !shownSermons.length ? (
              sermonsEmpty
            ) : folders && !count ? (
              <div className="lib-empty">
                <Folder aria-hidden="true" size={28} />
                <p>
                  {search
                    ? 'Nothing matches your search.'
                    : staff
                      ? 'This folder is empty. Add a link or a folder here.'
                      : 'This folder is empty.'}
                </p>
              </div>
            ) : (
              <ul
                className={`lib-items lib-${view}${staff ? ' lib-staff' : ''}`}
              >
                {view === 'list' && (
                  <li className="lib-item lib-item-head" aria-hidden="true">
                    <span />
                    <span>Name</span>
                    <span className="lib-item-type">Type</span>
                    {staff && (
                      <span className="lib-item-access">Who can open</span>
                    )}
                    <span />
                    <span />
                  </li>
                )}
                {showSermonSection &&
                  itemRow({
                    key: 'sermons',
                    icon: Video,
                    name: (
                      <button
                        type="button"
                        className="lib-open"
                        onClick={() => go(SERMONS)}
                      >
                        Videos &amp; sermons
                      </button>
                    ),
                    detail: sermons.length
                      ? `${sermons.length} ${sermons.length === 1 ? 'recording' : 'recordings'}`
                      : 'Approved recordings appear here',
                    type: 'Section',
                  })}
                {shownFolders.map((folder) =>
                  itemRow({
                    key: folder.id,
                    icon: Folder,
                    name: (
                      <button
                        type="button"
                        className="lib-open"
                        onClick={() => go(folder.id)}
                      >
                        {folder.name}
                      </button>
                    ),
                    detail: search ? `In ${pathOf(folder.parentId)}` : '',
                    type: 'Folder',
                    menu:
                      staff && folder.row ? (
                        <RowMenu
                          label={`Actions for ${folder.name}`}
                          items={folderMenu(folder, folder.row)}
                        />
                      ) : undefined,
                  }),
                )}
                {shownSermons.map((item) =>
                  itemRow({
                    key: `sermon-${item.id}`,
                    icon: Video,
                    name: (
                      <a className="lib-open" href={item.href}>
                        {item.title}
                      </a>
                    ),
                    detail: item.detail,
                    type: 'Sermon',
                    access: item.live ? 'Anyone' : 'Staff only',
                    badge: staff ? item.badge : undefined,
                  }),
                )}
                {shownFiles.map((file) => {
                  const href = safeLinkHref(file.href);
                  return itemRow({
                    key: file.id,
                    icon: iconFor(file),
                    name: href ? (
                      <a
                        className="lib-open"
                        href={href}
                        {...(isExternal(href) && {
                          target: '_blank',
                          rel: 'noreferrer',
                        })}
                      >
                        {file.title}
                      </a>
                    ) : (
                      <span className="lib-open">{file.title}</span>
                    ),
                    detail: search
                      ? `In ${pathOf(file.folderId)}`
                      : file.description,
                    type: file.type,
                    access: file.visibility === 'public' ? 'Anyone' : 'Members',
                    badge: staff ? statusBadge(file.status) : undefined,
                    menu:
                      staff && file.row ? (
                        <RowMenu
                          label={`Actions for ${file.title}`}
                          items={fileMenu(file, file.row)}
                        />
                      ) : undefined,
                  });
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {staff && (
        <>
          <RecordPanel
            collection="folders"
            noun="folder"
            eyebrow="Gallery"
            title={
              folderPanel.mode === 'new'
                ? 'New folder'
                : folderPanel.mode === 'move'
                  ? 'Move folder'
                  : 'Rename folder'
            }
            blank={folderBlank}
            fields={folderFields}
            request={folderPanel.request}
            allowDelete={false}
            titleFor={(row) => String(row.name)}
            onClose={() =>
              setFolderPanel((state) => ({ ...state, request: null }))
            }
            onSaved={() => void load()}
          />
          <RecordPanel
            collection="resources"
            noun="file"
            eyebrow="Gallery"
            title={
              filePanel.mode === 'new'
                ? 'Add link'
                : filePanel.mode === 'move'
                  ? 'Move file'
                  : 'Edit details'
            }
            blank={resourceBlank}
            fields={fileFields}
            request={filePanel.request}
            allowDelete={false}
            titleFor={(row) => String(row.title)}
            onClose={() =>
              setFilePanel((state) => ({ ...state, request: null }))
            }
            onSaved={() => void load()}
          />
          <KitConfirm
            open={!!confirm}
            title={
              confirm?.kind === 'archive'
                ? `Archive “${confirm.name}”?`
                : `Delete “${confirm?.name ?? ''}”?`
            }
            confirmLabel={confirm?.kind === 'archive' ? 'Archive' : 'Delete'}
            onCancel={() => setConfirm(null)}
            onConfirm={() => void confirmAction()}
          >
            <p>
              {confirm?.kind === 'archive'
                ? 'Members will no longer see it. It stays here for staff and can be published again from Edit details.'
                : confirm?.kind === 'delete-folder'
                  ? 'Only an empty folder can be deleted. This can’t be undone.'
                  : 'This can’t be undone. Its saved history stays in the audit log.'}
            </p>
          </KitConfirm>
        </>
      )}
    </MemberShell>
  );
}
