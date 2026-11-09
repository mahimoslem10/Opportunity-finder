import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../ThemeContext';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="group"
      aria-label="Theme"
      className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-on-brand/30"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            title={`${label} theme`}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-brand ${
              active
                ? 'bg-white text-navy-700 shadow-sm'
                : 'text-on-brand hover:bg-on-brand/10'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden md:inline">{label}</span>
            <span className="sr-only md:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
