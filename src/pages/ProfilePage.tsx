import { useState, useEffect } from 'react';
import { Plus, X, Sparkles } from 'lucide-react';
import { useApp } from '../AppContext';
import { Card, Field, Button, Message, inputClass, selectClass, textareaClass } from '../components/ui';
import { LEVEL_OPTIONS } from '../constants';
import { loadAIProfileExtras, saveAIProfileExtras, type AIProfileExtras } from '../ai/storage';
import type { Profile } from '../types';

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) {
      onChange([...values, v]);
    }
    setDraft('');
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors flex-shrink-0"
          aria-label="Add tag"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-gray-400 hover:text-gray-600"
                aria-label={`Remove ${v}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function ProfilePage() {
  const { data, saveProfile } = useApp();
  const [form, setForm] = useState<Profile>(data.profile);
  const [extras, setExtras] = useState<AIProfileExtras>(() => loadAIProfileExtras());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(data.profile);
  }, [data.profile]);

  const handleChange = (key: keyof Profile, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtraChange = (key: keyof AIProfileExtras, value: string | string[]) => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfile(form);
    saveAIProfileExtras(extras);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Your profile</h2>
      <p className="text-xs text-gray-500 mb-6">
        Enter your details once here. Dashboard matching, Gap Analysis, and AI
        fit checks all use this page. Saved only on this computer.
      </p>

      <form onSubmit={handleSubmit} className="space-y-8">
        <section>
          <SectionHeading title="About you" hint="Your current study level and school." />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Current level">
              <select
                value={form.currentLevel}
                onChange={(e) => handleChange('currentLevel', e.target.value)}
                className={selectClass}
              >
                {LEVEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Field of study">
              <input
                value={form.field}
                onChange={(e) => handleChange('field', e.target.value)}
                placeholder="e.g. Business Administration (BBA)"
                className={inputClass}
              />
            </Field>
            <Field label="University and country">
              <input
                value={form.university}
                onChange={(e) => handleChange('university', e.target.value)}
                placeholder="e.g. Universiti Teknologi Malaysia, Malaysia"
                className={inputClass}
              />
            </Field>
            <Field label="GPA or grade (with scale)">
              <input
                value={form.gpa}
                onChange={(e) => handleChange('gpa', e.target.value)}
                placeholder="e.g. 3.4 / 4.0"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionHeading title="Languages" hint="Write each language with your level." />
          <Field label="Languages">
            <input
              value={form.languages}
              onChange={(e) => handleChange('languages', e.target.value)}
              placeholder="e.g. English (IELTS 5.5), Malay (basic)"
              className={inputClass}
            />
          </Field>
        </section>

        <section>
          <SectionHeading title="Where you are from" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Citizenship">
              <input
                value={form.citizenship}
                onChange={(e) => handleChange('citizenship', e.target.value)}
                placeholder="e.g. Bangladesh"
                className={inputClass}
              />
            </Field>
            <Field label="Country of residence">
              <input
                value={form.residence}
                onChange={(e) => handleChange('residence', e.target.value)}
                placeholder="e.g. Malaysia"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionHeading
            title="Key dates"
            hint="Use year and month, like 2027-06. Leave blank if you don't know."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Expected graduation">
              <input
                value={form.graduationDate}
                onChange={(e) => handleChange('graduationDate', e.target.value)}
                placeholder="2027-06"
                className={inputClass}
              />
            </Field>
            <Field label="Internship start">
              <input
                value={form.internshipStart}
                onChange={(e) => handleChange('internshipStart', e.target.value)}
                placeholder="2027-06"
                className={inputClass}
              />
            </Field>
            <Field label="Target master's start">
              <input
                value={form.targetMasterStart}
                onChange={(e) => handleChange('targetMasterStart', e.target.value)}
                placeholder="2028-09"
                className={inputClass}
              />
            </Field>
            <Field label="Target PhD start">
              <input
                value={form.targetPhdStart}
                onChange={(e) => handleChange('targetPhdStart', e.target.value)}
                placeholder="2031-09"
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section>
          <SectionHeading title="Skills and experience" />
          <div className="space-y-4">
            <Field label="Skills and tools">
              <textarea
                value={form.skills}
                onChange={(e) => handleChange('skills', e.target.value)}
                placeholder="e.g. Digital marketing, SEO, Microsoft Office, Python"
                className={textareaClass}
              />
            </Field>
            <Field label="Experience and activities">
              <textarea
                value={form.experience}
                onChange={(e) => handleChange('experience', e.target.value)}
                placeholder="e.g. Sales assistant, retail store, 2023. Volunteer teacher, community centre, 2022"
                className={textareaClass}
              />
            </Field>
            <Field label="Preferences and constraints">
              <textarea
                value={form.preferences}
                onChange={(e) => handleChange('preferences', e.target.value)}
                placeholder="e.g. Part-time or remote, fully funded, must start in 2027"
                className={textareaClass}
              />
            </Field>
          </div>
        </section>

        <section className="pt-6 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-900">Extra details for AI fit checks</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Optional. Used only when you run an AI fit check, together with the
            details above. Don't add names, phone numbers, or ID numbers here.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="English test passed?">
              <select
                value={extras.englishTest}
                onChange={(e) => handleExtraChange('englishTest', e.target.value)}
                className={selectClass}
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="Funding preference">
              <input
                value={extras.fundingPreference}
                onChange={(e) => handleExtraChange('fundingPreference', e.target.value)}
                placeholder="e.g. Fully funded only"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Interests">
              <textarea
                value={extras.interests}
                onChange={(e) => handleExtraChange('interests', e.target.value)}
                placeholder="e.g. AI, sustainable energy, public policy"
                className={textareaClass}
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Opportunity types you want">
              <TagInput
                values={extras.wantedOpportunityTypes}
                onChange={(v) => handleExtraChange('wantedOpportunityTypes', v)}
                placeholder="e.g. Scholarship, Internship"
              />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Countries you want to go to">
              <TagInput
                values={extras.wantedCountries}
                onChange={(v) => handleExtraChange('wantedCountries', v)}
                placeholder="e.g. Germany, UK"
              />
            </Field>
          </div>
        </section>

        <div>
          <Button type="submit">Save profile</Button>
          {saved && <Message>Profile saved.</Message>}
        </div>
      </form>
    </Card>
  );
}
