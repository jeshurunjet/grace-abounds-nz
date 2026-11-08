'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
export function ThemeToggle() {
  const { dark, setChoice } = useTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => setChoice(dark ? 'light' : 'dark')}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
