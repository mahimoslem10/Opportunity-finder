import { useState, useEffect } from 'react';
import { AppProvider } from './AppContext';
import { Layout, type ViewName } from './components/Layout';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage, LaterPage, ArchivePage } from './pages/DashboardPages';
import { SourcesPage } from './pages/SourcesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { BackupPage } from './pages/BackupPage';
import { SettingsPage } from './pages/SettingsPage';
import { GapAnalysisPage } from './pages/GapAnalysisPage';

function App() {
  const [view, setView] = useState<ViewName>(() => {
    const saved = localStorage.getItem('oppFinder.lastView') as ViewName | null;
    return saved && saved !== 'add' ? saved : 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('oppFinder.lastView', view);
  }, [view]);

  const handleNavigate = (v: ViewName) => {
    setView(v);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AppProvider>
      <Layout currentView={view} onNavigate={handleNavigate}>
        {view === 'profile' && <ProfilePage />}
        {view === 'dashboard' && <DashboardPage />}
        {view === 'later' && <LaterPage />}
        {view === 'archive' && <ArchivePage />}
        {view === 'sources' && <SourcesPage />}
        {view === 'documents' && <DocumentsPage />}
        {view === 'settings' && <SettingsPage />}
        {view === 'gapanalysis' && <GapAnalysisPage />}
        {view === 'backup' && <BackupPage />}
      </Layout>
    </AppProvider>
  );
}

export default App;
