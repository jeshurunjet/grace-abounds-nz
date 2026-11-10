'use client';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { MemberShell } from '../../components/member-shell';
import { ProfilePhotoPicker } from '../../components/profile-photo-picker';
import { Breadcrumbs } from '../../components/breadcrumbs';
import { useToast } from '../../components/toast';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { accountProfile, safeAvatar } from '../../lib/profiles';
import type { RoleNavigation } from '../../lib/role-navigation';

type Me = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  bio: string;
  phone: string;
  role: 'MEMBER' | 'ADMIN' | 'PASTOR';
};
type Draft = { name: string; phone: string; bio: string };

export function ProfileView({ workspace }: { workspace: RoleNavigation }) {
  const { update } = useSession();
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [version, setVersion] = useState<number>();
  const [draft, setDraft] = useState<Draft>({ name: '', phone: '', bio: '' });
  const [photo, setPhoto] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const result = await api<Me>('/me');
      setMe(result.data);
      setVersion(result.version);
      setDraft({
        name: result.data.name ?? '',
        phone: result.data.phone,
        bio: result.data.bio,
      });
      setLoadError('');
    } catch (failure) {
      setLoadError(errorMessage(failure));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!me) return;
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const result = await api<Me>('/me', {
        method: 'PATCH',
        version,
        body: JSON.stringify(draft),
      });
      setMe(result.data);
      setVersion(result.version);
      setEditing(false);
      toast.push('Profile saved.', 'success');
      void update();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'VERSION_CONFLICT')
        setError(
          'Your profile was changed somewhere else. Reload to see the latest version, then make your change again.',
        );
      else setError(errorMessage(failure));
      if (failure instanceof ApiError && failure.fieldErrors)
        setFieldErrors(failure.fieldErrors);
    } finally {
      setSaving(false);
    }
  }

  const display = accountProfile({
    id: me?.id,
    name: draft.name || me?.name,
    email: me?.email,
    role: me
      ? (me.role.toLowerCase() as RoleNavigation['role'])
      : workspace.role,
  });
  const avatar = photo ?? safeAvatar(me?.image);

  return (
    <MemberShell>
      <Breadcrumbs
        items={[
          { label: 'Home', href: workspace.workspaceHref },
          { label: 'Profile' },
        ]}
      />
      <header className="workspace-header">
        <p className="eyebrow">Account</p>
        <h1>Your profile</h1>
        <p>Manage your contact details and profile picture.</p>
      </header>
      {loadError && (
        <div className="notice-box" role="alert">
          Your profile couldn’t be loaded. {loadError}{' '}
          <button
            type="button"
            className="auth-text-button"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      )}
      <div className="profile-reference-grid">
        <aside className="profile-summary">
          <div className="profile-cover" />
          <div className="profile-summary-copy">
            <Image
              unoptimized
              src={avatar}
              alt={display.name}
              width={112}
              height={112}
            />
            {me && (
              <ProfilePhotoPicker
                photo={avatar}
                onApply={(next) => {
                  setPhoto(next);
                  toast.push(
                    'Photo shown as a preview only. Photo uploads are not available yet, so it has not been saved.',
                    'info',
                  );
                }}
              />
            )}
            <h2>{display.name}</h2>
            <p className="profile-role">{display.title}</p>
            <p>{draft.bio}</p>
          </div>
        </aside>
        <section className="profile-details">
          <div className="profile-details-head">
            <h2>Profile details</h2>
            {me &&
              (editing ? (
                <span className="form-actions">
                  <button
                    className="button button-outline"
                    disabled={saving}
                    onClick={() => {
                      setDraft({
                        name: me.name ?? '',
                        phone: me.phone,
                        bio: me.bio,
                      });
                      setEditing(false);
                      setError('');
                      setFieldErrors({});
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="button"
                    disabled={saving}
                    onClick={() => void save()}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </button>
                </span>
              ) : (
                <button
                  className="button button-outline"
                  onClick={() => setEditing(true)}
                >
                  Edit profile
                </button>
              ))}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}{' '}
              {error.startsWith('Your profile was changed') && (
                <button
                  type="button"
                  className="auth-text-button"
                  onClick={() => void load()}
                >
                  Reload
                </button>
              )}
            </p>
          )}
          <div className="profile-fields">
            <label>
              <span>Full name</span>
              <input
                type="text"
                value={draft.name}
                maxLength={80}
                disabled={!editing}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              {fieldErrors.name && (
                <small className="form-error">{fieldErrors.name}</small>
              )}
            </label>
            <label>
              <span>Email address</span>
              <input type="email" value={me?.email ?? ''} readOnly disabled />
            </label>
            <label>
              <span>Phone number</span>
              <input
                type="tel"
                value={draft.phone}
                maxLength={40}
                disabled={!editing}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
              {fieldErrors.phone && (
                <small className="form-error">{fieldErrors.phone}</small>
              )}
            </label>
            <label>
              <span>Role</span>
              <input value={display.title} readOnly disabled />
            </label>
          </div>
          <label className="profile-about">
            <span>About</span>
            <textarea
              value={draft.bio}
              maxLength={1000}
              disabled={!editing}
              rows={5}
              onChange={(event) =>
                setDraft((current) => ({ ...current, bio: event.target.value }))
              }
            />
            {fieldErrors.bio && (
              <small className="form-error">{fieldErrors.bio}</small>
            )}
          </label>
        </section>
      </div>
    </MemberShell>
  );
}
