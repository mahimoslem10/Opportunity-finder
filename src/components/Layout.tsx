import {
  User,
  LayoutDashboard,
  Clock,
  Archive,
  Link2,
  FolderOpen,
  DatabaseBackup,
  Download,
  Telescope,
  Settings,
  Target,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/AuthContext';
import { useInstallPrompt } from '../useInstallPrompt';
import { ThemeSwitcher } from './ThemeSwitcher';

export type ViewName =
  | 'profile'
  | 'dashboard'
  | 'later'
  | 'archive'
  | 'sources'
  | 'documents'
  | 'backup'
  | 'settings'
  | 'gapanalysis';

interface NavItem {
  view: ViewName;
  label: string;
  icon: typeof User;
}

const NAV_ITEMS: NavItem[] = [
  { view: 'profile', label: 'Profile', icon: User },
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'later', label: 'Later', icon: Clock },
  { view: 'archive', label: 'Archive', icon: Archive },
  { view: 'sources', label: 'Sources', icon: Link2 },
  { view: 'documents', label: 'Documents', icon: FolderOpen },
  { view: 'settings', label: 'Settings', icon: Settings },
  { view: 'gapanalysis', label: 'Gap Analysis', icon: Target },
  { view: 'backup', label: 'Backup', icon: DatabaseBackup },
];

interface LayoutProps {
  currentView: ViewName;
  onNavigate: (view: ViewName) => void;
  children: React.ReactNode;
}

export function Layout({ currentView, onNavigate, children }: LayoutProps) {
  const { canInstall, promptInstall } = useInstallPrompt();
  const { signOut } = useAuth();

  const sourcesItem: NavItem = {
    view: 'sources',
    label: 'Sources',
    icon: Telescope,
  };

  const allItems = NAV_ITEMS.map((item) =>
    item.view === 'sources' ? sourcesItem : item
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top header */}
      <header className="bg-navy-600 text-on-brand sticky top-0 z-40 shadow-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Telescope className="w-6 h-6 flex-shrink-0" />
            <h1 className="text-base sm:text-lg font-bold truncate">
              Opportunity Finder
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ThemeSwitcher />
            {canInstall && (
              <button
                onClick={promptInstall}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-on-brand/10 hover:bg-on-brand/20 border border-on-brand/30 text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Install app</span>
                <span className="sm:hidden">Install</span>
              </button>
            )}
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-on-brand/10 hover:bg-on-brand/20 border border-on-brand/30 text-sm font-medium transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex max-w-6xl mx-auto px-6 gap-1 pb-2">
          {allItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative ${
                  active
                    ? 'bg-white text-navy-700'
                    : 'text-on-brand/80 hover:bg-on-brand/10 hover:text-on-brand'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {children}
      </main>

      {/* Bottom nav for mobile */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 shadow-lg">
        <div className="flex justify-around items-stretch overflow-x-auto no-scrollbar">
          {allItems.map((item) => {
            const Icon = item.icon;
            const active = currentView === item.view;
            return (
              <button
                key={item.view}
                onClick={() => onNavigate(item.view)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 px-2 flex-1 min-w-[60px] transition-colors relative ${
                  active ? 'text-navy-600' : 'text-gray-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-navy-600 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
