'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash } from 'lucide-react';
import type { StaffRecord } from '@grace-abounds/validation';
import { useToast } from '../toast';
import { KitConfirm } from './confirm';
import { SidePanel } from './side-panel';
import { KitPhoto, KitText } from './parts';
import { api, ApiError, errorMessage } from '../../lib/api-client';

/*
 * The side panel that edits one database record (Phase 2B). Shared by the
 * list editors (CollectionSection) and the Gallery file manager.
 * - Save creates or replaces that one record (If-Match). Nothing is written
 *   before Save; a new record is not created until then.
 * - A conflict keeps the typed values and offers "Load latest version".
 * - Delete always asks first and is offered only for unpublished records.
 * The panel may show only some fields (e.g. Rename, Move); Save still sends
 * the whole record, so the other fields keep their saved values.
 */

export type Value = Record<string, unknown>;
export type FieldSpec = {
  /** Dotted path into the record, e.g. "cta.label". */
  key: string;
  label: string;
  kind: 'text' | 'long' | 'photo' | 'lines' | 'select' | 'status';
  hint?: string;
  options?: [string, string][];
};
export type Row = StaffRecord<Value>;
/** What to open: an existing row, or a new record with preset values. */
export type RecordRequest = {
  row: Row | null;
  preset?: Value;
  /** Changes on every request, so the same row can be opened again. */
  nonce: number;
} | null;

export const getPath = (value: Value, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((node, key) => (node as Value | undefined)?.[key], value);
export function setPath(value: Value, path: string, next: unknown): Value {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...value, [head!]: next };
  return {
    ...value,
    [head!]: setPath((value[head!] as Value) ?? {}, rest.join('.'), next),
  };
}
/** The editable fields of a record (what the API accepts). */
export function editable(row: Value, blank: Value): Value {
  return Object.fromEntries(
    Object.keys(blank).map((key) => [key, row[key] ?? blank[key]]),
  );
}
export const statusBadge = (status: unknown) =>
  status === 'published'
    ? { tone: 'success' as const, label: 'Live' }
    : status === 'archived'
      ? { tone: 'neutral' as const, label: 'Archived' }
      : status === 'draft'
        ? { tone: 'neutral' as const, label: 'Draft' }
        : undefined;
const statusOptions: [string, string][] = [
  ['draft', 'Draft — not shown'],
  ['published', 'Published — shown'],
  ['archived', 'Archived — hidden, kept'],
];

export function RecordPanel({
  collection,
  noun,
  eyebrow,
  blank,
  fields,
  request,
  title,
  titleFor,
  allowDelete = true,
  onClose,
  onSaved,
  onDeleted,
}: {
  collection: string;
  noun: string;
  eyebrow?: string;
  /** A new record's starting values; its keys are the fields sent on Save. */
  blank: Value;
  fields: FieldSpec[];
  request: RecordRequest;
  /** Panel heading; defaults to "Edit …" / "Add …". */
  title?: string;
  /** The record's display name, for toasts. */
  titleFor: (row: Row) => string;
  allowDelete?: boolean;
  onClose: () => void;
  onSaved: (row: Row, created: boolean) => void;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [panel, setPanel] = useState<{
    id: string | null;
    version?: number;
    value: Value;
    original: Value;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!request) {
      setPanel(null);
      return;
    }
    const value = request.row
      ? editable(request.row, blank)
      : { ...blank, ...request.preset };
    setPanel({
      id: request.row?.id ?? null,
      version: request.row?.version,
      value,
      original: value,
    });
    setPanelError('');
    setFieldErrors({});
    setConflict(false);
    // Opening is driven by the request only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const dirty =
    !!panel && JSON.stringify(panel.value) !== JSON.stringify(panel.original);

  async function save() {
    if (!panel || saving) return;
    setSaving(true);
    setPanelError('');
    setFieldErrors({});
    try {
      // Blank lines in one-per-line fields are not saved.
      let value = panel.value;
      for (const spec of fields)
        if (spec.kind === 'lines')
          value = setPath(
            value,
            spec.key,
            ((getPath(value, spec.key) as string[]) ?? [])
              .map((line) => line.trim())
              .filter(Boolean),
          );
      const body = JSON.stringify(value);
      const result = panel.id
        ? await api<Row>(`/staff/${collection}/${panel.id}`, {
            method: 'PATCH',
            version: panel.version,
            body,
          })
        : await api<Row>(`/staff/${collection}`, { method: 'POST', body });
      const saved = result.data;
      onSaved(saved, !panel.id);
      setPanel(null);
      onClose();
      const name = titleFor(saved);
      toast.push(
        saved.status === 'published'
          ? `${name} saved and published.`
          : saved.status === 'archived'
            ? `${name} saved and archived.`
            : saved.status === 'draft'
              ? `${name} saved as a draft.`
              : `${name} saved.`,
        'success',
      );
      router.refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
        setConflict(true);
        setPanelError(
          'Someone else saved this since you opened it. Your edits are still here.',
        );
      } else {
        if (failure instanceof ApiError && failure.fieldErrors)
          setFieldErrors(failure.fieldErrors);
        setPanelError(errorMessage(failure));
      }
    } finally {
      setSaving(false);
    }
  }
  async function reloadLatest() {
    if (!panel?.id) return;
    try {
      const result = await api<Row[]>(`/staff/${collection}`);
      const latest = result.data.find((row) => row.id === panel.id);
      if (!latest) {
        setPanel(null);
        onClose();
        toast.push(`That ${noun} was deleted by someone else.`, 'info');
        return;
      }
      // Keep the editor's text; adopt the latest version for the next Save.
      setPanel({
        ...panel,
        version: latest.version,
        original: editable(latest, blank),
      });
      setConflict(false);
      setPanelError(
        'Loaded the latest version. Check your changes, then Save to replace it.',
      );
    } catch (failure) {
      setPanelError(errorMessage(failure));
    }
  }
  async function remove() {
    if (!panel?.id) return;
    setConfirmDelete(false);
    setSaving(true);
    try {
      await api(`/staff/${collection}/${panel.id}`, {
        method: 'DELETE',
        version: panel.version,
      });
      onDeleted?.(panel.id);
      setPanel(null);
      onClose();
      toast.push(
        `${noun[0]!.toUpperCase()}${noun.slice(1)} deleted.`,
        'success',
      );
      router.refresh();
    } catch (failure) {
      setPanelError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  const canDelete =
    !!panel?.id &&
    (!('status' in blank) || panel.original.status !== 'published');
  const errorFor = (key: string) =>
    Object.entries(fieldErrors).find(
      ([field]) => field === key || field.startsWith(`${key}.`),
    )?.[1];

  function field(spec: FieldSpec) {
    if (!panel) return null;
    const value = getPath(panel.value, spec.key);
    const change = (next: unknown) =>
      setPanel(
        (current) =>
          current && {
            ...current,
            value: setPath(current.value, spec.key, next),
          },
      );
    if (spec.kind === 'photo')
      return (
        <KitPhoto
          key={spec.key}
          label={spec.label}
          value={String(value ?? '')}
          onChange={change}
        />
      );
    if (spec.kind === 'lines')
      return (
        <KitText
          key={spec.key}
          label={spec.label}
          hint={spec.hint ?? 'One per line.'}
          multiline
          rows={5}
          error={errorFor(spec.key)}
          value={((value as string[]) ?? []).join('\n')}
          onChange={(next) => change(next.split('\n'))}
        />
      );
    if (spec.kind === 'select' || spec.kind === 'status') {
      const id = `${collection}-${spec.key}`;
      const options =
        spec.kind === 'status' ? statusOptions : (spec.options ?? []);
      return (
        <div className="kit-field" key={spec.key}>
          <label htmlFor={id}>{spec.label}</label>
          {spec.hint && <small className="kit-hint">{spec.hint}</small>}
          <select
            id={id}
            value={value === null ? '' : String(value ?? '')}
            onChange={(event) =>
              change(
                event.target.value === '' && spec.key.endsWith('Id')
                  ? null
                  : event.target.value,
              )
            }
          >
            {options.map(([optionValue, label]) => (
              <option key={optionValue} value={optionValue}>
                {label}
              </option>
            ))}
          </select>
          {errorFor(spec.key) && (
            <small className="kit-error">{errorFor(spec.key)}</small>
          )}
        </div>
      );
    }
    return (
      <KitText
        key={spec.key}
        label={spec.label}
        hint={spec.hint}
        multiline={spec.kind === 'long'}
        error={errorFor(spec.key)}
        value={String(value ?? '')}
        onChange={change}
      />
    );
  }

  return (
    <>
      <SidePanel
        open={!!panel}
        title={title ?? `${panel?.id ? 'Edit' : 'Add'} ${noun}`}
        eyebrow={eyebrow}
        dirty={dirty}
        busy={saving}
        onClose={() => {
          setPanel(null);
          onClose();
        }}
        footer={(requestClose) => (
          <>
            {panel?.id && allowDelete && (
              <button
                type="button"
                className="kit-remove"
                disabled={!canDelete || saving}
                title={
                  canDelete
                    ? undefined
                    : 'Archive it and save first; published items are not deleted.'
                }
                onClick={() => setConfirmDelete(true)}
              >
                <Trash aria-hidden="true" size={16} />
                Delete
              </button>
            )}
            <span className="kit-spacer" />
            <button
              type="button"
              className="button button-outline"
              disabled={saving}
              onClick={requestClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button"
              disabled={saving || conflict}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      >
        {!panel?.id && (
          <p className="kit-note">Nothing is created until you select Save.</p>
        )}
        {fields.map(field)}
        {panelError && (
          <div className="publishing-errors" role="alert">
            <p>{panelError}</p>
            {conflict && (
              <button
                type="button"
                className="button button-outline"
                onClick={() => void reloadLatest()}
              >
                Load latest version
              </button>
            )}
          </div>
        )}
      </SidePanel>
      <KitConfirm
        open={confirmDelete}
        title={`Delete this ${noun}?`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      >
        <p>This can’t be undone. Its saved history stays in the audit log.</p>
      </KitConfirm>
    </>
  );
}
