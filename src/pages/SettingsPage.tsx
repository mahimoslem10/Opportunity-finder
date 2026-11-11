import { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, Power, RefreshCw, Loader2, ShieldCheck, Trash2, Sparkles } from 'lucide-react';
import { Card, Field, Button, Message, inputClass, selectClass } from '../components/ui';
import { loadAISettings, saveAISettings, type AISettings, type AIProvider } from '../ai/storage';
import { fetchModels, validateEndpoint, GEMINI_MODEL } from '../ai/aiClient';

export function SettingsPage() {
  const [settings, setSettings] = useState<AISettings>(() => loadAISettings());
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [endpointError, setEndpointError] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadAISettings();
    setSettings(loaded);
  }, []);

  const handleChange = (key: keyof AISettings, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const doFetchModels = useCallback(
    async (s: AISettings) => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const list = await fetchModels(s);
        setModels(list);
        if (list.length > 0 && !list.includes(s.model)) {
          handleChange('model', list[0]);
        }
      } catch (err) {
        setModelsError(err instanceof Error ? err.message : 'Could not fetch models');
        setModels([]);
      } finally {
        setModelsLoading(false);
      }
    },
    []
  );

  const canFetchModels =
    settings.endpoint.trim() !== '' && settings.apiKey.trim() !== '';

  const handleFetchModels = () => doFetchModels(settings);

  const isGemini = settings.provider === 'gemini';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const issue = settings.endpoint.trim() ? validateEndpoint(settings.endpoint) : null;
    setEndpointError(issue);
    if (issue) return;
    saveAISettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleProviderChange = (provider: AIProvider) => {
    setSettings((prev) => ({ ...prev, provider }));
    setModels([]);
    setModelsError(null);
    setEndpointError(null);
  };

  const handleRemoveKey = () => {
    const cleared: AISettings = { ...settings, apiKey: '', enabled: false };
    setSettings(cleared);
    setModels([]);
    setEndpointError(null);
    saveAISettings(cleared);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 mb-1">AI settings</h2>
      <p className="text-xs text-gray-500 mb-4">
        Choose how AI features work. Gemini runs entirely on the server with a
        private API key — your key never enters the browser. The OpenAI-compatible
        option stores the key in this browser only.
      </p>

      {/* Provider selection */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
          AI provider
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleProviderChange('gemini')}
            className={`p-3 rounded-lg border text-left transition-colors ${
              isGemini
                ? 'border-navy-500 bg-navy-50 ring-1 ring-navy-300'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-navy-600" />
              <span className="text-sm font-medium text-gray-900">Gemini (server-side)</span>
            </div>
            <p className="text-xs text-gray-500">Key stays on the server. Privacy-first.</p>
          </button>
          <button
            type="button"
            onClick={() => handleProviderChange('openai-compatible')}
            className={`p-3 rounded-lg border text-left transition-colors ${
              !isGemini
                ? 'border-navy-500 bg-navy-50 ring-1 ring-navy-300'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900">OpenAI-compatible</span>
            </div>
            <p className="text-xs text-gray-500">Bring your own endpoint and key.</p>
          </button>
        </div>
      </div>

      {isGemini && (
        <div className="mb-4 p-3 rounded-lg bg-navy-50 border border-navy-200">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-navy-700" />
            <p className="text-xs font-semibold text-navy-800">Gemini privacy controls</p>
          </div>
          <ul className="text-xs text-navy-900 space-y-1 list-disc pl-4">
            <li>The Gemini API key is stored only on the server. It is never visible in the browser, in network requests, or in the app code.</li>
            <li>By default, Gemini is used only for public information like scholarship details and eligibility requirements.</li>
            <li>Your CV, certificates, documents, and personal profile are never sent automatically.</li>
            <li>If a task needs personal information, you will see exactly what will be sent and must approve it each time.</li>
            <li>Uses the free Gemini tier ({GEMINI_MODEL}). No billing or paid upgrades.</li>
          </ul>
        </div>
      )}

      {!isGemini && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-4 h-4 text-green-700" />
            <p className="text-xs font-semibold text-green-800">Privacy and safety</p>
          </div>
          <ul className="text-xs text-green-900 space-y-1 list-disc pl-4">
            <li>An AI fit check sends the opportunity details and a summary of your profile (education, field, country, skills, languages, interests) to your provider.</li>
            <li>Your university name and your uploaded documents are never sent.</li>
            <li>The API key is saved in this browser only. Anyone using this browser can read it, so remove it on shared computers.</li>
            <li>Set a spending limit on your API key with your provider.</li>
          </ul>
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-gray-50 border border-gray-100">
          <button
            type="button"
            onClick={() => handleChange('enabled', !settings.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              settings.enabled ? 'bg-accent-500' : 'bg-gray-300'
            }`}
            aria-label="Toggle AI"
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
          <div className="flex items-center gap-2">
            <Power className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              AI {settings.enabled ? 'enabled' : 'disabled'}
            </span>
          </div>
        </div>

        {!isGemini && (
          <div className="grid grid-cols-1 gap-3">
            <Field label="Endpoint URL">
              <input
                value={settings.endpoint}
                onChange={(e) => handleChange('endpoint', e.target.value)}
                placeholder="https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
                className={inputClass}
                type="url"
              />
            </Field>
            {endpointError && <p className="text-xs text-red-600">{endpointError}</p>}

            <Field label="API key">
              <div className="relative">
                <input
                  value={settings.apiKey}
                  onChange={(e) => handleChange('apiKey', e.target.value)}
                  placeholder="sk-..."
                  className={inputClass + ' pr-10'}
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Field label="Model">
              {models.length > 0 ? (
                <div className="flex gap-2">
                  <select
                    value={settings.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                    className={selectClass}
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={modelsLoading || !canFetchModels}
                    className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0 disabled:opacity-50"
                    aria-label="Refresh models"
                  >
                    {modelsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={settings.model}
                    onChange={(e) => handleChange('model', e.target.value)}
                    placeholder="Fetch models or type manually"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={modelsLoading || !canFetchModels}
                    className="px-3 py-2 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 transition-colors flex-shrink-0 text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {modelsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Fetch models
                  </button>
                </div>
              )}
            </Field>
          </div>
        )}

        {isGemini && (
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-xs text-gray-600">
              Model: <span className="font-medium text-gray-900">{GEMINI_MODEL}</span> (free tier)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              The API key is managed on the server. No key is needed here.
            </p>
          </div>
        )}

        {!isGemini && modelsError && (
          <p className="mt-2 text-xs text-red-600">{modelsError}</p>
        )}
        {!isGemini && !canFetchModels && models.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">
            Enter endpoint URL and API key above, then fetch available models.
          </p>
        )}

        <Button type="submit" className="mt-4">
          Save settings
        </Button>
        {saved && <Message>AI settings saved.</Message>}
        {settings.apiKey && !isGemini && (
          <button
            type="button"
            onClick={handleRemoveKey}
            className="mt-4 ml-3 inline-flex items-center gap-1.5 text-xs font-medium text-danger-600 hover:text-danger-700"
          >
            <Trash2 className="w-4 h-4" />
            Remove saved API key
          </button>
        )}
      </form>
    </Card>
  );
}
