'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import type { PublicContentBundle } from '@grace-abounds/validation';
import {
  publishStatuses,
  seedContent,
  type ContentState,
} from '../lib/content';
import {
  mergePatch,
  toLegacy,
  type PublishedPatch,
} from '../lib/content-adapter';

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
  /**
   * Shows one resource the server has just confirmed as published (the
   * canonical data from its save response). Nothing else changes.
   */
  applyPublished: (patch: PublishedPatch) => void;
};
/**
 * Published settings, page sections and the Phase 2B collections (campuses,
 * Next steps, leadership) come from the server. Browser storage keeps only
 * the parts that have not moved to the database yet (activities, sermons,
 * member records); it never supplies site, pages or team.
 */
function localPart(content: ContentState) {
  const { site: _site, pages: _pages, team: _team, ...rest } = content;
  void _site;
  void _pages;
  void _team;
  return rest;
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
  // The root layout re-renders with a fresh bundle on router.refresh() (see
  // ContentFreshness); key on its value so identical bundles change nothing.
  const bundleKey = JSON.stringify(initialContent);
  const published = useMemo(
    () => toLegacy(JSON.parse(bundleKey), seedContent.pages),
    [bundleKey],
  );
  const loaded = useRef(false);
  // Once real content has been shown, a failed refresh keeps showing it
  // rather than blanking the page.
  const [hasPublished, setHasPublished] = useState(initialContent !== null);
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
    if (loaded.current) {
      if (bundleKey === 'null') return;
      setHasPublished(true);
      // A newer published bundle: replace the server-owned site, pages and
      // leadership; other browser-kept data stays.
      setContent((current) => ({
        ...current,
        site: published.site,
        pages: published.pages,
        team: published.team,
      }));
      return;
    }
    loaded.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      // Site, pages and leadership always come from the server; browser
      // storage only supplies the parts that have not moved yet.
      const base: ContentState = {
        ...seedContent,
        ...(saved ?? {}),
        site: published.site,
        pages: published.pages,
        team: published.team,
      };
      setContent(normalizeRecords(base));
      localStorage.removeItem?.(LEGACY_EDITOR_KEY);
    } catch {
      /* Keep the published content when a browser's saved data is invalid. */
    }
    setReady(true);
  }, [published, bundleKey]);
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
      contentUnavailable: initialContent === null && !hasPublished,
      applyPublished(patch) {
        setContent((current) => mergePatch(current, patch));
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
    [content, ready, storageError, role, initialContent, hasPublished],
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
