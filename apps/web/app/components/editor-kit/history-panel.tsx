'use client';
import { useCallback, useEffect, useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { KitConfirm } from './confirm';
import { SidePanel } from './side-panel';
import { Badge } from './parts';
import { api, ApiError, errorMessage } from '../../lib/api-client';

/*
 * Version history for one saved thing (a page, the site details, one record
 * or one sermon). Each save is a version. Restore saves an older version
 * again as a NEW version, with the same checks as a normal save; nothing in
 * history is rewritten. The server keeps the boundaries: page headings stay
 * fixed, visibility and who-can-open stay as they are now, outside links
 * still need the Pastor, and a sermon restore never changes what is live.
 */

export type HistoryTarget = {
  /** Shown when there is more than one, e.g. "Giving page", "Site details". */
  label: string;
  entityType: string;
  entityKey: string;
  /** The version the editor currently holds (If-Match for a restore). */
  version: number | undefined;
  /** Why restoring is not possible right now (e.g. unsaved changes). */
  blocked?: string;
  /** What a restore does, in one sentence, for the confirmation. */
  restoreNote: string;
};
type Revision = {
  id: string;
  version: number;
  createdAt: string;
  by: string | null;
  restoredFromVersion: number | null;
  data: Record<string, unknown>;
};

const LABELS: Record<string, string> = {
  mediaUrl: 'Recording link',
  mediaAssetId: 'Uploaded recording',
  assetId: 'Uploaded file',
  url: 'Link',
  folderId: 'Folder',
  parentId: 'Folder',
  sermonId: 'Sermon',
  heroImages: 'Slideshow photos',
  heroImage: 'Page photo',
  review: 'Approval',
  reviewNote: 'Pastor’s note',
  cta: 'Button',
  path: 'Journey steps',
  status: 'Visibility',
};
const IGNORED = new Set([
  'id',
  'key',
  'slug',
  'version',
  'updatedAt',
  'live',
  'changedSinceApproval',
  'everApproved',
  'archived',
  'hero',
  'mediaFile',
]);
const label = (key: string) =>
  LABELS[key] ??
  key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (char) => char.toUpperCase())
    .toLowerCase()
    .replace(/^./, (char) => char.toUpperCase());
/** The fields that differ from the version before it. */
function changes(row: Revision, older: Revision | undefined) {
  if (!older) return 'First saved version';
  const keys = new Set([...Object.keys(row.data), ...Object.keys(older.data)]);
  const changed = [...keys]
    .filter((key) => !IGNORED.has(key))
    .filter(
      (key) =>
        JSON.stringify(row.data[key]) !== JSON.stringify(older.data[key]),
    )
    .map(label);
  return changed.length
    ? `Changed: ${changed.join(', ')}`
    : 'No content change';
}
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NZ', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export function HistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="kit-history-button" onClick={onClick}>
      <History aria-hidden="true" size={16} />
      Version history
    </button>
  );
}

export function HistoryPanel({
  open,
  targets,
  onClose,
  onRestored,
}: {
  open: boolean;
  targets: HistoryTarget[];
  onClose: () => void;
  onRestored: (target: HistoryTarget, version: number) => void | Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const target = targets[Math.min(index, targets.length - 1)];
  const [rows, setRows] = useState<Revision[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Revision | null>(null);

  const entityType = target?.entityType;
  const entityKey = target?.entityKey;
  const load = useCallback(async () => {
    if (!entityType || !entityKey) return;
    setRows(null);
    setError('');
    try {
      const query = new URLSearchParams({ entityType, entityKey });
      setRows((await api<Revision[]>(`/staff/revisions?${query}`)).data);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [entityType, entityKey]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  useEffect(() => {
    if (!open) setIndex(0);
  }, [open]);

  async function restore(row: Revision) {
    if (!target) return;
    setConfirm(null);
    setBusy(true);
    setError('');
    try {
      const result = await api<unknown>(`/staff/revisions/${row.id}/restore`, {
        method: 'POST',
        version: target.version,
      });
      await onRestored(target, result.version ?? row.version);
      await load();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === 'VERSION_CONFLICT'
          ? 'This was changed since you opened it. Close the history, reload the latest version and try again.'
          : errorMessage(failure),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SidePanel
        open={open}
        title="Version history"
        eyebrow={target?.label}
        busy={busy}
        onClose={onClose}
        footer={(requestClose) => (
          <>
            <span className="kit-spacer" />
            <button
              type="button"
              className="button button-outline"
              onClick={requestClose}
            >
              Close
            </button>
          </>
        )}
      >
        {targets.length > 1 && (
          <div className="kit-field">
            <label htmlFor="history-target">Show history for</label>
            <select
              id="history-target"
              value={index}
              onChange={(event) => setIndex(Number(event.target.value))}
            >
              {targets.map((item, position) => (
                <option key={item.label} value={position}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <p className="kit-note">
          Every save is kept. Restoring saves an older version again as a new
          version. {target?.restoreNote}
        </p>
        {target?.blocked && (
          <p className="kit-hint" role="status">
            {target.blocked}
          </p>
        )}
        {error && (
          <div className="publishing-errors" role="alert">
            <p>{error}</p>
          </div>
        )}
        {!rows && !error && <p className="kit-empty">Loading…</p>}
        {rows && !rows.length && (
          <p className="kit-empty">
            No saved versions yet. Versions appear here after the next save.
          </p>
        )}
        {rows && !!rows.length && (
          <ol className="kit-history">
            {rows.map((row, position) => {
              const current = row.version === target?.version;
              return (
                <li key={row.id} className="kit-history-item">
                  <div className="kit-history-text">
                    <strong>
                      Version {row.version}{' '}
                      {current && <Badge tone="success">Current</Badge>}
                    </strong>
                    <small>
                      {when(row.createdAt)}
                      {row.by ? ` · ${row.by}` : ''}
                    </small>
                    <small>
                      {row.restoredFromVersion !== null
                        ? `Restored from version ${row.restoredFromVersion}`
                        : changes(row, rows[position + 1])}
                    </small>
                  </div>
                  {!current && (
                    <button
                      type="button"
                      className="button button-outline"
                      disabled={busy || !!target?.blocked || !target?.version}
                      aria-label={`Restore version ${row.version}`}
                      onClick={() => setConfirm(row)}
                    >
                      <RotateCcw aria-hidden="true" size={16} />
                      Restore
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </SidePanel>
      <KitConfirm
        open={!!confirm}
        title={`Restore version ${confirm?.version ?? ''}?`}
        confirmLabel="Restore"
        tone="primary"
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void restore(confirm)}
      >
        <p>{target?.restoreNote}</p>
      </KitConfirm>
    </>
  );
}
