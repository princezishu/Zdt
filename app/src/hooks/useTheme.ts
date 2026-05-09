import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'zdt_theme';

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemPreference() : theme;
}

function applyThemeToDOM(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'light';
  });

  const resolved = resolveTheme(theme);

  useEffect(() => {
    applyThemeToDOM(resolved);
  }, [resolved]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyThemeToDOM(resolveTheme('system'));
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage full */
    }
  };

  const toggle = () => {
    const next = resolved === 'light' ? 'dark' : 'light';
    setTheme(next);
  };

  return { theme, resolved, setTheme, toggle } as const;
}
