import { useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { Card, Button, Message } from '../components/ui';
import { Download, Trash2, ShieldAlert } from 'lucide-react';
import { todayISO } from '../storage';

export function BackupPage() {
  const { exportData, importData, clearAll } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState(false);

  const handleExport = () => {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `opportunity-finder-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg('Backup downloaded.');
    setError(false);
    setTimeout(() => setMsg(''), 4000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = importData(text);
      setMsg(`Restored ${count} opportunities.`);
      setError(false);
    } catch (err) {
      setMsg(`Could not restore: ${(err as Error).message}`);
      setError(true);
    }
    if (fileRef.current) fileRef.current.value = '';
    setTimeout(() => setMsg(''), 5000);
  };

  const handleClear = () => {
    if (!confirm('Clear all profile and opportunity data in this browser?'))
      return;
    clearAll();
    setMsg('All data cleared.');
    setError(false);
    setTimeout(() => setMsg(''), 4000);
  };

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Backup and restore</h2>
      <p className="text-xs text-gray-500 mb-5">
        Your data is saved in this browser on this computer. Export a backup file
        regularly, especially before clearing browser data.
      </p>

      <div className="space-y-4">
        <div>
          <Button onClick={handleExport}>
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              Export backup (.json)
            </span>
          </Button>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Restore from backup
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-navy-600 file:text-on-brand hover:file:bg-navy-700 cursor-pointer"
          />
        </div>

        <div className="pt-4 border-t border-gray-100">
          <Button onClick={handleClear} variant="danger">
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Clear all data
            </span>
          </Button>
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            This removes everything stored in this browser. Export a backup first.
          </p>
        </div>

        {msg && <Message type={error ? 'error' : 'success'}>{msg}</Message>}
      </div>
    </Card>
  );
}
