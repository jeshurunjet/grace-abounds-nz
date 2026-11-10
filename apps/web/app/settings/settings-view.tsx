'use client';
import { signIn, signOut, useSession } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  KeyRound,
  Monitor,
  Moon,
  Sun,
  Shield,
  Bell,
  UserRound,
} from 'lucide-react';
import { MemberShell } from '../components/member-shell';
import { Modal } from '../components/modal';
import { useTheme, type ThemeChoice } from '../components/theme-provider';
import { useToast } from '../components/toast';
import { CodeInputs, PasswordInput } from '../components/forms';
import { accountApi, api, ApiError, errorMessage } from '../lib/api-client';

type Security = {
  email: string;
  emailCodeAvailable: boolean;
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  googleLinked: boolean;
  passkeys: {
    id: string;
    deviceType: string;
    backedUp: boolean;
    createdAt: string;
  }[];
  recentlyAuthenticated: boolean;
  recentAuthUntil: string;
};
type SessionItem = {
  id: string;
  method: string;
  deviceLabel: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
};
type Modal = 'passkeys' | 'delete' | 'reauth' | 'password' | 'sessions' | null;

const METHOD_LABELS: Record<string, string> = {
  password: 'password',
  'email-code': 'email code',
  google: 'Google',
  passkey: 'passkey',
};
const LINK_MESSAGES: Record<string, string> = {
  LinkReauthRequired: 'Confirm it’s you, then connect Google again.',
  GoogleLinkedElsewhere:
    'That Google account is already connected to a different Grace Abounds account.',
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-NZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
type Preferences = {
  enabled: boolean;
  messages: boolean;
  events: boolean;
  sermons: boolean;
  care: boolean;
  app: boolean;
  email: boolean;
  push: boolean;
};
const initial: Preferences = {
  enabled: true,
  messages: true,
  events: true,
  sermons: false,
  care: true,
  app: true,
  email: false,
  push: false,
};
export function SettingsView({ googleEnabled }: { googleEnabled: boolean }) {
  const { data } = useSession();
  const toast = useToast();
  const { choice, setChoice } = useTheme();
  const [preferences, setPreferences] = useState(initial);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [security, setSecurity] = useState<Security | null>(null);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [afterReauth, setAfterReauth] = useState<null | (() => Promise<void>)>(
    null,
  );
  const [reauthMode, setReauthMode] = useState<
    'password' | 'code' | 'code-sent'
  >('password');
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthCode, setReauthCode] = useState(['', '', '', '', '', '']);
  const [reauthError, setReauthError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const userId = data?.user?.id;
  const pastor = data?.user?.role === 'pastor';
  useEffect(() => {
    setReady(false);
    if (!userId) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(`grace-preferences-${userId}`) ?? 'null',
      );
      setPreferences(
        saved
          ? (Object.fromEntries(
              Object.entries(initial).map(([key, value]) => [
                key,
                typeof saved[key] === 'boolean' ? saved[key] : value,
              ]),
            ) as Preferences)
          : initial,
      );
    } catch {
      setPreferences(initial);
    }
    setReady(true);
  }, [userId]);
  const loadSecurity = useCallback(async () => {
    try {
      const [securityResult, sessionResult] = await Promise.all([
        api<Security>('/me/security'),
        api<SessionItem[]>('/me/sessions'),
      ]);
      setSecurity(securityResult.data);
      setSessions(sessionResult.data);
      setLoadError('');
      return securityResult.data;
    } catch (failure) {
      setLoadError(errorMessage(failure));
      return null;
    }
  }, []);
  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const loaded = await loadSecurity();
      // Results of a Google linking round trip (confirmed from the server).
      const params = new URLSearchParams(window.location.search);
      const linkError = params.get('error');
      if (params.get('linked') === 'google')
        toast.push(
          loaded?.googleLinked
            ? 'Google account connected.'
            : 'Google was not connected. Please try again.',
          loaded?.googleLinked ? 'success' : 'error',
        );
      else if (linkError && LINK_MESSAGES[linkError])
        toast.push(LINK_MESSAGES[linkError]!, 'error');
      if (params.has('linked') || params.has('error'))
        window.history.replaceState(null, '', '/settings');
    })();
  }, [userId, loadSecurity, toast]);

  /** Runs a sensitive action, asking the person to confirm it's them first if needed. */
  function withRecentAuth(action: () => Promise<void>) {
    const fresh =
      security &&
      new Date(security.recentAuthUntil).getTime() > Date.now() + 15_000;
    const run = async () => {
      try {
        await action();
      } catch (failure) {
        if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED')
          askReauth(action);
        else toast.push(errorMessage(failure), 'error');
      }
    };
    if (fresh) void run();
    else askReauth(action);
  }
  function askReauth(action: () => Promise<void>) {
    setAfterReauth(() => action);
    setReauthMode(security?.hasPassword ? 'password' : 'code');
    setReauthPassword('');
    setReauthCode(['', '', '', '', '', '']);
    setReauthError('');
    setModal('reauth');
  }
  async function confirmIdentity(body: Record<string, unknown>) {
    setBusy('reauth');
    setReauthError('');
    try {
      const result = await accountApi('/reauth', body);
      if (result.status === 202) {
        setReauthMode('code-sent');
        return;
      }
      await loadSecurity();
      setModal(null);
      const action = afterReauth;
      setAfterReauth(null);
      if (action)
        await action().catch((failure) =>
          toast.push(errorMessage(failure), 'error'),
        );
    } catch (failure) {
      setReauthError(errorMessage(failure));
    } finally {
      setBusy('');
    }
  }
  async function savePassword() {
    setBusy('password');
    setPasswordError('');
    try {
      const result = await accountApi('/password', { password: newPassword });
      setModal(null);
      setNewPassword('');
      toast.push(
        result.data.status === 'added'
          ? 'Password added. Other devices were signed out.'
          : 'Password changed. Other devices were signed out.',
        'success',
      );
      await loadSecurity();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'REAUTH_REQUIRED') {
        askReauth(async () => setModal('password'));
      } else setPasswordError(errorMessage(failure));
    } finally {
      setBusy('');
    }
  }
  async function revokeSession(item: SessionItem) {
    setBusy(item.id);
    try {
      if (item.current) {
        await signOut({ callbackUrl: '/login' });
        return;
      }
      await api(`/me/sessions/${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      toast.push(`Signed out ${item.deviceLabel}.`, 'success');
      await loadSecurity();
    } catch (failure) {
      toast.push(errorMessage(failure), 'error');
    } finally {
      setBusy('');
    }
  }
  async function revokeOthers() {
    setBusy('others');
    try {
      const result = await api<{ revoked: number }>(
        '/me/sessions/revoke-others',
        {
          method: 'POST',
          body: '{}',
        },
      );
      toast.push(
        result.data.revoked
          ? `Signed out ${result.data.revoked} other ${result.data.revoked === 1 ? 'device' : 'devices'}.`
          : 'No other devices were signed in.',
        'success',
      );
      await loadSecurity();
    } catch (failure) {
      toast.push(errorMessage(failure), 'error');
    } finally {
      setBusy('');
    }
  }
  async function addPasskey() {
    const before = security?.passkeys.length ?? 0;
    await accountApi('/intent', { kind: 'passkey' });
    try {
      await passkeySignIn('passkey', { action: 'register', redirect: false });
    } catch {
      /* Cancelled on the device; checked below. */
    }
    const after = await loadSecurity();
    if (after && after.passkeys.length > before)
      toast.push(
        'Passkey added. You can use it next time you sign in.',
        'success',
      );
    else toast.push('No passkey was added. Please try again.', 'error');
  }
  async function removePasskey(id: string) {
    await api(`/me/passkeys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    toast.push('Passkey removed.', 'success');
    await loadSecurity();
  }
  async function connectGoogle() {
    await accountApi('/intent', { kind: 'google' });
    await signIn('google', { callbackUrl: '/settings?linked=google' });
  }
  async function disconnectGoogle() {
    await api('/me/google', { method: 'DELETE' });
    toast.push('Google account disconnected.', 'success');
    await loadSecurity();
  }

  function toggle(key: keyof Preferences) {
    const next = { ...preferences, [key]: !preferences[key] };
    setPreferences(next);
    try {
      localStorage.setItem(`grace-preferences-${userId}`, JSON.stringify(next));
      setNotice(
        'Preference saved on this device only. Notification delivery is not connected.',
      );
    } catch {
      setNotice(
        'Preference applies for this visit. This browser could not save it.',
      );
    }
  }
  const unavailable = (name: string) =>
    setNotice(
      `${name} requires connected account services. No account changes have been made.`,
    );
  const row = (key: keyof Preferences, title: string, copy: string) => (
    <div className="preference-row" key={key}>
      <span>
        <strong>{title}</strong>
        <small>{copy}</small>
      </span>
      <button
        type="button"
        className={`preference-switch ${preferences[key] ? 'on' : ''}`}
        role="switch"
        aria-label={title}
        aria-checked={preferences[key]}
        disabled={!ready || (key !== 'enabled' && !preferences.enabled)}
        onClick={() => toggle(key)}
      >
        <span />
        {preferences[key] ? 'On' : 'Off'}
      </button>
    </div>
  );
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Your account</p>
        <h1>Settings</h1>
        <p>
          Manage your appearance, account security and notification preferences.
        </p>
      </header>
      {notice && (
        <p className="notice-box" role="status">
          {notice}
        </p>
      )}
      <div className="account-settings-grid">
        <section className="panel">
          <h2>
            <Monitor size={22} /> Appearance
          </h2>
          <p>Choose how Grace Abounds looks on this device.</p>
          <div
            className="theme-choices"
            role="group"
            aria-label="Theme preference"
          >
            {(
              [
                ['light', Sun, 'Light'],
                ['dark', Moon, 'Dark'],
                ['system', Monitor, 'System'],
              ] as const
            ).map(([value, Icon, name]) => (
              <button
                className={choice === value ? 'active' : ''}
                aria-pressed={choice === value}
                key={value}
                onClick={() => setChoice(value as ThemeChoice)}
              >
                <Icon size={22} />
                {name}
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>
            <UserRound size={22} /> Account &amp; security
          </h2>
          <div className="preference-row">
            <span>
              <strong>Profile details</strong>
              <small>Name, contact information and photo</small>
            </span>
            <Link href={`/profile/${data?.user?.id ?? ''}`}>
              Manage profile
            </Link>
          </div>
          {loadError && (
            <div className="notice-box" role="alert">
              Security details couldn’t be loaded. {loadError}{' '}
              <button
                type="button"
                className="auth-text-button"
                onClick={() => void loadSecurity()}
              >
                Try again
              </button>
            </div>
          )}
          <div className="preference-row">
            <span>
              <strong>Password</strong>
              <small>
                {!security
                  ? 'Loading…'
                  : security.hasPassword
                    ? `Last changed ${security.passwordUpdatedAt ? dateTime(security.passwordUpdatedAt) : 'earlier'}`
                    : 'No password yet. You can sign in with an email code.'}
              </small>
            </span>
            <button
              className="button button-outline"
              disabled={!security}
              onClick={() =>
                withRecentAuth(async () => {
                  setNewPassword('');
                  setPasswordError('');
                  setModal('password');
                })
              }
            >
              {security?.hasPassword ? 'Change' : 'Add password'}
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Google account</strong>
              <small>
                {!security
                  ? 'Loading…'
                  : security.googleLinked
                    ? 'Connected. You can sign in with Google.'
                    : googleEnabled
                      ? 'Not connected.'
                      : 'Google sign-in is not available yet.'}
              </small>
            </span>
            {security?.googleLinked ? (
              <button
                className="button button-outline"
                disabled={busy === 'google'}
                onClick={() => withRecentAuth(disconnectGoogle)}
              >
                Disconnect
              </button>
            ) : (
              <button
                className="button button-outline"
                disabled={!security || !googleEnabled}
                onClick={() => withRecentAuth(connectGoogle)}
              >
                Connect
              </button>
            )}
          </div>
          <div className="preference-row">
            <span>
              <strong>Passkeys</strong>
              <small>
                {!security
                  ? 'Loading…'
                  : security.passkeys.length
                    ? `${security.passkeys.length} registered`
                    : 'None registered.'}
              </small>
            </span>
            <button
              className="button button-outline"
              disabled={!security}
              onClick={() => setModal('passkeys')}
            >
              Manage
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Signed-in devices</strong>
              <small>
                {!sessions
                  ? 'Loading…'
                  : `${sessions.length} active ${sessions.length === 1 ? 'session' : 'sessions'}`}
              </small>
            </span>
            <button
              className="button button-outline"
              disabled={!sessions}
              onClick={() => setModal('sessions')}
            >
              Review
            </button>
          </div>
        </section>
        <section className="panel">
          <h2>
            <Bell size={22} /> Notifications
          </h2>
          <p>
            These preferences are local previews; no email or push delivery is
            active.
          </p>
          {row(
            'enabled',
            'Allow notifications',
            'Master preference for optional updates',
          )}
          {row('messages', 'Messages', 'New conversations and replies')}
          {row(
            'events',
            'Events & calendar',
            'Gatherings and schedule updates',
          )}
          {row('sermons', 'Sermons', 'New recordings and resources')}
          {pastor &&
            row(
              'care',
              'Pastoral care',
              'Confidential requests; notification text must remain private',
            )}
          <h3>Delivery channels</h3>
          {row('app', 'In-app updates', 'Updates in your workspace')}
          {row('email', 'Email updates', 'Delivery service is not connected')}
          {row('push', 'Push updates', 'Device registration is not connected')}
        </section>
        <section className="panel">
          <h2>
            <Shield size={22} /> Privacy &amp; data
          </h2>
          <div className="preference-row">
            <span>
              <strong>Download your data</strong>
              <small>Export requires secure account verification.</small>
            </span>
            <button
              className="button button-outline"
              onClick={() => unavailable('Data export')}
            >
              Request export
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Delete your account</strong>
              <small>Review the consequences before making a request.</small>
            </span>
            <button
              className="text-danger"
              onClick={() => {
                setConfirmation('');
                setModal('delete');
              }}
            >
              Review deletion
            </button>
          </div>
          <p>
            <Link href="/privacy">Privacy policy</Link> ·{' '}
            <Link href="/terms">Terms</Link>
          </p>
          {pastor && (
            <p className="form-note">
              The final active pastor must remain protected from deletion or
              demotion.
            </p>
          )}
        </section>
        {pastor && (
          <section className="panel">
            <h2>Church administration</h2>
            <p>
              Manage public details and website content separately from your
              personal account.
            </p>
            <div className="form-actions">
              <Link className="button" href="/admin/cms">
                Website content
              </Link>
              <Link className="button button-outline" href="/admin/users">
                Member management
              </Link>
            </div>
          </section>
        )}
      </div>
      <Modal
        open={modal === 'passkeys'}
        title="Passkeys"
        onClose={() => setModal(null)}
      >
        <div className="empty-feature">
          <KeyRound size={35} />
          <h3>Sign in with your device</h3>
          <p>
            A passkey lets you sign in with your phone or computer’s screen lock
            instead of a code or password. Add one on each device you use.
          </p>
        </div>
        {security?.passkeys.map((item) => (
          <div className="preference-row" key={item.id}>
            <span>
              <strong>
                {item.backedUp ? 'Synced passkey' : 'Device passkey'}
              </strong>
              <small>Added {dateTime(item.createdAt)}</small>
            </span>
            <button
              className="text-danger"
              disabled={busy === item.id}
              onClick={() => withRecentAuth(() => removePasskey(item.id))}
            >
              Remove
            </button>
          </div>
        ))}
        <button className="button" onClick={() => withRecentAuth(addPasskey)}>
          Add a passkey on this device
        </button>
      </Modal>
      <Modal
        open={modal === 'sessions'}
        title="Signed-in devices"
        onClose={() => setModal(null)}
      >
        {sessions?.map((item) => (
          <div className="preference-row" key={item.id}>
            <span>
              <strong>
                {item.deviceLabel || 'Unknown device'}
                {item.current && <em className="status"> This device</em>}
              </strong>
              <small>
                Signed in with {METHOD_LABELS[item.method] ?? item.method} ·
                last active {dateTime(item.lastSeenAt)}
              </small>
            </span>
            <button
              className="button button-outline"
              disabled={busy === item.id}
              onClick={() => void revokeSession(item)}
            >
              Sign out
            </button>
          </div>
        ))}
        <footer className="form-actions">
          <button
            className="button"
            disabled={busy === 'others' || !sessions || sessions.length < 2}
            onClick={() => void revokeOthers()}
          >
            Sign out all other devices
          </button>
        </footer>
      </Modal>
      <Modal
        open={modal === 'reauth'}
        title="Confirm it’s you"
        onClose={() => {
          setModal(null);
          setAfterReauth(null);
        }}
      >
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (reauthMode === 'password')
              void confirmIdentity({
                method: 'password',
                password: reauthPassword,
              });
            else if (reauthMode === 'code-sent')
              void confirmIdentity({
                method: 'code',
                code: reauthCode.join(''),
              });
            else void confirmIdentity({ method: 'request-code' });
          }}
        >
          <p>
            For your security, confirm your identity before changing how you
            sign in.
          </p>
          {reauthMode === 'password' && (
            <PasswordInput
              id="reauth-password"
              autoComplete="current-password"
              label="Current password"
              value={reauthPassword}
              onChange={setReauthPassword}
            />
          )}
          {reauthMode === 'code' && (
            <p>We’ll email a six-digit code to {security?.email}.</p>
          )}
          {reauthMode === 'code-sent' && (
            <>
              <p>
                Enter the code we sent to {security?.email}. It expires in 10
                minutes.
              </p>
              <CodeInputs code={reauthCode} setCode={setReauthCode} />
            </>
          )}
          {reauthError && (
            <p className="form-error" role="alert">
              {reauthError}
            </p>
          )}
          <button
            className="button"
            disabled={
              busy === 'reauth' ||
              (reauthMode === 'code-sent' && reauthCode.some((digit) => !digit))
            }
          >
            {busy === 'reauth'
              ? 'Checking…'
              : reauthMode === 'code'
                ? 'Email me a code'
                : 'Confirm'}
          </button>
          {reauthMode === 'password' ? (
            <button
              type="button"
              className="auth-text-button"
              onClick={() => {
                setReauthError('');
                setReauthMode('code');
              }}
            >
              Use an email code instead
            </button>
          ) : (
            reauthMode === 'code-sent' && (
              <button
                type="button"
                className="auth-text-button"
                disabled={busy === 'reauth'}
                onClick={() => void confirmIdentity({ method: 'request-code' })}
              >
                Send a new code
              </button>
            )
          )}
        </form>
      </Modal>
      <Modal
        open={modal === 'password'}
        title={security?.hasPassword ? 'Change password' : 'Add a password'}
        onClose={() => setModal(null)}
      >
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void savePassword();
          }}
        >
          <PasswordInput
            id="settings-new-password"
            autoComplete="new-password"
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
          />
          <p className="form-note">
            Other devices will be signed out. This one stays signed in.
          </p>
          {passwordError && (
            <p className="form-error" role="alert">
              {passwordError}
            </p>
          )}
          <button className="button" disabled={busy === 'password'}>
            {busy === 'password' ? 'Saving…' : 'Save password'}
          </button>
        </form>
      </Modal>
      <Modal
        open={modal === 'delete'}
        title="Review account deletion"
        onClose={() => setModal(null)}
      >
        <p>
          Deletion would remove your access to the church app. Retention of
          church records must follow the approved privacy policy.
        </p>
        <p>This preview cannot submit or perform account deletion.</p>
        {pastor && (
          <p className="notice-box">
            Pastor account deletion requires a separate review to protect the
            final active pastor.
          </p>
        )}
        <label className="form">
          Type DELETE to review this request
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        <footer className="form-actions">
          <button
            className="button button-outline"
            onClick={() => setModal(null)}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={confirmation !== 'DELETE' || pastor}
            onClick={() => {
              setModal(null);
              unavailable('Account deletion');
            }}
          >
            Request deletion
          </button>
        </footer>
      </Modal>
    </MemberShell>
  );
}
