'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
export type ThemeChoice = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{
  choice: ThemeChoice;
  dark: boolean;
  setChoice: (choice: ThemeChoice) => void;
}>({
  choice: 'system',
  dark: false,
  setChoice: () => {},
});
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [systemDark, setSystemDark] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('grace-theme');
      if (saved === 'light' || saved === 'dark') setChoice(saved);
    } catch {
      /* Device preferences remain usable without storage. */
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const change = () => setSystemDark(media.matches);
    change();
    media.addEventListener('change', change);
    setReady(true);
    return () => media.removeEventListener('change', change);
  }, []);
  const dark = choice === 'system' ? systemDark : choice === 'dark';
  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('grace-theme', choice);
    } catch {
      /* Applies for this visit. */
    }
  }, [choice, dark, ready]);
  return (
    <ThemeContext.Provider value={{ choice, dark, setChoice }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
