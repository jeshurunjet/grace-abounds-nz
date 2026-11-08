'use client';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { validatePublicContent } from '../lib/content-validation';
import { seedContent, type ContentState } from '../lib/content';

const STORAGE_KEY = 'grace-abounds-content-v3';
const EDITOR_KEY = 'grace-abounds-editor-v1';
export type PublicContent = Pick<
  ContentState,
  'site' | 'pages' | 'events' | 'sermons' | 'team'
>;
type EditorialState = {
  draft: PublicContent;
  status: 'draft' | 'pending' | 'published';
  feedback: string;
};
const publicContent = ({
  site,
  pages,
  events,
  sermons,
  team,
}: ContentState): PublicContent => ({ site, pages, events, sermons, team });
type ContentContextValue = {
  content: ContentState;
  update: (recipe: (current: ContentState) => ContentState) => Promise<void>;
  ready: boolean;
  storageError: string;
  retrySave: () => void;
  editorial: EditorialState;
  submit: () => void;
  publish: () => void;
  returnDraft: (feedback: string) => void;
};
const initialEditorial: EditorialState = {
  draft: publicContent(seedContent),
  status: 'published',
  feedback: '',
};
const ContentContext = createContext<ContentContextValue | null>(null);
export function ContentProvider({ children }: { children: ReactNode }) {
  const [published, setPublished] = useState(seedContent);
  const [editorial, setEditorial] = useState<EditorialState>(initialEditorial);
  const [storageError, setStorageError] = useState('');
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const { data } = useSession();
  const pathname = usePathname();
  const role = data?.user?.role;
  const staff = role === 'pastor' || role === 'admin';
  const editing = staff && pathname.startsWith('/admin');
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      const merged = saved
        ? {
            ...seedContent,
            ...saved,
            site: { ...seedContent.site, ...saved.site },
            pages: { ...seedContent.pages, ...saved.pages },
          }
        : seedContent;
      setPublished(merged);
      const editor = JSON.parse(localStorage.getItem(EDITOR_KEY) ?? 'null');
      setEditorial(
        editor
          ? {
              ...editor,
              draft: {
                ...publicContent(merged),
                ...editor.draft,
                pages: { ...merged.pages, ...editor.draft?.pages },
              },
            }
          : { ...initialEditorial, draft: publicContent(merged) },
      );
    } catch {
      /* Keep seeded content when a browser's saved preview is invalid. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(published));
      localStorage.setItem(EDITOR_KEY, JSON.stringify(editorial));
      setStorageError('');
    } catch {
      setStorageError(
        'This browser could not save the preview. Your edits remain on screen. Retry before submitting for review.',
      );
    }
  }, [published, editorial, ready, saveAttempt]);
  const content = useMemo(
    () => (editing ? { ...published, ...editorial.draft } : published),
    [editing, published, editorial.draft],
  );
  const value = useMemo<ContentContextValue>(
    () => ({
      content,
      ready,
      storageError,
      retrySave: () => setSaveAttempt((current) => current + 1),
      editorial,
      async update(recipe) {
        if (!ready) return;
        const current = staff
          ? { ...published, ...editorial.draft }
          : published;
        const next = recipe(current);
        if (staff) {
          const nextPublic = publicContent(next);
          if (
            JSON.stringify(nextPublic) !==
            JSON.stringify(publicContent(current))
          ) {
            setEditorial({
              draft: nextPublic,
              status: 'draft',
              feedback: editorial.feedback,
            });
          }
        }
        // Member activity is separate from the public publishing workflow.
        setPublished({
          ...next,
          ...publicContent(published),
          users: role === 'pastor' ? next.users : published.users,
        });
      },
      submit() {
        if (staff && ready && !storageError)
          setEditorial((current) => ({
            ...current,
            status: 'pending',
            feedback: '',
          }));
      },
      publish() {
        if (
          role !== 'pastor' ||
          storageError ||
          !ready ||
          validatePublicContent(editorial.draft).length
        )
          return;
        setPublished((current) => ({ ...current, ...editorial.draft }));
        setEditorial((current) => ({
          ...current,
          status: 'published',
          feedback: '',
        }));
      },
      returnDraft(feedback) {
        if (role === 'pastor' && ready)
          setEditorial((current) => ({
            ...current,
            status: 'draft',
            feedback,
          }));
      },
    }),
    [content, ready, storageError, editorial, staff, published, role],
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
      editorial: initialEditorial,
      update: async () => {},
      submit: () => {},
      publish: () => {},
      returnDraft: () => {},
    }
  );
}
