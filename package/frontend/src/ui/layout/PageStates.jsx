import { Component, useEffect, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { Spinner, Empty } from '../components/feedback.jsx';
import { Button } from '../components/controls.jsx';
import { navigate, paths } from '../../app/router.jsx';

/** First load of a page: nothing for a beat, then a quiet spinner. */
export function PageFallback() {
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), 300); return () => clearTimeout(t); }, []);
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', opacity: show ? 1 : 0, transition: 'opacity 400ms' }}>
      <Spinner size={22} />
    </div>
  );
}

export function NotFound({ title }) {
  const t = useT();
  return (
    <div style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', paddingTop: 'var(--bar-h)' }}>
      <Empty title={title} action={<Button icon="home" onClick={() => navigate(paths.home())}>{t('bar.home')}</Button>} />
    </div>
  );
}

export class PageErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return <NotFound title={String(this.state.error?.message ?? this.state.error)} />;
  }
}
