'use client';
import { validatePublicContent } from '../lib/content-validation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useState } from 'react';
import { useContent } from './content-provider';
import { useToast } from './toast';
export function EditorialBar() {
  const {
    editorial,
    ready,
    storageError,
    retrySave,
    submit,
    publish,
    returnDraft,
  } = useContent();
  const { data } = useSession();
  const { push } = useToast();
  const [feedback, setFeedback] = useState('');
  const errors = validatePublicContent(editorial.draft);
  const pastor = data?.user?.role === 'pastor';
  return (
    <section className="editorial-bar" aria-label="Website publishing">
      <div>
        <strong>
          {editorial.status === 'pending'
            ? 'Awaiting pastor approval'
            : editorial.status === 'draft'
              ? 'Unpublished changes'
              : 'Live preview version'}
        </strong>
        <p>
          Browser preview only. No server publication is connected. Edits stay
          in a draft; public pages keep the last published version.
        </p>
        {editorial.feedback && (
          <p role="status">Pastor feedback: {editorial.feedback}</p>
        )}
      </div>
      {storageError && (
        <div className="publishing-errors" role="alert">
          <p>{storageError}</p>
          <button className="button button-outline" onClick={retrySave}>
            Retry save
          </button>
        </div>
      )}
      <div className="form-actions">
        <Link href="/admin/preview" className="button button-outline">
          Preview draft
        </Link>
        <Link href="/" className="button button-outline">
          View live version
        </Link>
        {editorial.status === 'draft' && (
          <button
            disabled={!ready || !!storageError || errors.length > 0}
            className="button"
            onClick={() => {
              submit();
              push(
                'Review state updated in this browser only. No request has been delivered.',
                'info',
              );
            }}
          >
            Submit for approval
          </button>
        )}
        {pastor && editorial.status !== 'published' && (
          <button
            disabled={!ready || !!storageError || errors.length > 0}
            className="button"
            onClick={() => {
              publish();
              push(
                'Approved revision applied on this device only. No production publication occurred.',
                'info',
              );
            }}
          >
            Apply approved preview
          </button>
        )}
      </div>
      {editorial.status !== 'published' && errors.length > 0 && (
        <div className="publishing-errors" role="status">
          <strong>Fix these before publishing</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {pastor && editorial.status === 'pending' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            returnDraft(feedback.trim());
            setFeedback('');
            push(
              'Feedback saved in this browser preview only. No notification has been delivered.',
              'info',
            );
          }}
        >
          <label>
            Changes needed
            <input
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              required
            />
          </label>
          <button className="button button-outline">Return to draft</button>
        </form>
      )}
    </section>
  );
}
