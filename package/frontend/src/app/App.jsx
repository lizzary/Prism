import { Suspense, ViewTransition, useEffect, useLayoutEffect } from 'react';
import { useSettings } from '../bridge/index.js';
import { I18nProvider } from '../i18n/index.jsx';
import { OverlayProvider, PageMetaProvider, useOverlays } from './shell.jsx';
import { useRoute } from './router.jsx';
import { TopBar } from '../ui/layout/TopBar.jsx';
import { PageErrorBoundary, PageFallback } from '../ui/layout/PageStates.jsx';
import { Toaster } from '../ui/components/feedback.jsx';
import { Overlays } from '../ui/features/Overlays.jsx';
import { HomePage } from '../ui/pages/home/HomePage.jsx';
import { GroupPage } from '../ui/pages/group/GroupPage.jsx';

export function App() {
  const settings = useSettings();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.lang = settings.language;
    try {
      localStorage.setItem('prism.ui.theme', settings.theme);
      localStorage.setItem('prism.ui.lang', settings.language);
    } catch { /* first paint falls back to the defaults */ }
  }, [settings.theme, settings.language]);

  return (
    <I18nProvider lang={settings.language}>
      <Gallery />
      <Toaster />
    </I18nProvider>
  );
}

function Gallery() {
  // one route for the bar and the page: they change in the same commit, so the page transition sees both new
  const route = useRoute();
  return (
    <OverlayProvider>
      <PageMetaProvider>
        <Shortcuts />
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
            {route.name === 'group' && <GroupPage id={route.id} fileId={route.fileId} />}
          </main>
        </ViewTransition>
      </Suspense>
    </PageErrorBoundary>
  );
}

/** Ctrl/Cmd K or "/" opens search anywhere. */
function Shortcuts() {
  const { open } = useOverlays();
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); open('search'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return null;
}
