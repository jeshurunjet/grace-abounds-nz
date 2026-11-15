'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, RotateCcw, X } from 'lucide-react';
import {
  checkUpload,
  formatBytes,
  type StaffAsset,
  type UploadPurpose,
} from '@grace-abounds/validation';
import { errorMessage } from '../lib/api-client';
import {
  cancelUpload,
  uploadFile,
  UploadFailure,
  type PartSender,
  type UploadState,
} from '../lib/uploader';

/*
 * The upload queue (Phase 2D), shared by the Gallery and Sermons & videos.
 * Files are checked as they are added (type, size, where they may go);
 * nothing is sent until the person selects Upload. Each file shows its
 * progress, then "Checking" while the server confirms it, and Retry or a
 * reason if something goes wrong.
 */

export type QueueState =
  'ready' | 'refused' | 'uploading' | 'checking' | 'done' | 'failed';
export type QueueItem<Extra = unknown> = {
  id: string;
  file: File;
  state: QueueState;
  sent: number;
  message: string;
  upload: UploadState | null;
  asset: StaffAsset | null;
  extra: Extra;
};

let counter = 0;

export function useUploadQueue<Extra = unknown>(
  purpose: UploadPurpose,
  /** Runs after the server verified a file (e.g. adds it to the library). */
  onUploaded: (asset: StaffAsset, item: QueueItem<Extra>) => Promise<void>,
  options: { send?: PartSender } = {},
) {
  const [items, setItems] = useState<QueueItem<Extra>[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const uploaded = useRef(onUploaded);
  uploaded.current = onUploaded;

  const patch = useCallback(
    (id: string, change: Partial<QueueItem<Extra>>) =>
      setItems((list) =>
        list.map((item) => (item.id === id ? { ...item, ...change } : item)),
      ),
    [],
  );

  const add = useCallback(
    (files: Iterable<File>, extra: Extra) =>
      setItems((list) => [
        ...list,
        ...[...files].map((file): QueueItem<Extra> => {
          const problem = checkUpload({
            fileName: file.name,
            size: file.size,
            purpose,
          });
          return {
            id: `upload-${++counter}`,
            file,
            state: problem ? 'refused' : 'ready',
            sent: 0,
            message: problem ?? '',
            upload: null,
            asset: null,
            extra,
          };
        }),
      ]),
    [purpose],
  );

  const run = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((entry) => entry.id === id);
      if (!item) return;
      const controller = new AbortController();
      controllers.current.set(id, controller);
      patch(id, { state: 'uploading', message: '' });
      try {
        const asset =
          item.asset ??
          (await uploadFile(item.file, purpose, {
            state: item.upload,
            signal: controller.signal,
            send: options.send,
            onProgress: (sent) => patch(id, { sent }),
            onChecking: () => patch(id, { state: 'checking' }),
          }));
        patch(id, { asset, upload: null, sent: item.file.size });
        try {
          await uploaded.current(asset, { ...item, asset });
          patch(id, { state: 'done', message: '' });
        } catch (failure) {
          patch(id, {
            state: 'failed',
            message: `Uploaded, but not added yet: ${errorMessage(failure)}`,
          });
        }
      } catch (failure) {
        if (failure instanceof UploadFailure && failure.cancelled) {
          setItems((list) => list.filter((entry) => entry.id !== id));
          if (failure.state) void cancelUpload(failure.state.assetId);
        } else if (failure instanceof UploadFailure) {
          patch(id, {
            state: failure.retryable ? 'failed' : 'refused',
            message: failure.message,
            upload: failure.state,
          });
        } else {
          patch(id, { state: 'failed', message: errorMessage(failure) });
        }
      } finally {
        controllers.current.delete(id);
      }
    },
    [patch, purpose, options.send],
  );

  /** Uploads every file waiting in the queue, one file at a time. */
  const start = useCallback(async () => {
    for (const item of itemsRef.current)
      if (item.state === 'ready') await run(item.id);
  }, [run]);

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);
  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find((entry) => entry.id === id);
    // An unfinished upload, or a checked file that was never added, is
    // discarded on the server too (a file in use is kept).
    const assetId =
      item && item.state !== 'done'
        ? (item.upload?.assetId ?? item.asset?.id)
        : undefined;
    if (assetId) void cancelUpload(assetId);
    setItems((list) => list.filter((entry) => entry.id !== id));
  }, []);
  const clearFinished = useCallback(
    () =>
      setItems((list) =>
        list.filter(
          (item) => item.state !== 'done' && item.state !== 'refused',
        ),
      ),
    [],
  );

  // Leaving the page stops uploads in progress.
  useEffect(() => {
    const current = controllers.current;
    return () => current.forEach((controller) => controller.abort());
  }, []);

  const busy = items.some(
    (item) => item.state === 'uploading' || item.state === 'checking',
  );
  return { items, add, start, run, cancel, remove, clearFinished, busy };
}

const stateLabel = (item: QueueItem<unknown>) => {
  switch (item.state) {
    case 'ready':
      return 'Ready to upload';
    case 'uploading':
      return `Uploading ${Math.floor((item.sent / item.file.size) * 100)}%`;
    case 'checking':
      return 'Checking the file…';
    case 'done':
      return 'Uploaded';
    default:
      return item.message;
  }
};

/** The queue as a list: name, size, progress, and Retry/Cancel/Remove. */
export function UploadQueueList<Extra>({
  items,
  onRetry,
  onCancel,
  onRemove,
}: {
  items: QueueItem<Extra>[];
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="upload-queue" aria-label="Files to upload">
      {items.map((item) => {
        const active = item.state === 'uploading' || item.state === 'checking';
        const problem = item.state === 'refused' || item.state === 'failed';
        return (
          <li key={item.id} className={`upload-item upload-${item.state}`}>
            <span className="upload-icon" aria-hidden="true">
              {item.state === 'done' ? (
                <CircleCheck size={18} />
              ) : problem ? (
                <CircleAlert size={18} />
              ) : null}
            </span>
            <span className="upload-name">
              {item.file.name}
              <small>{formatBytes(item.file.size)}</small>
            </span>
            <span
              className={problem ? 'upload-status kit-error' : 'upload-status'}
              role={problem ? 'alert' : undefined}
            >
              {stateLabel(item)}
            </span>
            {active && (
              <progress
                className="upload-progress"
                max={item.file.size}
                value={item.state === 'checking' ? item.file.size : item.sent}
                aria-label={`${item.file.name} upload progress`}
              />
            )}
            <span className="upload-actions">
              {item.state === 'failed' && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={() => onRetry(item.id)}
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  Retry
                </button>
              )}
              {item.state === 'uploading' ? (
                <button
                  type="button"
                  className="kit-icon-button"
                  aria-label={`Cancel ${item.file.name}`}
                  onClick={() => onCancel(item.id)}
                >
                  <X aria-hidden="true" size={16} />
                </button>
              ) : (
                item.state !== 'checking' && (
                  <button
                    type="button"
                    className="kit-icon-button"
                    aria-label={`Remove ${item.file.name} from the list`}
                    onClick={() => onRemove(item.id)}
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                )
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
