'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type { PublicContentBundle } from '@grace-abounds/validation';
import {
  publishStatuses,
  seedContent,
  type ContentState,
  type SiteContent,
} from '../lib/content';
import { toLegacy } from '../lib/content-adapter';

// v4: activities replace events, groups, studies and RSVPs.
const STORAGE_KEY = 'grace-abounds-content-v4';
/** Retired draft store from the prototype; removed on load, never applied. */
const LEGACY_EDITOR_KEY = 'grace-abounds-editor-v2';
export type PublicContent = Pick<
  ContentState,
  'site' | 'pages' | 'sermons' | 'team'
>;
const publicContent = ({
  site,
  pages,
  sermons,
  team,
}: ContentState): PublicContent => ({ site, pages, sermons, team });
type ContentContextValue = {
  content: ContentState;
  /**
   * Applies a change to the live site content and saves it. Resolves true
   * only when the change was saved to browser storage.
   */
  update: (recipe: (current: ContentState) => ContentState) => Promise<boolean>;
  ready: boolean;
  storageError: string;
  retrySave: () => void;
  /** True when published content could not be loaded from the server. */
  contentUnavailable: boolean;
  /** Shows content the server has just confirmed as published. */
  applyPublished: (next: {
    site?: SiteContent;
    pages?: Partial<ContentState['pages']>;
  }) => void;
};
/**
 * Published settings and page sections come from the server. Only these
 * page fields are still kept in this browser until their collections move
 * to the database (Phase 2 slice 2).
 */
const LOCAL_PAGE_FIELDS = ['locations', 'steps', 'resources'] as const;
function localPart(content: ContentState) {
  const { site: _site, pages, ...rest } = content;
  void _site;
  return {
    ...rest,
    pages: Object.fromEntries(
      LOCAL_PAGE_FIELDS.map((key) => [key, pages[key]]),
    ),
  };
}
// Treat any unsupported visibility value as an unpublished draft.
function normalizeRecords<T extends Partial<PublicContent>>(value: T): T {
  const fix = <R extends { status: string }>(items?: R[]) =>
    items?.map((item) =>
      publishStatuses.includes(item.status as never)
        ? item
        : { ...item, status: 'draft' },
    );
  return {
    ...value,
    ...(value.sermons && { sermons: fix(value.sermons) }),
    ...(value.team && { team: fix(value.team) }),
  };
}
const STORAGE_MESSAGE =
  'This browser could not save your changes. Your edits remain on screen — retry before leaving this page.';
const ContentContext = createContext<ContentContextValue | null>(null);
export function ContentProvider({
  children,
  initialContent,
}: {
  children: ReactNode;
  initialContent: PublicContentBundle | null;
}) {
  const [published] = useState(() =>
    toLegacy(initialContent, seedContent.pages),
  );
  const [content, setContent] = useState<ContentState>(() => ({
    ...seedContent,
    ...published,
  }));
  const [storageError, setStorageError] = useState('');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const { data } = useSession();
  const role = data?.user?.role;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      // Published site and pages always come from the server; browser storage
      // only supplies the parts that have not moved to the database yet.
      const local = (saved?.pages ?? {}) as Partial<ContentState['pages']>;
      const base: ContentState = saved
        ? {
            ...seedContent,
            ...saved,
            site: published.site,
            pages: {
              ...published.pages,
              ...Object.fromEntries(
                LOCAL_PAGE_FIELDS.filter((key) => local[key]).map((key) => [
                  key,
                  local[key],
                ]),
              ),
            },
          }
        : { ...seedContent, ...published };
      setContent(normalizeRecords(base));
      localStorage.removeItem?.(LEGACY_EDITOR_KEY);
    } catch {
      /* Keep the published content when a browser's saved data is invalid. */
    }
    setReady(true);
  }, [published]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localPart(content)));
      setStorageError('');
    } catch {
      setStorageError(STORAGE_MESSAGE);
    }
  }, [content, ready, saveAttempt]);
  const value = useMemo<ContentContextValue>(
    () => ({
      content,
      ready,
      storageError,
      retrySave: () => setSaveAttempt((current) => current + 1),
      contentUnavailable: initialContent === null,
      applyPublished(next) {
        setContent((current) => ({
          ...current,
          ...(next.site && { site: next.site }),
          ...(next.pages && { pages: { ...current.pages, ...next.pages } }),
        }));
      },
      async update(recipe) {
        if (!ready) return false;
        const changed = recipe(content);
        const staff = role === 'pastor' || role === 'admin';
        const next: ContentState = {
          ...changed,
          // Website content and activities are edited by pastor/admin only.
          ...(!staff && {
            ...publicContent(content),
            activities: content.activities,
            activityExceptions: content.activityExceptions,
          }),
          // Only the pastor can change member accounts and roles.
          users: role === 'pastor' ? changed.users : content.users,
        };
        setContent(next);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(localPart(next)));
          setStorageError('');
          return true;
        } catch {
          setStorageError(STORAGE_MESSAGE);
          return false;
        }
      },
    }),
    [content, ready, storageError, role, initialContent],
  );
  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}
export function useContent() {
  const value = useContext(ContentContext);
  return (
    value ?? {
      content: seedContent,
      ready: true,
      storageError: '',
      retrySave: () => {},
      update: async () => false,
      contentUnavailable: false,
      applyPublished: () => {},
    }
  );
}
