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
import {
  publishStatuses,
  seedContent,
  type ContentState,
} from '../lib/content';

// v4: activities replace events, groups, studies and RSVPs.
const STORAGE_KEY = 'grace-abounds-content-v4';
/** Retired draft store; any unapplied draft is applied once on load. */
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
};
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
export function ContentProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState(seedContent);
  const [storageError, setStorageError] = useState('');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const { data } = useSession();
  const role = data?.user?.role;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      const legacy = JSON.parse(
        localStorage.getItem(LEGACY_EDITOR_KEY) ?? 'null',
      );
      const draft = legacy?.status !== 'published' ? legacy?.draft : null;
      const base = saved
        ? {
            ...seedContent,
            ...saved,
            site: { ...seedContent.site, ...saved.site },
            pages: { ...seedContent.pages, ...saved.pages },
          }
        : seedContent;
      setContent(
        normalizeRecords(
          draft
            ? {
                ...base,
                ...draft,
                site: { ...base.site, ...draft.site },
                pages: { ...base.pages, ...draft.pages },
              }
            : base,
        ),
      );
      localStorage.removeItem?.(LEGACY_EDITOR_KEY);
    } catch {
      /* Keep seeded content when a browser's saved preview is invalid. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
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
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          setStorageError('');
          return true;
        } catch {
          setStorageError(STORAGE_MESSAGE);
          return false;
        }
      },
    }),
    [content, ready, storageError, role],
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
    }
  );
}
