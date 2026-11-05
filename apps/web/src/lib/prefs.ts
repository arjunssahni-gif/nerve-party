import { useEffect, useState } from 'react';
import { load, save } from './storage';

export interface Prefs {
  reducedMotion: boolean;
}

const KEY = 'np.prefs.v1';
const defaults: Prefs = { reducedMotion: false };

export function usePrefs(): [Prefs, (p: Partial<Prefs>) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...defaults, ...load<Partial<Prefs>>(KEY, {}) }));
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  }, [prefs.reducedMotion]);
  return [
    prefs,
    (p) =>
      setPrefs((old) => {
        const next = { ...old, ...p };
        save(KEY, next);
        return next;
      }),
  ];
}

/** True if the OS asks for reduced motion or the in-app toggle is on. */
export function useReducedMotion(pref: boolean): boolean {
  const [os, setOs] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setOs(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return pref || os;
}
