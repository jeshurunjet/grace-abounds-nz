'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, type LucideIcon } from 'lucide-react';
import { useToast } from '../toast';
import { ListRow, RowList, SectionCard } from './parts';
import {
  RecordPanel,
  statusBadge,
  type FieldSpec,
  type RecordRequest,
  type Row,
  type Value,
} from './record-panel';
import { api, errorMessage } from '../../lib/api-client';

export type { FieldSpec, Value } from './record-panel';

/*
 * A database collection edited one record at a time (Phase 2B).
 * - The side panel's Save creates or replaces that one record (If-Match).
 *   Nothing is written until Save; a new item is not created until then.
 * - Move up/down only changes the order on screen; "Save order" writes it.
 * - Delete is for drafts and archived items and always asks first.
 */
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
  const [request, setRequest] = useState<RecordRequest>(null);

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
  const open = (row: Row | null) =>
    setRequest({ row, nonce: Date.now() + Math.random() });

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
      <RecordPanel
        collection={collection}
        noun={noun}
        eyebrow={title}
        blank={blank}
        fields={fields}
        request={request}
        titleFor={(row) => summary(row).title}
        onClose={() => setRequest(null)}
        onSaved={(saved, created) => {
          const next = created
            ? [...(rows ?? []), saved]
            : (rows ?? []).map((row) => (row.id === saved.id ? saved : row));
          setRows(next);
          onChange?.(next);
        }}
        onDeleted={(id) => {
          const next = (rows ?? []).filter((row) => row.id !== id);
          setRows(next);
          onChange?.(next);
        }}
      />
    </SectionCard>
  );
}
