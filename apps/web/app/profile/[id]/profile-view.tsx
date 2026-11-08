'use client';
import Image from 'next/image';
import { useState } from 'react';
import { MemberShell } from '../../components/member-shell';
import { ProfilePhotoPicker } from '../../components/profile-photo-picker';
import { Breadcrumbs } from '../../components/breadcrumbs';
import type { PersonProfile } from '../../lib/profiles';
import type { RoleNavigation } from '../../lib/role-navigation';
export function ProfileView({
  profile,
  workspace,
  canEdit,
}: {
  profile: PersonProfile;
  workspace: RoleNavigation;
  canEdit: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
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
      {notice && (
        <p className="notice-box" role="status">
          {notice}
        </p>
      )}
      <div className="profile-reference-grid">
        <aside className="profile-summary">
          <div className="profile-cover" />
          <div className="profile-summary-copy">
            <Image
              unoptimized
              src={draft.photo}
              alt={draft.name}
              width={112}
              height={112}
            />
            {canEdit && (
              <ProfilePhotoPicker
                photo={draft.photo}
                onApply={(photo) => {
                  setDraft((current) => ({ ...current, photo }));
                  setNotice(
                    'Cropped photo applied to this preview. No image has been uploaded; changes reset when you leave or reload.',
                  );
                }}
              />
            )}
            <h2>{draft.name}</h2>
            <p className="profile-role">{profile.title}</p>
            <p>{draft.bio}</p>
          </div>
        </aside>
        <section className="profile-details">
          <div className="profile-details-head">
            <h2>Profile details</h2>
            {canEdit && (
              <button
                className="button button-outline"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? 'Finish preview' : 'Edit local preview'}
              </button>
            )}
          </div>
          <p className="form-note">
            Account services are not connected. Edits are a temporary preview
            and are not saved to your account.
          </p>
          <div className="profile-fields">
            {(['name', 'email', 'phone'] as const).map((key) => (
              <label key={key}>
                <span>
                  {key === 'name'
                    ? 'Full name'
                    : key === 'email'
                      ? 'Email address'
                      : 'Phone number'}
                </span>
                <input
                  type={
                    key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'
                  }
                  value={draft[key]}
                  disabled={!editing || !canEdit}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
            <label>
              <span>Role</span>
              <input value={profile.title} readOnly disabled />
            </label>
          </div>
          <label className="profile-about">
            <span>About</span>
            <textarea
              value={draft.bio}
              disabled={!editing || !canEdit}
              rows={5}
              onChange={(event) =>
                setDraft((current) => ({ ...current, bio: event.target.value }))
              }
            />
          </label>
        </section>
      </div>
    </MemberShell>
  );
}
