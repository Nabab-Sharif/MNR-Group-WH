import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Mode = 'light' | 'dark' | 'midnight' | 'nord' | 'sepia' | 'glacier' | 'obsidian'
  | 'aurora-sky' | 'cyberpunk' | 'carbon' | 'mocha' | 'arctic';
export type Accent =
  | 'cyan' | 'sky' | 'indigo' | 'violet' | 'rose'
  | 'emerald' | 'amber' | 'orange' | 'teal' | 'pink'
  | 'royal' | 'midnight' | 'sunset' | 'aurora' | 'coral'
  | 'lime' | 'gold' | 'magenta' | 'crimson' | 'slate'
  | 'mint' | 'lavender' | 'peach' | 'turquoise' | 'plum'
  | 'electric' | 'plasma' | 'radium' | 'titanium'
  | 'neon' | 'holographic' | 'quantum' | 'fusion' | 'prism';

interface ThemeCtx {
  mode: Mode; accent: Accent;
  setMode: (m: Mode) => void; setAccent: (a: Accent) => void;
}

export const MODES: { key: Mode; label: string; swatch: string }[] = [
  { key: 'light',    label: 'Light',    swatch: 'linear-gradient(135deg,#f8fafc,#e2e8f0)' },
  { key: 'dark',     label: 'Dark',     swatch: 'linear-gradient(135deg,#0b1220,#111c2e)' },
  { key: 'midnight', label: 'Midnight', swatch: 'linear-gradient(135deg,#0a1130,#1e3a8a)' },
  { key: 'nord',     label: 'Nord',     swatch: 'linear-gradient(135deg,#2e3440,#88c0d0)' },
  { key: 'sepia',    label: 'Sepia',    swatch: 'linear-gradient(135deg,#f4ecd8,#c79a5b)' },
  { key: 'glacier',  label: 'Glacier',  swatch: 'linear-gradient(135deg,#eaf6fb,#3aa0d8)' },
  { key: 'obsidian', label: 'Obsidian', swatch: 'linear-gradient(135deg,#0a0a0a,#f5c518)' },
  { key: 'aurora-sky', label: 'Aurora Sky', swatch: 'linear-gradient(135deg,#0b1e3f,#5b8def,#a78bfa)' },
  { key: 'cyberpunk',  label: 'Cyberpunk',  swatch: 'linear-gradient(135deg,#1a0033,#ff00aa,#00f0ff)' },
  { key: 'carbon',     label: 'Carbon',     swatch: 'linear-gradient(135deg,#1c1c1e,#3a3a3c,#00d4ff)' },
  { key: 'mocha',      label: 'Mocha',      swatch: 'linear-gradient(135deg,#3b2a20,#a47551,#e7c8a0)' },
  { key: 'arctic',     label: 'Arctic',     swatch: 'linear-gradient(135deg,#f0f9ff,#bae6fd,#0ea5e9)' },
];

export const ACCENTS: { key: Accent; label: string; hsl: string; glow: string }[] = [
  { key: 'cyan',      label: 'Cyan',      hsl: '190 95% 50%', glow: '190 95% 60%' },
  { key: 'sky',       label: 'Sky',       hsl: '205 95% 55%', glow: '205 95% 65%' },
  { key: 'royal',     label: 'Royal Blue',hsl: '220 90% 56%', glow: '220 95% 66%' },
  { key: 'indigo',    label: 'Indigo',    hsl: '235 80% 62%', glow: '235 85% 72%' },
  { key: 'midnight',  label: 'Midnight',  hsl: '245 70% 55%', glow: '245 80% 65%' },
  { key: 'violet',    label: 'Violet',    hsl: '265 80% 65%', glow: '265 85% 75%' },
  { key: 'lavender',  label: 'Lavender',  hsl: '275 70% 70%', glow: '275 80% 80%' },
  { key: 'plum',      label: 'Plum',      hsl: '295 55% 50%', glow: '295 65% 60%' },
  { key: 'magenta',   label: 'Magenta',   hsl: '315 85% 58%', glow: '315 90% 68%' },
  { key: 'pink',      label: 'Pink',      hsl: '330 80% 62%', glow: '330 85% 72%' },
  { key: 'rose',      label: 'Rose',      hsl: '350 85% 60%', glow: '350 90% 70%' },
  { key: 'crimson',   label: 'Crimson',   hsl: '355 75% 50%', glow: '355 85% 60%' },
  { key: 'coral',     label: 'Coral',     hsl: '10 85% 62%',  glow: '10 90% 72%' },
  { key: 'orange',    label: 'Orange',    hsl: '24 95% 58%',  glow: '24 95% 68%' },
  { key: 'peach',     label: 'Peach',     hsl: '30 90% 65%',  glow: '30 95% 75%' },
  { key: 'sunset',    label: 'Sunset',    hsl: '15 90% 55%',  glow: '15 95% 65%' },
  { key: 'amber',     label: 'Amber',     hsl: '40 95% 55%',  glow: '40 95% 65%' },
  { key: 'gold',      label: 'Gold',      hsl: '45 90% 50%',  glow: '45 95% 60%' },
  { key: 'lime',      label: 'Lime',      hsl: '85 75% 48%',  glow: '85 80% 58%' },
  { key: 'emerald',   label: 'Emerald',   hsl: '152 70% 45%', glow: '152 75% 55%' },
  { key: 'mint',      label: 'Mint',      hsl: '160 70% 55%', glow: '160 80% 65%' },
  { key: 'aurora',    label: 'Aurora',    hsl: '170 80% 48%', glow: '170 85% 58%' },
  { key: 'teal',      label: 'Teal',      hsl: '175 75% 45%', glow: '175 80% 55%' },
  { key: 'turquoise', label: 'Turquoise', hsl: '185 85% 45%', glow: '185 90% 55%' },
  { key: 'slate',     label: 'Slate',     hsl: '215 25% 45%', glow: '215 30% 55%' },
  // Ultra-smart accents
  { key: 'electric',  label: 'Electric',  hsl: '195 100% 55%', glow: '195 100% 70%' },
  { key: 'plasma',    label: 'Plasma',    hsl: '305 95% 60%',  glow: '305 100% 72%' },
  { key: 'radium',    label: 'Radium',    hsl: '135 90% 50%',  glow: '135 95% 62%' },
  { key: 'titanium',  label: 'Titanium',  hsl: '210 15% 60%',  glow: '210 20% 72%' },
  // Ultra-modern next-gen accents
  { key: 'neon',         label: 'Neon',         hsl: '155 100% 50%', glow: '155 100% 65%' },
  { key: 'holographic',  label: 'Holographic',  hsl: '280 100% 70%', glow: '320 100% 75%' },
  { key: 'quantum',      label: 'Quantum',      hsl: '230 100% 65%', glow: '260 100% 75%' },
  { key: 'fusion',       label: 'Fusion',       hsl: '20 100% 58%',  glow: '350 100% 68%' },
  { key: 'prism',        label: 'Prism',        hsl: '180 95% 55%',  glow: '210 100% 70%' },
];




const Ctx = createContext<ThemeCtx | null>(null);

const safeGet = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked in preview/private browsers; keep UI working.
  }
};

export const useTheme = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme outside provider');
  return c;
};

const DARK_MODES: Mode[] = ['dark', 'midnight', 'nord', 'obsidian', 'aurora-sky', 'cyberpunk', 'carbon'];

const applyTheme = (mode: Mode, accent: Accent) => {
  const root = document.documentElement;
  root.setAttribute('data-mode', mode);
  root.setAttribute('data-accent', accent);
  const a = ACCENTS.find(x => x.key === accent)!;
  root.style.setProperty('--primary', a.hsl);
  root.style.setProperty('--accent', a.hsl);
  root.style.setProperty('--ring', a.hsl);
  const isDark = DARK_MODES.includes(mode);
  root.style.setProperty('--primary-foreground', isDark ? '215 50% 7%' : '0 0% 100%');
  root.style.setProperty('--accent-foreground', isDark ? '215 50% 7%' : '0 0% 100%');
};


export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<Mode>(() => (safeGet('theme_mode') as Mode) || 'dark');
  const [accent, setAccentState] = useState<Accent>(() => {
    const stored = safeGet('theme_accent') as Accent | null;
    return ACCENTS.some(x => x.key === stored) ? stored : 'cyan';
  });

  useEffect(() => { applyTheme(mode, accent); }, [mode, accent]);

  const setMode = (m: Mode) => { safeSet('theme_mode', m); setModeState(m); };
  const setAccent = (a: Accent) => { safeSet('theme_accent', a); setAccentState(a); };

  return <Ctx.Provider value={{ mode, accent, setMode, setAccent }}>{children}</Ctx.Provider>;
};
