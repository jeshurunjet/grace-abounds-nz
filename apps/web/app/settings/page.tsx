'use client';
import { useSession } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
export default function SettingsPage() {
  const { data } = useSession();
  const { choice, setChoice } = useTheme();
  const [preferences, setPreferences] = useState(initial);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<'passkeys' | 'delete' | null>(null);
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
            <Link href={`/profile/${data?.user?.profileId ?? ''}`}>
              Manage profile
            </Link>
          </div>
          <div className="preference-row">
            <span>
              <strong>Password</strong>
              <small>
                Secure password changes require account verification.
              </small>
            </span>
            <button
              className="button button-outline"
              onClick={() => unavailable('Password changes')}
            >
              Review
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Google account</strong>
              <small>Connection status has not been confirmed.</small>
            </span>
            <button
              className="button button-outline"
              onClick={() => unavailable('Google connection')}
            >
              Connect
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Passkeys</strong>
              <small>Registered devices have not been retrieved.</small>
            </span>
            <button
              className="button button-outline"
              onClick={() => setModal('passkeys')}
            >
              Manage
            </button>
          </div>
          <div className="preference-row">
            <span>
              <strong>Other sessions</strong>
              <small>Session history is unavailable.</small>
            </span>
            <button className="button button-outline" disabled>
              Sign out others
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
            instead of an email code. Add one on each device you use.
          </p>
        </div>
        <button
          className="button"
          onClick={async () => {
            try {
              await passkeySignIn('passkey', { action: 'register' });
              setModal(null);
              setNotice('Passkey added. You can use it next time you sign in.');
            } catch {
              setModal(null);
              setNotice('No passkey was added. Please try again.');
            }
          }}
        >
          Add a passkey on this device
        </button>
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
