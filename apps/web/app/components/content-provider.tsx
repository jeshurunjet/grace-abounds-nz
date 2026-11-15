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
  'site' | 'pages' | 'sermons' | 'team' | 'activities' | 'activityExceptions'
>;
const publicContent = ({
  site,
  pages,
  sermons,
  team,
  activities,
  activityExceptions,
}: ContentState): PublicContent => ({
  site,
  pages,
  sermons,
  team,
  activities,
  activityExceptions,
});
/** The server-owned parts of the published bundle. */
const serverOwned = (published: PublicContent) => ({
  site: published.site,
  pages: published.pages,
  team: published.team,
  sermons: published.sermons,
  activities: published.activities,
  activityExceptions: published.activityExceptions,
});
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
   * The content generation of the published bundle being shown, or null if
   * none was loaded. Freshness checks compare it with the server's latest.
   */
  generation: number | null;
  /**
   * The latest scheduled release in that bundle (epoch ms, 0 when none).
   * Freshness checks refresh when a later release has passed.
   */
  released: number;
  /**
   * Shows one resource the server has just confirmed as published (the
   * canonical data from its save response). Nothing else changes.
   */
  applyPublished: (patch: PublishedPatch) => void;
};
/**
 * Published settings, page sections, the Phase 2B collections (campuses,
 * Next steps, leadership), sermons and (Phase 3A) activities with their
 * changed dates come from the server. Browser storage keeps only the parts
 * that have not moved to the database yet (participations until 3B, member
 * records); it never supplies any server-owned part.
 */
function localPart(content: ContentState) {
  const {
    site: _site,
    pages: _pages,
    team: _team,
    sermons: _sermons,
    activities: _activities,
    activityExceptions: _activityExceptions,
    ...rest
  } = content;
  void _site;
  void _pages;
  void _team;
  void _sermons;
  void _activities;
  void _activityExceptions;
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
      // A newer published bundle: replace the server-owned parts; other
      // browser-kept data stays.
      setContent((current) => ({ ...current, ...serverOwned(published) }));
      return;
    }
    loaded.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      // Server-owned parts always come from the server (a value an older
      // version left in browser storage is ignored); browser storage only
      // supplies the parts that have not moved yet.
      const base: ContentState = {
        ...seedContent,
        ...(saved ?? {}),
        ...serverOwned(published),
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
      generation: initialContent?.generation ?? null,
      released: initialContent?.released ?? 0,
      applyPublished(patch) {
        setContent((current) => mergePatch(current, patch));
      },
      async update(recipe) {
        if (!ready) return false;
        const changed = recipe(content);
        const next: ContentState = {
          ...changed,
          // Server-owned content never changes here: it is edited through
          // the API (and only by pastor/admin).
          ...publicContent(content),
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
      generation: null,
      released: 0,
      applyPublished: () => {},
    }
  );
}
