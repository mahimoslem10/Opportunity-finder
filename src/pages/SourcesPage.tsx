import { useState } from 'react';
import { useApp } from '../AppContext';
import { Card, Field, Button, Message, inputClass } from '../components/ui';
import { Trash2, PlusCircle, Loader2, RefreshCw, Search, Link2 } from 'lucide-react';
import type { Source } from '../types';
import { isDefaultSource } from '../storage';

export function SourcesPage() {
  const { data, addSource, deleteSource, scrapeSource } = useApp();

  const [sourceForm, setSourceForm] = useState({
    name: '',
    url: '',
  });
  const [sourceMsg, setSourceMsg] = useState('');
  const [scrapingSource, setScrapingSource] = useState<string | null>(null);
  const [scrapeAllLoading, setScrapeAllLoading] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<
    Record<string, { found: number; duplicates: number; error?: string }>
  >({});

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceForm.url.trim()) return;
    const newSource = addSource({
      name: sourceForm.name.trim() || sourceForm.url.trim(),
      url: sourceForm.url.trim(),
      type: 'webpage',
    });
    setSourceForm({ name: '', url: '' });

    setScrapingSource(newSource.id);
    setSourceMsg('Source added. Fetching content...');
    const result = await scrapeSource(newSource);
    setScrapingSource(null);
    if (result.error) {
      setSourceMsg(`Source added. ${result.error}`);
    } else if (result.found === 0) {
      setSourceMsg(`Source added. No new items found.${result.duplicates ? ` ${result.duplicates} already saved.` : ''}`);
    } else {
      setSourceMsg(`Source added. Found ${result.found} new item${result.found !== 1 ? 's' : ''}!`);
    }
    setTimeout(() => setSourceMsg(''), 6000);
  };

  const handleScrapeOne = async (source: Source) => {
    setScrapingSource(source.id);
    const result = await scrapeSource(source);
    setScrapingSource(null);
    setScrapeResults((prev) => ({ ...prev, [source.id]: result }));
    setTimeout(() => {
      setScrapeResults((prev) => {
        const next = { ...prev };
        delete next[source.id];
        return next;
      });
    }, 6000);
  };

  const handleScrapeAll = async () => {
    if (data.sources.length === 0) return;
    setScrapeAllLoading(true);
    let totalFound = 0;
    let errors = 0;
    for (const source of data.sources) {
      setScrapingSource(source.id);
      const result = await scrapeSource(source);
      totalFound += result.found;
      if (result.error) errors++;
      setScrapeResults((prev) => ({ ...prev, [source.id]: result }));
    }
    setScrapingSource(null);
    setScrapeAllLoading(false);
    if (errors > 0 && totalFound === 0) {
      setSourceMsg('Could not fetch from any source.');
    } else if (totalFound === 0) {
      setSourceMsg('No new items found from any source.');
    } else {
      setSourceMsg(`Found ${totalFound} new item${totalFound !== 1 ? 's' : ''} across all sources.`);
    }
    setTimeout(() => {
      setSourceMsg('');
      setScrapeResults({});
    }, 8000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-navy-600" />
            <h2 className="text-lg font-bold text-gray-900">Sources</h2>
          </div>
          {data.sources.length > 0 && (
            <button
              onClick={handleScrapeAll}
              disabled={scrapeAllLoading || scrapingSource !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 transition-colors text-xs font-medium disabled:opacity-50"
            >
              {scrapeAllLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              Fetch all sources
            </button>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Paste any web page URL. The app automatically detects whether it's a blog, opportunity listing, or feed, and adds whatever it finds to your opportunities.
        </p>
        <form onSubmit={handleAddSource}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name (optional)">
              <input
                value={sourceForm.name}
                onChange={(e) =>
                  setSourceForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g. Scholarship Portal"
                className={inputClass}
              />
            </Field>
            <Field label="URL">
              <input
                required
                type="url"
                value={sourceForm.url}
                onChange={(e) =>
                  setSourceForm((prev) => ({ ...prev, url: e.target.value }))
                }
                placeholder="https://example.com/opportunities"
                className={inputClass}
              />
            </Field>
          </div>
          <Button type="submit" className="mt-3">
            <span className="flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4" />
              Add source
            </span>
          </Button>
          {sourceMsg && <Message>{sourceMsg}</Message>}
        </form>

        {data.sources.length > 0 && (
          <div className="mt-5 space-y-2">
            {data.sources.map((source) => {
              const result = scrapeResults[source.id];
              const isScraping = scrapingSource === source.id;
              return (
                <div
                  key={source.id}
                  className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {source.name}
                      </span>
                    </div>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-navy-600 hover:underline truncate block"
                    >
                      {source.url}
                    </a>
                    {result && (
                      <p
                        className={`text-xs mt-1 ${
                          result.error ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {result.error
                          ? result.error
                          : `${result.found} new item${result.found !== 1 ? 's' : ''} found${result.duplicates ? `, ${result.duplicates} already saved` : ''}`}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleScrapeOne(source)}
                      disabled={isScraping || scrapeAllLoading}
                      className="text-navy-600 hover:bg-navy-50 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                      aria-label="Fetch now"
                      title="Fetch now"
                    >
                      {isScraping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                    </button>
                    {isDefaultSource(source.id) ? (
                      <span className="self-center text-[11px] font-medium text-navy-700 bg-navy-50 rounded-full px-2 py-1">
                        Default
                      </span>
                    ) : (
                      <button
                        onClick={() => deleteSource(source.id)}
                        className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 p-1.5 rounded-lg transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data.sources.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm mt-3">
            No sources added yet. Paste a URL above to start fetching.
          </div>
        )}
      </Card>
    </div>
  );
}
