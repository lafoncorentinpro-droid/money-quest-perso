import { useEffect, useRef, useState } from 'react';
import { goalBalance } from './domain/finance';
import { ChartsPage } from './pages/Charts';
import { Home } from './pages/Home';
import { Money } from './pages/Money';
import { Profile } from './pages/Profile';
import { useStore } from './store/store';
import { Mascot, MascotPicker } from './ui/Mascot';
import { go, useRoute } from './ui/router';
import { SheetsProvider, useSheets } from './ui/sheets';
import { Icon } from './ui/Icon';
import { Splash } from './ui/Splash';

const TABS = [
  { id: 'accueil', label: 'Accueil', icon: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /> },
  {
    id: 'argent',
    label: 'Mon Argent',
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <path d="M16 12.5h2M3 10h18" />
      </>
    )
  },
];

/** Barre du bas : Accueil · bouton + au centre · Mon Argent (maquettes). */
function TabBar({ current, onAdd }: { current: string; onAdd: () => void }) {
  const { period, setMonth } = useStore();
  const tab =(t: (typeof TABS)[number]) => (
    <a
      key={t.id}
      href={`#/${t.id}`}
      className="tab"
      onClick={t.id === 'accueil' ? () => setMonth(period) : undefined}
      aria-current={current === t.id ? 'page' : undefined}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {t.icon}
      </svg>
      {t.label}
    </a>
  );
  return (
    <nav className="tabbar" aria-label="Navigation principale">
      <div className="tabbar-inner">
        {tab(TABS[0])}
        <div className="tab-center">
          <button type="button" className="fab" aria-label="Ajouter une opération" onClick={onAdd}>
            <Icon name="plus" size={30} strokeWidth={2.4} />
          </button>
        </div>
        {tab(TABS[1])}
      </div>
    </nav>
  );
}

interface Celebration {
  title: string;
  text: string;
}

function Celebrate({ c, onClose }: { c: Celebration; onClose: () => void }) {
  const { data } = useStore();
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={c.title} onClick={onClose}>
      <div className="card stack" onClick={(e) => e.stopPropagation()}>
        <div className="sparkles" aria-hidden>
          ✨ ⭐ ✨
        </div>
        <div style={{ display: 'grid', placeItems: 'center' }}>
          <Mascot id={data.settings.mascot} size={110} hello animate={data.settings.animations} />
        </div>
        <h2>{c.title}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {c.text}
        </p>
        <button type="button" className="btn btn-primary" onClick={onClose} autoFocus>
          Continuer
        </button>
      </div>
    </div>
  );
}

/** Détecte niveaux et objectifs atteints pour une célébration douce (désactivable via les animations). */
function useCelebrations(): [Celebration | null, () => void] {
  const { data } = useStore();
  const [queue, setQueue] = useState<Celebration[]>([]);
  const reached = useRef<Set<string> | null>(null);

  useEffect(() => {
    const now = new Set(data.goals.filter((g) => g.target > 0 && goalBalance(g.id, data.movements) >= g.target).map((g) => g.id));
    if (reached.current) {
      for (const id of now) {
        if (!reached.current.has(id)) {
          const g = data.goals.find((x) => x.id === id)!;
          setQueue((q) => [...q, { title: 'Objectif atteint !', text: `Ton objectif « ${g.name} » est atteint. Bravo pour ta régularité !` }]);
        }
      }
    }
    reached.current = now;
  }, [data.goals, data.movements]);

  return [queue[0] ?? null, () => setQueue((q) => q.slice(1))];
}

/** Profondeur d'un écran : sert à choisir le sens de l'animation (plus loin = depuis la droite). */
function depth(tab?: string, sub?: string): number {
  if (!tab || tab === 'accueil') return 0;
  if (tab === 'argent') return sub ? 2 : 1;
  return 2;
}

function useDirection(tab?: string, sub?: string): 'fwd' | 'back' {
  const prev = useRef(depth(tab, sub));
  const dir = useRef<'fwd' | 'back'>('fwd');
  const key = (tab ?? '') + '/' + (sub ?? '');
  const lastKey = useRef(key);
  if (lastKey.current !== key) {
    const d = depth(tab, sub);
    dir.current = d >= prev.current ? 'fwd' : 'back';
    prev.current = d;
    lastKey.current = key;
  }
  return dir.current;
}

function Shell() {
  const route = useRoute();
  const { data, storageMessage, saveError } = useStore();
  const open = useSheets();
  const [celebration, next] = useCelebrations();
  const [tab, sub, arg] = route;
  const dir = useDirection(tab, sub);

  useEffect(() => {
    document.documentElement.dataset.theme = data.settings.theme === 'auto' ? '' : data.settings.theme;
    if (data.settings.theme === 'auto') delete document.documentElement.dataset.theme;
    document.body.classList.toggle('no-anim', !data.settings.animations);
  }, [data.settings.theme, data.settings.animations]);

  useEffect(() => {
    if (!TABS.some((t) => t.id === tab) && tab !== 'reglages' && tab !== 'graphiques') go('accueil');
  }, [tab]);

  let page;
  switch (tab) {
    case 'argent':
      page = <Money sub={sub} arg={arg} />;
      break;
    case 'graphiques':
      page = <ChartsPage />;
      break;
    case 'reglages':
      page = <Profile />;
      break;
    default:
      page = <Home />;
  }

  return (
    <>
      <main className="app">
        {storageMessage && <div className="notice notice-warn small" style={{ marginBottom: 12 }}>{storageMessage}</div>}
        {saveError && (
          <div className="notice notice-warn small" role="alert" style={{ marginBottom: 12 }}>
            {saveError}
          </div>
        )}
        <div key={tab + (sub ?? '')} className={`route-enter route-${dir}`}>
          {page}
        </div>
      </main>
      <TabBar current={tab === 'argent' ? 'argent' : 'accueil'} onAdd={() => open({ kind: 'quick' })} />
      {!data.settings.mascot && <MascotPicker />}
      <Splash animations={data.settings.animations} mascot={data.settings.mascot} />
      {celebration && data.settings.animations && <Celebrate c={celebration} onClose={next} />}
      {celebration && !data.settings.animations && <AutoSkip onSkip={next} />}
    </>
  );
}

function AutoSkip({ onSkip }: { onSkip: () => void }) {
  const { toast } = useStore();
  useEffect(() => {
    toast('🎉 Bravo !', 'level');
    onSkip();
  }, [onSkip, toast]);
  return null;
}

export function App() {
  return (
    <SheetsProvider>
      <Shell />
    </SheetsProvider>
  );
}
