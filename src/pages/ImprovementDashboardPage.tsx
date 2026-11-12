import { useState, useMemo, useCallback } from 'react';
import {
  Target,
  CheckCircle2,
  Circle,
  AlertTriangle,
  TrendingUp,
  Award,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { Card, Button } from '../components/ui';
import { loadCandidateProfile } from '../candidate/storage';
import { buildCandidateSnapshot } from '../matching/engine';
import {
  runFullAssessment,
  loadImprovementProgress,
  saveImprovementProgress,
} from '../matching/ranking';
import type { ImprovementAction, ImprovementProgress } from '../matching/types';

export function ImprovementDashboardPage() {
  const { data } = useApp();
  const [progress, setProgress] = useState<ImprovementProgress>(() => loadImprovementProgress());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const result = useMemo(() => {
    const candidateData = loadCandidateProfile();
    const snap = buildCandidateSnapshot(data.profile, candidateData.claims);
    return runFullAssessment(data.opportunities, snap, progress);
  }, [data.opportunities, data.profile, progress]);

  const toggleComplete = useCallback((actionId: string) => {
    setProgress((prev) => {
      const next = { ...prev };
      const existing = next[actionId];
      if (existing?.completed) {
        next[actionId] = { ...existing, completed: false, completedOn: undefined };
      } else {
        next[actionId] = { ...existing, completed: true, completedOn: new Date().toISOString() };
      }
      saveImprovementProgress(next);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const total = result.improvements.length;
    const completed = result.improvements.filter((a) => a.completed).length;
    const mandatory = result.improvements.filter((a) => a.mandatory);
    const mandatoryCompleted = mandatory.filter((a) => a.completed).length;
    const remaining = total - completed;
    return { total, completed, remaining, mandatory: mandatory.length, mandatoryCompleted };
  }, [result.improvements]);

  const grouped = useMemo(() => {
    const groups: { label: string; actions: ImprovementAction[] }[] = [
      { label: 'Mandatory — must do before applying', actions: [] },
      { label: 'High priority', actions: [] },
      { label: 'Medium priority', actions: [] },
      { label: 'Low priority', actions: [] },
      { label: 'Completed', actions: [] },
    ];
    for (const action of result.improvements) {
      if (action.completed) {
        groups[4].actions.push(action);
      } else if (action.mandatory) {
        groups[0].actions.push(action);
      } else if (action.priority === 'high') {
        groups[1].actions.push(action);
      } else if (action.priority === 'medium') {
        groups[2].actions.push(action);
      } else {
        groups[3].actions.push(action);
      }
    }
    return groups.filter((g) => g.actions.length > 0);
  }, [result.improvements]);

  if (data.opportunities.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">No improvement plan yet</h2>
          <p className="text-sm text-gray-500">
            Add opportunities to get a personalized improvement roadmap based on your candidate profile.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">Improvement roadmap</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Specific recommendations to strengthen your candidacy, generated from the gap between your
          verified profile and opportunity requirements. Mark items as complete to track your progress.
        </p>

        <div className="p-3 rounded-lg bg-green-50 border border-green-200 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-700 flex-shrink-0" />
            <p className="text-xs text-green-900">
              Recommendations are generated locally from your verified claims and opportunity data.
              No personal information is sent to external services.
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>Overall progress</span>
            <span className="font-bold text-gray-900">
              {stats.completed} / {stats.total} completed
            </span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Total actions" value={stats.total} icon={Target} color="navy" />
          <StatBox label="Completed" value={stats.completed} icon={CheckCircle2} color="green" />
          <StatBox label="Remaining" value={stats.remaining} icon={Circle} color="amber" />
          <StatBox label="Mandatory done" value={`${stats.mandatoryCompleted}/${stats.mandatory}`} icon={AlertTriangle} color="red" />
        </div>
      </Card>

      {/* Action groups */}
      {result.improvements.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <Award className="w-10 h-10 text-green-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-900">
              No improvements needed — your profile is strong across all opportunities.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group, gi) => (
            <Card key={gi}>
              <h3 className="text-sm font-bold text-gray-900 mb-3">{group.label}</h3>
              <div className="space-y-2">
                {group.actions.map((action) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    isExpanded={expandedId === action.id}
                    onToggleExpand={() =>
                      setExpandedId((prev) => (prev === action.id ? null : action.id))
                    }
                    onToggleComplete={() => toggleComplete(action.id)}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({
  action,
  isExpanded,
  onToggleExpand,
  onToggleComplete,
}: {
  action: ImprovementAction;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleComplete: () => void;
}) {
  const priorityColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  };

  return (
    <div
      className={`rounded-lg border transition-colors ${
        action.completed
          ? 'bg-green-50 border-green-200'
          : action.mandatory
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-50 border-gray-200'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-3">
        <button
          onClick={onToggleComplete}
          className={`mt-0.5 flex-shrink-0 transition-colors ${
            action.completed
              ? 'text-green-600 hover:text-green-700'
              : 'text-gray-400 hover:text-gray-600'
          }`}
          aria-label={action.completed ? 'Mark as not done' : 'Mark as done'}
        >
          {action.completed ? (
            <CheckCircle2 className="w-5 h-5" />
          ) : (
            <Circle className="w-5 h-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${action.completed ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {action.gap}
          </p>
          <p className="text-xs text-gray-600 mt-0.5">{action.suggestedAction}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {!action.completed && action.priority !== 'low' && (
              <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${priorityColors[action.priority]}`}>
                {action.priority} priority
              </span>
            )}
            {action.mandatory && !action.completed && (
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-200 text-amber-900">
                Mandatory
              </span>
            )}
            <span className="text-[11px] text-gray-500">
              {action.oppIds.length} opportunity{action.oppIds.length !== 1 ? 's' : ''}
            </span>
            {action.completed && action.completedOn && (
              <span className="text-[11px] text-green-600">
                Completed {new Date(action.completedOn).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onToggleExpand}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
          aria-label="Toggle details"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-1.5">
          <DetailRow label="Why it matters" value={action.whyItMatters} />
          <DetailRow label="Expected benefit" value={action.expectedBenefit} />
          <div>
            <p className="text-[11px] font-semibold text-gray-700 mb-1">Affects opportunities:</p>
            <div className="space-y-0.5">
              {action.oppTitles.map((title, i) => (
                <p key={i} className="text-[11px] text-gray-600 pl-2 border-l-2 border-gray-200">
                  {title}
                </p>
              ))}
            </div>
          </div>
          {action.completed && (
            <button
              onClick={onToggleComplete}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
            >
              <RotateCcw className="w-3 h-3" />
              Mark as not done
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[11px] text-gray-600">
      <span className="font-medium text-gray-700">{label}:</span> {value}
    </p>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: typeof Target;
  color: 'navy' | 'green' | 'amber' | 'red';
}) {
  const colors = {
    navy: 'bg-navy-50 text-navy-700 border-navy-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <div className={`p-3 rounded-lg border text-center ${colors[color]}`}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}
