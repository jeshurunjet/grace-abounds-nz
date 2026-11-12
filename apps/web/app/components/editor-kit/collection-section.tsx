'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash, type LucideIcon } from 'lucide-react';
import type { StaffRecord } from '@grace-abounds/validation';
import { useToast } from '../toast';
import { KitConfirm } from './confirm';
import { SidePanel } from './side-panel';
import { KitPhoto, KitText, ListRow, RowList, SectionCard } from './parts';
import { api, ApiError, errorMessage } from '../../lib/api-client';

/*
 * A database collection edited one record at a time (Phase 2B).
 * - The side panel's Save creates or replaces that one record (If-Match).
 *   Nothing is written until Save; a new item is not created until then.
 * - Move up/down only changes the order on screen; "Save order" writes it.
 * - Delete is for drafts and archived items and always asks first.
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
type Row = StaffRecord<Value>;

const get = (value: Value, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>((node, key) => (node as Value | undefined)?.[key], value);
function set(value: Value, path: string, next: unknown): Value {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...value, [head!]: next };
  return {
    ...value,
    [head!]: set((value[head!] as Value) ?? {}, rest.join('.'), next),
  };
}
/** The editable fields of a record (what the API accepts). */
function editable(row: Value, blank: Value): Value {
  return Object.fromEntries(
    Object.keys(blank).map((key) => [key, row[key] ?? blank[key]]),
  );
}
const statusBadge = (status: unknown) =>
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

export function CollectionSection({
  collection,
  noun,
  icon,
  title,
  description,
  blank,
  fields,
  summary,
  onChange,
}: {
  collection: string;
  noun: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  /** A new record's starting values; its keys are the fields sent on Save. */
  blank: Value;
  fields: FieldSpec[];
  summary: (row: Row) => {
    title: string;
    detail?: string;
    media?: React.ReactNode;
  };
  /** Called with the saved list, e.g. to refresh dependent choices. */
  onChange?: (rows: Row[]) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [order, setOrder] = useState<string[] | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderError, setOrderError] = useState('');
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

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const result = await api<Row[]>(`/staff/${collection}`);
      setRows(result.data);
      setOrder(null);
      onChange?.(result.data);
    } catch (failure) {
      setLoadError(errorMessage(failure));
    }
    // onChange is a notification only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown =
    rows && order
      ? order
          .map((id) => rows.find((row) => row.id === id))
          .filter((row): row is Row => !!row)
      : (rows ?? []);
  const move = (index: number, delta: number) => {
    const ids = shown.map((row) => row.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    setOrder(ids);
    setOrderError('');
  };
  async function saveOrder() {
    if (!order) return;
    setOrderBusy(true);
    setOrderError('');
    try {
      await api(`/staff/${collection}/order`, {
        method: 'PUT',
        body: JSON.stringify({ ids: order }),
      });
      const next = order
        .map((id) => rows!.find((row) => row.id === id))
        .filter((row): row is Row => !!row)
        .map((row, position) => ({ ...row, position }));
      setRows(next);
      setOrder(null);
      onChange?.(next);
      toast.push(`${title} order saved.`, 'success');
      router.refresh();
    } catch (failure) {
      setOrderError(errorMessage(failure));
    } finally {
      setOrderBusy(false);
    }
  }

  const open = (row: Row | null) => {
    const value = row ? editable(row, blank) : { ...blank };
    setPanel({
      id: row?.id ?? null,
      version: row?.version,
      value,
      original: value,
    });
    setPanelError('');
    setFieldErrors({});
    setConflict(false);
  };
  const dirty =
    !!panel && JSON.stringify(panel.value) !== JSON.stringify(panel.original);

  async function save() {
    if (!panel || saving) return;
    setSaving(true);
    setPanelError('');
    setFieldErrors({});
    try {
      const body = JSON.stringify(panel.value);
      const result = panel.id
        ? await api<Row>(`/staff/${collection}/${panel.id}`, {
            method: 'PATCH',
            version: panel.version,
            body,
          })
        : await api<Row>(`/staff/${collection}`, { method: 'POST', body });
      const saved = result.data;
      const next = panel.id
        ? (rows ?? []).map((row) => (row.id === saved.id ? saved : row))
        : [...(rows ?? []), saved];
      setRows(next);
      onChange?.(next);
      setPanel(null);
      const name = summary(saved).title;
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
      setRows(result.data);
      const latest = result.data.find((row) => row.id === panel.id);
      if (!latest) {
        setPanel(null);
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
      const next = (rows ?? []).filter((row) => row.id !== panel.id);
      setRows(next);
      onChange?.(next);
      setPanel(null);
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
    const value = get(panel.value, spec.key);
    const change = (next: unknown) =>
      setPanel(
        (current) =>
          current && { ...current, value: set(current.value, spec.key, next) },
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
          onChange={(next) =>
            change(
              next
                .split('\n')
                .map((line) => line.trimStart())
                .filter((line, i, all) => line || i < all.length - 1),
            )
          }
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
    <SectionCard
      icon={icon}
      title={title}
      description={description}
      action={
        <button
          type="button"
          className="kit-add"
          disabled={!rows}
          onClick={() => open(null)}
        >
          <Plus aria-hidden="true" size={16} />
          Add {noun}
        </button>
      }
    >
      {loadError && (
        <div className="publishing-errors" role="alert">
          <p>
            {title} couldn’t be loaded. {loadError}
          </p>
          <button
            type="button"
            className="button button-outline"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      )}
      {!rows && !loadError && <p className="kit-empty">Loading…</p>}
      {rows && (
        <RowList empty={`No ${noun}s yet.`}>
          {shown.map((row, index) => {
            const info = summary(row);
            return (
              <ListRow
                key={row.id}
                media={info.media}
                title={info.title}
                detail={info.detail}
                badge={statusBadge(row.status)}
                editLabel={`Edit ${info.title}`}
                onEdit={() => open(row)}
                onMoveUp={index > 0 ? () => move(index, -1) : undefined}
                onMoveDown={
                  index < shown.length - 1 ? () => move(index, 1) : undefined
                }
              />
            );
          })}
        </RowList>
      )}
      {order && (
        <div
          className="kit-order-bar"
          role="group"
          aria-label={`${title} order`}
        >
          <span>New order not saved yet.</span>
          <button
            type="button"
            className="button button-outline"
            disabled={orderBusy}
            onClick={() => setOrder(null)}
          >
            Discard
          </button>
          <button
            type="button"
            className="button"
            disabled={orderBusy}
            onClick={() => void saveOrder()}
          >
            {orderBusy ? 'Saving…' : 'Save order'}
          </button>
        </div>
      )}
      {orderError && (
        <p className="kit-error" role="alert">
          {orderError}
        </p>
      )}

      <SidePanel
        open={!!panel}
        title={`${panel?.id ? 'Edit' : 'Add'} ${noun}`}
        eyebrow={title}
        dirty={dirty}
        busy={saving}
        onClose={() => setPanel(null)}
        footer={(requestClose) => (
          <>
            {panel?.id && (
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
    </SectionCard>
  );
}
