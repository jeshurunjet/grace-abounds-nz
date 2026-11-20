'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ProfilePhotoPicker } from './profile-photo-picker';
import { KitConfirm } from './editor-kit/confirm';
import { useToast } from './toast';
import { api, errorMessage } from '../lib/api-client';
import { safeAvatar } from '../lib/profiles';

/*
 * The profile photo (Phase 5), saved on the server. The cropped photo is
 * shown as "Saving…" until the server confirms it; if the save fails, the
 * current photo stays and the reason is shown. Removing asks first. Once
 * saved, the signed-in session is refreshed so every avatar matches.
 * Belongs to one signed-in account and role: a change drops anything in
 * flight and ignores late answers. The rest of the profile form (its
 * unsaved edits included) is never touched.
 */

export function ProfilePhotoControl(props: {
  image: string | null;
  name: string;
  onSaved: (image: string | null) => void;
}) {
  const { data: session } = useSession();
  const user = session?.user?.id ?? '';
  const role = session?.user?.role ?? '';
  if (!user) return null;
  return <PhotoFor key={`${user}:${role}`} {...props} />;
}

function PhotoFor({
  image,
  name,
  onSaved,
}: {
  image: string | null;
  name: string;
  onSaved: (image: string | null) => void;
}) {
  const { update } = useSession();
  const { push } = useToast();
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function save(dataUrl: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setPending(dataUrl);
    try {
      const saved = (
        await api<{ image: string }>('/me/photo', {
          method: 'PUT',
          body: JSON.stringify({ image: dataUrl }),
        })
      ).data;
      if (!alive.current) return;
      onSaved(saved.image);
      push('Profile photo saved.', 'success');
      void update();
    } catch (failure) {
      if (!alive.current) return;
      setError(`Your photo wasn’t saved. ${errorMessage(failure)}`);
    } finally {
      if (alive.current) {
        setPending(null);
        setBusy(false);
      }
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/me/photo', { method: 'DELETE' });
      if (!alive.current) return;
      onSaved(null);
      push('Profile photo removed.', 'success');
      void update();
    } catch (failure) {
      if (!alive.current) return;
      setError(`Your photo wasn’t removed. ${errorMessage(failure)}`);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const current = safeAvatar(image);
  return (
    <div className="profile-photo-control">
      <Image
        unoptimized
        src={pending ?? current}
        alt={name}
        width={112}
        height={112}
      />
      {pending && (
        <small className="care-note" role="status">
          Saving your photo…
        </small>
      )}
      <div className="form-actions">
        <ProfilePhotoPicker
          photo={pending ?? current}
          onApply={(next) => void save(next)}
        />
        {image && (
          <button
            type="button"
            className="auth-text-button"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Remove photo
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <KitConfirm
        open={confirming}
        title="Remove your profile photo?"
        confirmLabel="Remove photo"
        cancelLabel="Keep it"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void remove();
        }}
      >
        <p>Your initials picture is shown instead.</p>
      </KitConfirm>
    </div>
  );
}
