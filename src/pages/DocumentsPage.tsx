import { useState, useRef, useMemo } from 'react';
import { useApp } from '../AppContext';
import { Card, Field, Button, Message, inputClass } from '../components/ui';
import { DOCUMENT_CATEGORIES } from '../constants';
import type { DocumentCategory } from '../types';
import {
  FileText,
  Upload,
  Trash2,
  Loader2,
  ExternalLink,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.txt,.md,.jpg,.jpeg,.png,.webp';
const MAX_SIZE = 4 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPage() {
  const { data, uploadDocument, deleteDocument, updateDocumentCategory } = useApp();
  const opportunitiesUsing = (docId: string) =>
    data.opportunities.filter((o) => o.documentIds.includes(docId)).map((o) => o.title);
  const duplicateIds = useMemo(() => {
    const seen = new Map<string, string>();
    const ids = new Set<string>();
    for (const doc of data.documents) {
      if (!doc.contentHash) continue;
      const firstId = seen.get(doc.contentHash);
      if (firstId) {
        ids.add(doc.id);
        ids.add(firstId);
      } else {
        seen.set(doc.contentHash, doc.id);
      }
    }
    return ids;
  }, [data.documents]);
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [duplicateMsg, setDuplicateMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setErrorMsg('File is too large. Maximum size is 4 MB for local storage.');
      setSelectedFile(null);
      return;
    }
    setErrorMsg('');
    setSelectedFile(file);
    if (!label) {
      setLabel(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Please choose a file first.');
      return;
    }
    setUploading(true);
    setErrorMsg('');
    setDuplicateMsg('');
    const result = await uploadDocument(selectedFile, label.trim(), category);
    setUploading(false);
    if (result.error) {
      setErrorMsg(result.error);
      return;
    }
    if (result.duplicateOf) {
      setDuplicateMsg(`This file is identical to "${result.duplicateOf}". It was saved as well, so you can keep both or delete one.`);
    }
    setMsg('Document uploaded successfully.');
    setLabel('');
    setCategory('other');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setTimeout(() => setMsg(''), 4000);
  };

  const handleDelete = (id: string, docLabel: string) => {
    if (confirm(`Delete "${docLabel}"? This cannot be undone.`)) {
      deleteDocument(id);
      setMsg('Document deleted.');
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.size > MAX_SIZE) {
      setErrorMsg('File is too large. Maximum size is 4 MB for local storage.');
      return;
    }
    setErrorMsg('');
    setSelectedFile(file);
    if (!label) {
      setLabel(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">My Documents</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Upload your CV, certificates, transcripts, or any other document.
          These are stored only in this browser on this computer. They never
          leave your device and are never sent to any server or AI.
        </p>

        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200">
          <p className="text-xs text-green-800">
            <strong>Private by design:</strong> Documents stay on your device.
            No one can access them remotely. Clearing your browser data will
            remove them, so use the Backup page to export a copy first.
          </p>
        </div>

        <form onSubmit={handleUpload}>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center transition-colors hover:border-navy-400 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileCheck2 className="w-8 h-8 text-green-600" />
                <p className="text-sm font-medium text-gray-900">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-gray-400" />
                <p className="text-sm text-gray-500">
                  Click to browse or drag a file here
                </p>
                <p className="text-xs text-gray-400">
                  PDF, Word, TXT, images up to 4 MB
                </p>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Label (optional)">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. My CV, LinkedIn Export, Bachelor Transcript"
                className={inputClass}
              />
            </Field>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                className={inputClass}
              >
                {Object.entries(DOCUMENT_CATEGORIES).map(([value, name]) => (
                  <option key={value} value={value}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Button
            type="submit"
            className="mt-3"
            disabled={uploading || !selectedFile}
          >
            <span className="flex items-center gap-1.5">
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? 'Uploading...' : 'Upload document'}
            </span>
          </Button>

          {errorMsg && <Message type="error">{errorMsg}</Message>}
          {duplicateMsg && <Message type="error">{duplicateMsg}</Message>}
          {msg && <Message>{msg}</Message>}
        </form>
      </Card>

      {/* Document list */}
      {data.documents.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-gray-900 mb-4">
            Uploaded documents ({data.documents.length})
          </h3>
          <div className="space-y-2">
            {data.documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1 flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-navy-100 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-navy-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.label}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {doc.fileName} - {doc.uploadedOn}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {opportunitiesUsing(doc.id).length > 0
                        ? `Attached to ${opportunitiesUsing(doc.id).length}: ${opportunitiesUsing(doc.id).join(', ')}`
                        : 'Not attached to any opportunity yet'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={doc.category ?? 'other'}
                        onChange={(e) => updateDocumentCategory(doc.id, e.target.value as DocumentCategory)}
                        aria-label="Document category"
                        className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 text-gray-700"
                      >
                        {Object.entries(DOCUMENT_CATEGORIES).map(([value, name]) => (
                          <option key={value} value={value}>
                            {name}
                          </option>
                        ))}
                      </select>
                      {duplicateIds.has(doc.id) && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 rounded-full px-2 py-0.5">
                          <AlertTriangle className="w-3 h-3" />
                          Duplicate file
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-navy-600 hover:bg-navy-50 p-1.5 rounded-lg transition-colors"
                    aria-label="Open document"
                    title="Open document"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => handleDelete(doc.id, doc.label)}
                    className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 p-1.5 rounded-lg transition-colors"
                    aria-label="Delete document"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.documents.length === 0 && (
        <Card>
          <div className="text-center py-8">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No documents uploaded yet. Upload your CV, certificates, or
              LinkedIn profile above.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
