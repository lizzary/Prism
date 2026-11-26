import { Suspense, ViewTransition, useEffect, useLayoutEffect, useState } from 'react';
import { useAccess, usePresenceClock, useSetting } from '../bridge/index.js';
import { I18nProvider } from '../i18n/index.jsx';
import { OverlayProvider, PageMetaProvider, useOverlays } from './shell.jsx';
import { useRoute } from './router.jsx';
import { TopBar } from '../ui/layout/TopBar.jsx';
import { PageErrorBoundary, PageFallback } from '../ui/layout/PageStates.jsx';
import { Toaster } from '../ui/components/feedback.jsx';
import { Overlays } from '../ui/features/Overlays.jsx';
import { HomePage } from '../ui/pages/home/HomePage.jsx';
import { GroupPage } from '../ui/pages/group/GroupPage.jsx';
import { LoginPage } from '../ui/pages/login/LoginPage.jsx';

export function App() {
  // a new language relabels everything; the theme only reaches the document (DocumentSync), so it re-renders nothing else
  const language = useSetting('language');
  return (
    <I18nProvider lang={language}>
      <DocumentSync />
      <Gate />
      <Toaster />
    </I18nProvider>
  );
}

/** The document follows the theme and language settings, and remembers them for the first paint of the next visit. */
function DocumentSync() {
  const theme = useSetting('theme');
  const language = useSetting('language');
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.lang = language;
    try {
      localStorage.setItem('prism.ui.theme', theme);
      localStorage.setItem('prism.ui.lang', language);
    } catch { /* first paint falls back to the defaults */ }
  }, [theme, language]);
  return null;
}

/**
 * With password login on, the gallery opens only for a signed-in session. After a successful sign-in the login page
 * stays a moment longer to settle into the home page (`opening`), then hands over.
 */
function Gate() {
  const { locked } = useAccess();
  const [phase, setPhase] = useState(locked ? 'login' : 'gallery');
  if (locked && phase !== 'login') setPhase('login');
  if (phase === 'login') return <LoginPage opening={!locked} onOpened={() => setPhase('gallery')} />;
  return <Gallery />;
}

function Gallery() {
  // one route for the bar and the page: they change in the same commit, so the page transition sees both new
  const route = useRoute();
  // time spent in Prism, for the activity record of the statistics page
  usePresenceClock();
  return (
    <OverlayProvider>
      <PageMetaProvider>
        <Shortcuts route={route} />
        <FirstRun />
        <TopBar route={route} />
        <Pages route={route} />
        <Overlays />
      </PageMetaProvider>
    </OverlayProvider>
  );
}

function Pages({ route }) {
  useLayoutEffect(() => { window.scrollTo(0, route.scroll ?? 0); }, [route.key, route.scroll]);
  return (
    <PageErrorBoundary resetKey={route.key}>
      <Suspense fallback={<PageFallback />}>
        <ViewTransition key={route.key} default="none" enter="page-in" exit="page-out">
          <main>
            {route.name === 'home' && <HomePage />}
            {route.name === 'group' && <GroupPage id={route.id} fileId={route.fileId} board={route.board} />}
          </main>
        </ViewTransition>
      </Suspense>
    </PageErrorBoundary>
  );
}

/** The first launch walks through the setup before anything else. */
function FirstRun() {
  const { firstRun } = useAccess();
  const { open } = useOverlays();
  useEffect(() => { if (firstRun) open('welcome'); }, [firstRun, open]);
  return null;
}

/**
 * Ctrl/Cmd K or "/" opens search anywhere — on a group's page it looks inside that group, like the bar's search.
 * The lightbox keeps its keys to itself.
 */
function Shortcuts({ route }) {
  const { open } = useOverlays();
  const groupId = route.name === 'group' ? route.id : null;
  const inLightbox = !!route.fileId;
  useEffect(() => {
    if (inLightbox) return undefined;
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open('search', { groupId }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, groupId, inLightbox]);
  return null;
}
