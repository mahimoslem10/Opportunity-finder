import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit2,
  Trash2,
  RefreshCw,
  ShieldCheck,
  UserCircle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FileWarning,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { Card, Button, Message, textareaClass, selectClass, Tag } from '../components/ui';
import {
  loadCandidateProfile,
  saveCandidateProfile,
  upsertExtraction,
  setClaims,
  updateClaim,
  deleteClaim,
  removeDocData,
} from '../candidate/storage';
import { extractDocument, supportsExtraction } from '../candidate/extract';
import { parseClaims, detectConflicts, applyConflicts } from '../candidate/parser';
import type {
  CandidateProfileData,
  ExtractedClaim,
  ClaimCategory,
  ClaimVerification,
  DocumentExtraction,
  CandidateProfileSummary,
} from '../candidate/types';
import { CATEGORY_LABELS } from '../candidate/types';

const ALL_CATEGORIES: ClaimCategory[] = [
  'summary',
  'education',
  'qualification',
  'certificate',
  'skill',
  'experience',
  'project',
  'research',
  'award',
  'language',
  'other',
];

const VERIFICATION_META: Record<ClaimVerification, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  unverified: { label: 'Unverified', color: 'bg-gray-100 text-gray-600', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: XCircle },
  conflict: { label: 'Conflict', color: 'bg-amber-100 text-amber-800', icon: AlertTriangle },
};

function buildSummary(claims: ExtractedClaim[]): CandidateProfileSummary {
  const byCategory = (cat: ClaimCategory) => claims.filter((c) => c.category === cat);
  const approvedFirst = (a: ExtractedClaim, b: ExtractedClaim) => {
    const order: Record<ClaimVerification, number> = { approved: 0, unverified: 1, conflict: 2, rejected: 3 };
    return order[a.verification] - order[b.verification];
  };
  return {
    summary: byCategory('summary').sort(approvedFirst),
    education: byCategory('education').sort(approvedFirst),
    qualifications: byCategory('qualification').sort(approvedFirst),
    certificates: byCategory('certificate').sort(approvedFirst),
    skills: byCategory('skill').sort(approvedFirst),
    experience: byCategory('experience').sort(approvedFirst),
    projects: byCategory('project').sort(approvedFirst),
    research: byCategory('research').sort(approvedFirst),
    awards: byCategory('award').sort(approvedFirst),
    languages: byCategory('language').sort(approvedFirst),
    other: byCategory('other').sort(approvedFirst),
  };
}

export function CandidateProfilePage() {
  const { data } = useApp();
  const [profile, setProfile] = useState<CandidateProfileData>(() => loadCandidateProfile());
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState('');
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<ClaimCategory>>(new Set(['education', 'experience']));
  const [filterVerification, setFilterVerification] = useState<ClaimVerification | 'all'>('all');
  const [showRejected, setShowRejected] = useState(false);
  useEffect(() => {
    saveCandidateProfile(profile);
  }, [profile]);

  const docById = useMemo(() => {
    const map = new Map<string, typeof data.documents[number]>();
    for (const d of data.documents) map.set(d.id, d);
    return map;
  }, [data.documents]);

  // Clean up claims/extractions for documents that no longer exist
  const effectiveProfile = useMemo(() => {
    const docIds = new Set(data.documents.map((d) => d.id));
    const hasStale =
      Object.keys(profile.extractions).some((id) => !docIds.has(id)) ||
      profile.claims.some((c) => !docIds.has(c.sourceDocId));
    if (!hasStale) return profile;
    let cleaned = profile;
    for (const id of Object.keys(profile.extractions)) {
      if (!docIds.has(id)) cleaned = removeDocData(cleaned, id);
    }
    return cleaned;
  }, [profile, data.documents]);

  const handleExtract = useCallback(
    async (docId: string) => {
      const doc = docById.get(docId);
      if (!doc) return;

      // Reconstruct File from data URL
      let file: File;
      try {
        const res = await fetch(doc.fileUrl);
        const blob = await res.blob();
        file = new File([blob], doc.fileName, { type: doc.fileType });
      } catch {
        setActionError('Could not load the document file for extraction.');
        return;
      }

      if (!supportsExtraction(file)) {
        setProfile((prev) =>
          upsertExtraction(prev, {
            docId,
            status: 'unsupported',
            text: '',
            charCount: 0,
            ocrUsed: false,
            error: 'This file format is not supported for text extraction.',
          })
        );
        return;
      }

      setProcessingIds((prev) => new Set(prev).add(docId));
      setActionError('');

      const extraction = await extractDocument(file, docId);

      setProfile((prev) => {
        let next = upsertExtraction(prev, extraction);
        if (extraction.status === 'extracted') {
          const existingClaims = prev.claims.filter((c) => c.sourceDocId !== docId);
          const newClaims = parseClaims(extraction, { docId, docLabel: doc.label });
          const allClaims = [...existingClaims, ...newClaims];
          const conflicts = detectConflicts(allClaims);
          const withConflicts = applyConflicts(allClaims, conflicts);
          next = setClaims(next, withConflicts);
        }
        return next;
      });

      setProcessingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(docId);
        return copy;
      });

      if (extraction.status === 'extracted') {
        setActionMsg(`Extracted ${extraction.charCount} characters from "${doc.label}".`);
        setTimeout(() => setActionMsg(''), 4000);
      } else if (extraction.status === 'error') {
        setActionError(extraction.error || 'Extraction failed.');
      }
    },
    [docById]
  );

  const handleVerify = (claimId: string, verification: ClaimVerification) => {
    setProfile((prev) => updateClaim(prev, claimId, { verification }));
  };

  const handleDeleteClaim = (claimId: string) => {
    setProfile((prev) => deleteClaim(prev, claimId));
  };

  const handleEditClaim = (claimId: string, newText: string) => {
    setProfile((prev) =>
      updateClaim(prev, claimId, { text: newText, evidence: newText })
    );
    setEditingClaimId(null);
  };

  const handleReclassify = (claimId: string, category: ClaimCategory) => {
    setProfile((prev) => updateClaim(prev, claimId, { category }));
  };

  const toggleSection = (cat: ClaimCategory) => {
    setExpandedSections((prev) => {
      const copy = new Set(prev);
      if (copy.has(cat)) copy.delete(cat);
      else copy.add(cat);
      return copy;
    });
  };

  const summary = useMemo(() => buildSummary(effectiveProfile.claims), [effectiveProfile.claims]);

  const stats = useMemo(() => {
    const total = effectiveProfile.claims.length;
    const approved = effectiveProfile.claims.filter((c) => c.verification === 'approved').length;
    const unverified = effectiveProfile.claims.filter((c) => c.verification === 'unverified').length;
    const conflicts = effectiveProfile.claims.filter((c) => c.verification === 'conflict').length;
    const rejected = effectiveProfile.claims.filter((c) => c.verification === 'rejected').length;
    return { total, approved, unverified, conflicts, rejected };
  }, [effectiveProfile.claims]);

  const extractionsArray = useMemo(
    () => data.documents.map((d) => effectiveProfile.extractions[d.id]).filter(Boolean),
    [data.documents, effectiveProfile.extractions]
  );

  const extractionStats = useMemo(() => {
    const extracted = extractionsArray.filter((e) => e.status === 'extracted').length;
    const processing = extractionsArray.filter((e) => e.status === 'processing').length;
    const errors = extractionsArray.filter((e) => e.status === 'error' || e.status === 'unsupported').length;
    const pending = data.documents.length - extractionsArray.length;
    return { extracted, processing, errors, pending, total: data.documents.length };
  }, [extractionsArray, data.documents.length]);

  // Missing info detection
  const missingInfo = useMemo(() => {
    const cats = new Set(effectiveProfile.claims.map((c) => c.category));
    const missing: string[] = [];
    for (const cat of ['education', 'experience', 'skill', 'language'] as ClaimCategory[]) {
      if (!cats.has(cat)) missing.push(CATEGORY_LABELS[cat]);
    }
    return missing;
  }, [effectiveProfile.claims]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <UserCircle className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">Candidate Profile</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Build a structured profile from your uploaded documents. Text is extracted on your device —
          nothing is sent to any server or AI. Review each claim, approve what's accurate, and resolve
          any conflicts.
        </p>

        {/* Privacy banner */}
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-4 h-4 text-green-700" />
            <p className="text-xs font-semibold text-green-800">Local processing only</p>
          </div>
          <p className="text-xs text-green-900">
            All text extraction and claim parsing happens in your browser. Your documents and profile
            data are never uploaded automatically. Any external AI use requires your explicit approval
            per task.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatBox label="Documents" value={data.documents.length} icon={FileText} color="navy" />
          <StatBox label="Extracted" value={extractionStats.extracted} icon={CheckCircle2} color="green" />
          <StatBox label="Claims" value={stats.total} icon={Sparkles} color="navy" />
          <StatBox label="Approved" value={stats.approved} icon={CheckCircle2} color="green" />
          <StatBox label="Conflicts" value={stats.conflicts} icon={AlertTriangle} color="amber" />
        </div>
      </Card>

      {/* Missing info / conflicts alert */}
      {(missingInfo.length > 0 || stats.conflicts > 0) && (
        <Card>
          {stats.conflicts > 0 && (
            <div className="flex items-start gap-2.5 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  {stats.conflicts} conflicting claim{stats.conflicts !== 1 ? 's' : ''} detected
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Review and approve the correct version. Conflicts arise when the same type of
                  information has different dates across documents.
                </p>
              </div>
            </div>
          )}
          {missingInfo.length > 0 && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <FileWarning className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-blue-800">
                  No information found for: {missingInfo.join(', ')}
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Upload documents in those categories and run extraction to fill in the gaps.
                </p>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Document inventory */}
      <Card>
        <h3 className="text-sm font-bold text-gray-900 mb-1">Document inventory</h3>
        <p className="text-xs text-gray-500 mb-4">
          Run text extraction on each document to build your profile. Click "Extract" to start.
        </p>

        {data.documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No documents yet. Upload your CV, certificates, and transcripts on the Documents page.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.documents.map((doc) => {
              const extraction = effectiveProfile.extractions[doc.id];
              const isProcessing = processingIds.has(doc.id);
              const status = extraction?.status ?? 'pending';
              const claimCount = effectiveProfile.claims.filter((c) => c.sourceDocId === doc.id).length;

              return (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-navy-100 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-navy-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.label}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {doc.fileName} · {doc.uploadedOn}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <ExtractionStatusBadge status={status} />
                        {status === 'extracted' && (
                          <span className="text-[11px] text-gray-500">
                            {extraction.charCount} chars · {claimCount} claims
                            {extraction.ocrUsed && ' · OCR'}
                          </span>
                        )}
                        {status === 'error' && extraction?.error && (
                          <span className="text-[11px] text-red-600">{extraction.error}</span>
                        )}
                        {status === 'unsupported' && extraction?.error && (
                          <span className="text-[11px] text-amber-700">{extraction.error}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => handleExtract(doc.id)}
                      disabled={isProcessing}
                      className="px-3 py-1.5 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 transition-colors text-xs font-medium disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {isProcessing ? 'Extracting...' : status === 'extracted' ? 'Re-extract' : 'Extract'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {actionMsg && <Message>{actionMsg}</Message>}
        {actionError && <Message type="error">{actionError}</Message>}
      </Card>

      {/* Profile sections */}
      {effectiveProfile.claims.length > 0 && (
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 className="text-sm font-bold text-gray-900">Extracted profile</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={filterVerification}
                onChange={(e) => setFilterVerification(e.target.value as ClaimVerification | 'all')}
                className={`${selectClass} !w-auto !py-1.5 text-xs`}
              >
                <option value="all">All claims</option>
                <option value="unverified">Unverified</option>
                <option value="approved">Approved</option>
                <option value="conflict">Conflicts</option>
                <option value="rejected">Rejected</option>
              </select>
              <button
                onClick={() => setShowRejected((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-800"
              >
                {showRejected ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {showRejected ? 'Hide rejected' : 'Show rejected'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {ALL_CATEGORIES.map((cat) => {
              const sectionClaims = summary[summaryKey(cat)].filter((c) => {
                if (filterVerification !== 'all' && c.verification !== filterVerification) return false;
                if (!showRejected && c.verification === 'rejected') return false;
                return true;
              });
              if (sectionClaims.length === 0) return null;
              const isExpanded = expandedSections.has(cat);

              return (
                <div key={cat} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(cat)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                      <span className="text-sm font-semibold text-gray-900">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      <Tag>{sectionClaims.length}</Tag>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      {sectionClaims.filter((c) => c.verification === 'approved').length > 0 && (
                        <span className="text-green-600">
                          {sectionClaims.filter((c) => c.verification === 'approved').length} approved
                        </span>
                      )}
                      {sectionClaims.filter((c) => c.verification === 'conflict').length > 0 && (
                        <span className="text-amber-700">
                          {sectionClaims.filter((c) => c.verification === 'conflict').length} conflict
                        </span>
                      )}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="divide-y divide-gray-100">
                      {sectionClaims.map((claim) => (
                        <ClaimRow
                          key={claim.id}
                          claim={claim}
                          isEditing={editingClaimId === claim.id}
                          onEdit={() => setEditingClaimId(claim.id)}
                          onSaveEdit={(text) => handleEditClaim(claim.id, text)}
                          onCancelEdit={() => setEditingClaimId(null)}
                          onVerify={(v) => handleVerify(claim.id, v)}
                          onDelete={() => handleDeleteClaim(claim.id)}
                          onReclassify={(c) => handleReclassify(claim.id, c)}
                          allClaims={effectiveProfile.claims}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {effectiveProfile.claims.length === 0 && data.documents.length > 0 && (
        <Card>
          <div className="text-center py-8">
            <Sparkles className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No claims extracted yet. Click "Extract" on a document above to start building your
              candidate profile.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function summaryKey(cat: ClaimCategory): keyof CandidateProfileSummary {
  if (cat === 'summary') return 'summary';
  if (cat === 'education') return 'education';
  if (cat === 'qualification') return 'qualifications';
  if (cat === 'certificate') return 'certificates';
  if (cat === 'skill') return 'skills';
  if (cat === 'experience') return 'experience';
  if (cat === 'project') return 'projects';
  if (cat === 'research') return 'research';
  if (cat === 'award') return 'awards';
  if (cat === 'language') return 'languages';
  return 'other';
}

interface StatBoxProps {
  label: string;
  value: number;
  icon: typeof FileText;
  color: 'navy' | 'green' | 'amber';
}

function StatBox({ label, value, icon: Icon, color }: StatBoxProps) {
  const colors = {
    navy: 'bg-navy-50 text-navy-700 border-navy-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`p-3 rounded-lg border text-center ${colors[color]}`}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function ExtractionStatusBadge({ status }: { status: DocumentExtraction['status'] }) {
  const map = {
    pending: { label: 'Not extracted', cls: 'bg-gray-100 text-gray-600' },
    processing: { label: 'Processing', cls: 'bg-blue-100 text-blue-700' },
    extracted: { label: 'Extracted', cls: 'bg-green-100 text-green-700' },
    unsupported: { label: 'Unsupported', cls: 'bg-amber-100 text-amber-800' },
    error: { label: 'Error', cls: 'bg-red-100 text-red-700' },
  };
  const { label, cls } = map[status];
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>{label}</span>;
}

interface ClaimRowProps {
  claim: ExtractedClaim;
  isEditing: boolean;
  onEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onVerify: (v: ClaimVerification) => void;
  onDelete: () => void;
  onReclassify: (c: ClaimCategory) => void;
  allClaims: ExtractedClaim[];
}

function ClaimRow({
  claim,
  isEditing,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onVerify,
  onDelete,
  onReclassify,
  allClaims,
}: ClaimRowProps) {
  const [editText, setEditText] = useState(claim.text);
  const [showEvidence, setShowEvidence] = useState(false);
  const vMeta = VERIFICATION_META[claim.verification];
  const VIcon = vMeta.icon;
  const conflictingClaims = claim.conflictIds
    .map((id) => allClaims.find((c) => c.id === id))
    .filter(Boolean) as ExtractedClaim[];

  useEffect(() => {
    setEditText(claim.text);
  }, [claim.text]);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className={textareaClass + ' text-sm'}
                rows={3}
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => onSaveEdit(editText.trim())}
                  className="!py-1.5 !px-3 !text-xs"
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={onCancelEdit}
                  className="!py-1.5 !px-3 !text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-900">{claim.text}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${vMeta.color}`}>
                  <VIcon className="w-3 h-3" />
                  {vMeta.label}
                </span>
                <span className="text-[11px] text-gray-500">
                  Source: {claim.sourceDocLabel}
                </span>
                {claim.metadata?.date && (
                  <span className="text-[11px] text-gray-500">
                    Date: {claim.metadata.date}
                  </span>
                )}
                {claim.metadata?.institution && (
                  <span className="text-[11px] text-gray-500">
                    {claim.metadata.institution}
                  </span>
                )}
                <select
                  value={claim.category}
                  onChange={(e) => onReclassify(e.target.value as ClaimCategory)}
                  className="text-[11px] rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-gray-600"
                  aria-label="Reclassify claim"
                >
                  {ALL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Conflicts */}
      {conflictingClaims.length > 0 && (
        <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-[11px] font-semibold text-amber-800 mb-1">
            Conflicting information:
          </p>
          {conflictingClaims.map((cc) => (
            <p key={cc.id} className="text-[11px] text-amber-900 ml-3">
              "{cc.text}" — from {cc.sourceDocLabel}
            </p>
          ))}
        </div>
      )}

      {/* Evidence toggle */}
      {!isEditing && (
        <button
          onClick={() => setShowEvidence((v) => !v)}
          className="mt-2 text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          {showEvidence ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showEvidence ? 'Hide evidence' : 'Show evidence'}
        </button>
      )}
      {showEvidence && !isEditing && (
        <p className="mt-1.5 p-2.5 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-gray-600 font-mono whitespace-pre-wrap">
          {claim.evidence}
        </p>
      )}

      {/* Action buttons */}
      {!isEditing && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {claim.verification !== 'approved' && (
            <button
              onClick={() => onVerify('approved')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors text-[11px] font-medium"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Approve
            </button>
          )}
          {claim.verification !== 'rejected' && (
            <button
              onClick={() => onVerify('rejected')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors text-[11px] font-medium"
            >
              <XCircle className="w-3.5 h-3.5" />
              Reject
            </button>
          )}
          {claim.verification === 'conflict' && (
            <button
              onClick={() => onVerify('approved')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors text-[11px] font-medium"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolve as correct
            </button>
          )}
          {claim.verification !== 'unverified' && (
            <button
              onClick={() => onVerify('unverified')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-[11px] font-medium"
            >
              Reset
            </button>
          )}
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-[11px] font-medium"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors text-[11px] font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
