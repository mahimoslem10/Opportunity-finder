import { useMemo, useState } from 'react';
import { useApp } from '../AppContext';
import { applyRules, daysUntil } from '../rules';
import { OpportunityList } from '../components/OpportunityList';
import { Card, selectClass } from '../components/ui';
import type { Opportunity, OpportunityType, Level, OpportunityStatus, Bin } from '../types';

type SortMode = 'deadline' | 'title';

function sortOpportunities(opps: Opportunity[], mode: SortMode): Opportunity[] {
  return [...opps].sort((a, b) => {
    if (mode === 'title') return a.title.localeCompare(b.title);
    const da = a.deadline || '9999-12-31';
    const db = b.deadline || '9999-12-31';
    return da.localeCompare(db);
  });
}

export function DashboardPage() {
  const { data } = useApp();
  const [fType, setFType] = useState<OpportunityType | ''>('');
  const [fLevel, setFLevel] = useState<Level | ''>('');
  const [fStatus, setFStatus] = useState<OpportunityStatus | ''>('');
  const [fSort, setFSort] = useState<SortMode>('deadline');

  const evaluated = useMemo(
    () =>
      data.opportunities.map((opp) => ({
        opp,
        ...applyRules(opp, data.profile),
      })),
    [data.opportunities, data.profile]
  );

  const activeRows = useMemo(() => {
    let rows = evaluated.filter((r) => r.bin === 'active');
    if (fType) rows = rows.filter((r) => r.opp.type === fType);
    if (fLevel) rows = rows.filter((r) => (r.opp.requiredLevel || 'any') === fLevel);
    if (fStatus) rows = rows.filter((r) => r.opp.status === fStatus);
    return sortOpportunities(rows.map((r) => r.opp), fSort);
  }, [evaluated, fType, fLevel, fStatus, fSort]);

  const stats = useMemo(() => {
    const counts = { active: 0, later: 0, archive: 0, closingSoon: 0 };
    for (const r of evaluated) {
      counts[r.bin] += 1;
      if (r.bin === 'active') {
        const days = daysUntil(r.opp.deadline);
        if (days !== null && days >= 0 && days <= 30) counts.closingSoon += 1;
      }
    }
    return counts;
  }, [evaluated]);

  const hasFilters = Boolean(fType || fLevel || fStatus);

  return (
    <Card>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-white border border-gray-200">
          <p className="text-2xl font-bold text-navy-600">{stats.active}</p>
          <p className="text-xs text-gray-500 mt-1">Active now</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-200">
          <p className="text-2xl font-bold text-amber-600">{stats.closingSoon}</p>
          <p className="text-xs text-gray-500 mt-1">Closing in 30 days</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-200">
          <p className="text-2xl font-bold text-gray-700">{stats.later}</p>
          <p className="text-xs text-gray-500 mt-1">Waiting in Later</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-gray-200">
          <p className="text-2xl font-bold text-gray-700">{stats.archive}</p>
          <p className="text-xs text-gray-500 mt-1">In Archive</p>
        </div>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-1">Active opportunities</h2>
      <p className="text-xs text-gray-500 mb-4">
        Open opportunities that fit your profile right now, soonest deadline first.
      </p>
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          aria-label="Filter by type"
          value={fType}
          onChange={(e) => setFType(e.target.value as OpportunityType | '')}
          className={selectClass + ' w-auto min-w-[130px]'}
        >
          <option value="">All types</option>
          <option value="scholarship">Scholarship</option>
          <option value="fellowship">Fellowship</option>
          <option value="internship">Internship</option>
          <option value="job">Job</option>
          <option value="training">Training</option>
          <option value="conference">Conference</option>
          <option value="volunteer">Volunteer</option>
          <option value="grant">Grant</option>
          <option value="competition">Competition</option>
          <option value="program">Program</option>
        </select>
        <select
          aria-label="Filter by level"
          value={fLevel}
          onChange={(e) => setFLevel(e.target.value as Level | '')}
          className={selectClass + ' w-auto min-w-[130px]'}
        >
          <option value="">All levels</option>
          <option value="any">Any</option>
          <option value="bachelor">Bachelor's</option>
          <option value="master">Master's</option>
          <option value="phd">PhD</option>
          <option value="graduate">Completed degree</option>
        </select>
        <select
          aria-label="Filter by status"
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value as OpportunityStatus | '')}
          className={selectClass + ' w-auto min-w-[130px]'}
        >
          <option value="">All statuses</option>
          <option value="interested">Interested</option>
          <option value="applying">Applying</option>
          <option value="applied">Applied</option>
          <option value="interview">Interview</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          aria-label="Sort opportunities"
          value={fSort}
          onChange={(e) => setFSort(e.target.value as SortMode)}
          className={selectClass + ' w-auto min-w-[140px]'}
        >
          <option value="deadline">Sort by deadline</option>
          <option value="title">Sort by title</option>
        </select>
      </div>
      {activeRows.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-sm font-medium text-gray-700">
            {hasFilters ? 'No opportunities match these filters.' : 'No active opportunities right now.'}
          </p>
          {!hasFilters && (
            <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
              Opportunities move to Later when your profile doesn't meet their
              requirements yet, and to Archive when the deadline has passed or
              your country isn't eligible.
            </p>
          )}
        </div>
      ) : (
        <OpportunityList
          opportunities={activeRows}
          profile={data.profile}
          showReasons={false}
        />
      )}
    </Card>
  );
}

export function LaterPage() {
  const { data } = useApp();

  const laterRows = useMemo(() => {
    const rows = data.opportunities
      .map((opp) => ({ opp, ...applyRules(opp, data.profile) }))
      .filter((r) => r.bin === ('later' as Bin));
    return sortOpportunities(rows.map((r) => r.opp), 'deadline');
  }, [data.opportunities, data.profile]);

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Later</h2>
      <p className="text-xs text-gray-500 mb-4">
        Hidden for now because the rules say they aren't a fit yet. Each row
        shows the reason; they move back to Active once the reason no longer
        applies.
      </p>
      <OpportunityList
        opportunities={laterRows}
        profile={data.profile}
        showReasons={true}
      />
    </Card>
  );
}

export function ArchivePage() {
  const { data } = useApp();

  const archiveRows = useMemo(() => {
    const rows = data.opportunities
      .map((opp) => ({ opp, ...applyRules(opp, data.profile) }))
      .filter((r) => r.bin === ('archive' as Bin));
    return sortOpportunities(rows.map((r) => r.opp), 'deadline');
  }, [data.opportunities, data.profile]);

  return (
    <Card>
      <h2 className="text-lg font-bold text-gray-900 mb-1">Archive</h2>
      <p className="text-xs text-gray-500 mb-4">
        Deadline passed or excluded by country.
      </p>
      <OpportunityList
        opportunities={archiveRows}
        profile={data.profile}
        showReasons={true}
      />
    </Card>
  );
}
