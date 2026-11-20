'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import type {
  NotificationPreferences,
  NotificationPreferencesInput,
} from '@grace-abounds/validation';
import { useToast } from './toast';
import { api, ApiError, errorMessage } from '../lib/api-client';

/*
 * Notification settings (Phase 5A), saved on the server for this account.
 * Changes are a draft until Save; the save sends the version shown and a
 * conflict (changed on another device) reloads the saved choices while
 * keeping the draft. In-app updates are always kept and security emails
 * always sent; only optional update emails are chosen here. Belongs to one
 * signed-in account: a different sign-in starts fresh and late answers are
 * ignored.
 */

const same = (
  a: NotificationPreferencesInput,
  b: NotificationPreferencesInput,
) => a.emailCare === b.emailCare && a.emailAccount === b.emailAccount;
const pick = (value: NotificationPreferencesInput) => ({
  emailCare: value.emailCare,
  emailAccount: value.emailAccount,
});

export function NotificationSettings() {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  if (!user) return null;
  return <SettingsFor key={user} pastor={session?.user?.role === 'pastor'} />;
}

function SettingsFor({ pastor }: { pastor: boolean }) {
  const { push } = useToast();
  const [saved, setSaved] = useState<NotificationPreferences | null>(null);
  const [draft, setDraft] = useState<NotificationPreferencesInput | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  const latest = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async (keepDraft = false) => {
    const ticket = ++latest.current;
    try {
      const data = (await api<NotificationPreferences>('/me/preferences')).data;
      if (!alive.current || ticket !== latest.current) return;
      setSaved(data);
      if (!keepDraft) setDraft(pick(data));
      setLoadError('');
    } catch (failure) {
      if (alive.current && ticket === latest.current)
        setLoadError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!saved && !!draft && !same(saved, draft);
  // Leaving the page with unsaved choices asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (!saved || !draft || saving) return;
    const sent = pick(draft);
    setSaving(true);
    setSaveError('');
    try {
      const data = (
        await api<NotificationPreferences>('/me/preferences', {
          method: 'PUT',
          body: JSON.stringify(sent),
          version: saved.version,
        })
      ).data;
      if (!alive.current) return;
      setSaved(data);
      // Keep anything changed while saving; otherwise match what was saved.
      setDraft((current) =>
        current && !same(current, sent) ? current : pick(data),
      );
      push('Notification settings saved.', 'success');
    } catch (failure) {
      if (!alive.current) return;
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT') {
        setSaveError(
          'Your settings were changed on another device. The latest saved choices are loaded; check yours and save again.',
        );
        await load(true);
      } else setSaveError(errorMessage(failure));
    } finally {
      if (alive.current) setSaving(false);
    }
  }

  const row = (
    key: keyof NotificationPreferencesInput,
    title: string,
    copy: string,
  ) => (
    <div className="preference-row" key={key}>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <button
        type="button"
        className={`preference-switch ${draft?.[key] ? 'on' : ''}`}
        role="switch"
        aria-label={title}
        aria-checked={!!draft?.[key]}
        disabled={!draft || saving}
        onClick={() =>
          setDraft((current) => current && { ...current, [key]: !current[key] })
        }
      >
        <span />
        {draft?.[key] ? 'On' : 'Off'}
      </button>
    </div>
  );

  return (
    <div className="notification-settings">
      <p>
        Updates always appear in the bell in your workspace. Choose which ones
        are also emailed to you.
      </p>
      {loadError && (
        <p className="notice-box" role="alert">
          Your notification settings couldn’t be loaded. {loadError}{' '}
          <button
            type="button"
            className="auth-text-button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </p>
      )}
      {!draft && !loadError && <p className="care-note">Loading…</p>}
      {draft && (
        <>
          {row(
            'emailCare',
            'Email prayer and appointment updates',
            pastor
              ? 'New requests and changes. Emails never include prayer text or appointment details.'
              : 'When your prayer request or appointment changes. Emails never include what you wrote.',
          )}
          {row(
            'emailAccount',
            'Email account updates',
            'For example, when your data export is ready.',
          )}
          <p className="form-note">
            Security emails (sign-in and verification codes, password reset and
            “confirm it’s you” codes) are always sent.
          </p>
          <p className="form-note">
            Event, sermon and message updates and phone push notifications
            aren’t available yet.
          </p>
          {saveError && (
            <p className="form-error" role="alert">
              {saveError}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button button-outline"
              disabled={!dirty || saving}
              onClick={() => {
                if (saved) setDraft(pick(saved));
                setSaveError('');
              }}
            >
              Undo changes
            </button>
            <button
              type="button"
              className="button"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
