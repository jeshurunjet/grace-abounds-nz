'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  EXPORT_CONTENTS_NOTE,
  EXPORT_LINK_SECONDS,
  EXPORT_TTL_DAYS,
  type DataExportDownload,
  type DataExportItem,
} from '@grace-abounds/validation';
import { useToast } from './toast';
import { ReauthDialog } from './reauth-dialog';
import { api, ApiError, errorMessage } from '../lib/api-client';
import { openDownload } from '../lib/open-download';

/*
 * "Download your data" (Phase 5B). Requesting an export queues it on the
 * server; this shows its real state (preparing, ready until a date, failed,
 * expired) and checks again while it is being prepared. Requesting and
 * downloading need a recent sign-in: "Confirm it's you" then retries the
 * action once the server accepts it. Each download is a fresh link valid
 * for a few minutes. Belongs to one signed-in account: a different sign-in
 * starts fresh and late answers (including a confirmation) are ignored.
 */

const day = (value: string) =>
  new Date(value).toLocaleDateString('en-NZ', { dateStyle: 'medium' });

export function DataExportPanel() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  if (!user) return null;
  return <ExportFor key={user} />;
}

type Action = 'request' | 'download';

function ExportFor() {
  const { push } = useToast();
  const [latest, setLatest] = useState<DataExportItem | null | undefined>();
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState('');
  const [reauth, setReauth] = useState<Action | null>(null);
  const alive = useRef(true);
  const ticket = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    try {
      const items = (await api<DataExportItem[]>('/me/exports')).data;
      if (!alive.current || mine !== ticket.current) return;
      setLatest(items[0] ?? null);
      setLoadError('');
    } catch (failure) {
      if (alive.current && mine === ticket.current)
        setLoadError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // While an export is being prepared, check again every 10 seconds.
  const preparing =
    latest?.status === 'queued' || latest?.status === 'building';
  useEffect(() => {
    if (!preparing) return;
    const timer = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(timer);
  }, [preparing, load]);

  async function run(action: Action) {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'request') {
        const item = (
          await api<DataExportItem>('/me/exports', { method: 'POST' })
        ).data;
        if (!alive.current) return;
        ++ticket.current; // an older list answer must not replace this
        setLatest(item);
        push(
          item.status === 'ready'
            ? 'Your export is ready to download.'
            : 'Your export is being prepared. We’ll let you know when it’s ready.',
          'success',
        );
      } else if (latest) {
        const link = (
          await api<DataExportDownload>(`/me/exports/${latest.id}/download`, {
            method: 'POST',
          })
        ).data;
        if (!alive.current) return;
        openDownload(link.url);
      }
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED') {
        setReauth(action);
        return;
      }
      setError(errorMessage(failure));
      if (
        failure instanceof ApiError &&
        ['EXPORT_EXPIRED', 'EXPORT_NOT_READY', 'NOT_FOUND'].includes(
          failure.code,
        )
      )
        void load();
    } finally {
      if (alive.current) setBusy(null);
    }
  }

  const canRequest =
    latest === null ||
    latest?.status === 'failed' ||
    latest?.status === 'expired';
  return (
    <div className="data-export" id="data">
      <div className="preference-row">
        <span>
          <strong>Download your data</strong>
          <small>
            {loadError
              ? 'Your export status couldn’t be loaded.'
              : latest === undefined
                ? 'Loading…'
                : latest === null
                  ? `A file with your account data, ready to download for ${EXPORT_TTL_DAYS} days.`
                  : latest.status === 'ready'
                    ? `Ready. You can download it until ${day(latest.expiresAt)}.`
                    : preparing
                      ? 'Your export is being prepared. This page checks again automatically.'
                      : latest.status === 'failed'
                        ? 'Your last export couldn’t be prepared. You can try again.'
                        : 'Your last export has expired. You can request a new one.'}
          </small>
        </span>
        {latest?.status === 'ready' ? (
          <button
            type="button"
            className="button button-outline"
            disabled={!!busy}
            onClick={() => void run('download')}
          >
            {busy === 'download' ? 'Preparing link…' : 'Download'}
          </button>
        ) : (
          <button
            type="button"
            className="button button-outline"
            disabled={!!busy || !canRequest}
            onClick={() => void run('request')}
          >
            {busy === 'request'
              ? 'Requesting…'
              : latest?.status === 'failed'
                ? 'Try again'
                : 'Request export'}
          </button>
        )}
      </div>
      {loadError && (
        <p className="notice-box" role="alert">
          {loadError}{' '}
          <button
            type="button"
            className="auth-text-button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="form-note">
        {EXPORT_CONTENTS_NOTE} Each download link works for{' '}
        {Math.round(EXPORT_LINK_SECONDS / 60)} minutes.
      </p>
      {reauth && (
        <ReauthDialog
          purpose={
            reauth === 'request'
              ? 'For your security, confirm it’s you before requesting a copy of your data.'
              : 'For your security, confirm it’s you before downloading your data.'
          }
          onCancel={() => setReauth(null)}
          onConfirmed={() => {
            const action = reauth;
            setReauth(null);
            void run(action);
          }}
        />
      )}
    </div>
  );
}
