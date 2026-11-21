// The group page: the file browser and the lightbox arrive in stage 3. Until then the route resolves the group,
// tells the top bar where we are, and says plainly that the page is still being built.
import { useGroup } from '../../../bridge/index.js';
import { usePageMeta } from '../../../app/shell.jsx';
import { navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { Button } from '../../components/controls.jsx';
import { Empty } from '../../components/feedback.jsx';
import { NotFound } from '../../layout/PageStates.jsx';

export function GroupPage({ id }) {
  const t = useT();
  const group = useGroup(id);
  usePageMeta({ scope: 'group', groupId: id, overArt: false, crumbs: group ? [{ label: group.name }] : [] });
  if (!group) return <NotFound title={t('group.notFound')} />;
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', paddingTop: 'var(--bar-h)' }}>
      <Empty title={group.name} action={<Button icon="arrow-left" onClick={() => navigate(paths.home())}>{t('bar.home')}</Button>}>
        {t('common.notYet')}
      </Empty>
    </div>
  );
}
