import { useState, useEffect } from 'react';
import { Loader2, Telescope } from 'lucide-react';
import { AppProvider } from './AppContext';
import { AuthProvider, useAuth } from './AuthContext';
import { Layout, type ViewName } from './components/Layout';
import { SignInPage } from './pages/SignInPage';
import { ProfilePage } from './pages/ProfilePage';
import { DashboardPage, LaterPage, ArchivePage } from './pages/DashboardPages';
import { SourcesPage } from './pages/SourcesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { BackupPage } from './pages/BackupPage';
import { SettingsPage } from './pages/SettingsPage';
import { GapAnalysisPage } from './pages/GapAnalysisPage';
import { CandidateProfilePage } from './pages/CandidateProfilePage';

function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-navy-700">
          <Telescope className="w-5 h-5" />
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      </div>
    );
  }

  if (!session) return <SignInPage />;

  return <Finder />;
}

function Finder() {
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
        {view === 'candidate' && <CandidateProfilePage />}
        {view === 'backup' && <BackupPage />}
      </Layout>
    </AppProvider>
  );
}

export default App;
