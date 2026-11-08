'use client';
import { useSession } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
import { MemberShell } from '../../components/member-shell';
import { useContent } from '../../components/content-provider';
export default function MessagesPage() {
  const { content, update, ready, storageError, retrySave } = useContent();
  const [error, setError] = useState('');
  const { data } = useSession();
  const [selected, setSelected] = useState('');
  const [body, setBody] = useState('');
  const current = content.users.find(
    (user) => user.email === data?.user?.email,
  );
  const staff = data?.user?.role === 'pastor' || data?.user?.role === 'admin';
  const members = content.users.filter((user) => user.role === 'member');
  const memberId = staff ? selected || members[0]?.id : current?.id;
  const messages = content.messages.filter(
    (item) => item.memberId === memberId,
  );
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!current || !memberId || !body.trim() || !ready || storageError) return;
    const saved = await update((state) => ({
      ...state,
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          memberId,
          senderId: current.id,
          senderName: current.name,
          body: body.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    if (!saved) {
      // Keep the typed message so it can be retried.
      setError(
        'Your message could not be saved in this browser. Please try again.',
      );
      return;
    }
    setError('');
    setBody('');
  }
  return (
    <MemberShell>
      <header className="workspace-header">
        <p className="eyebrow">Church inbox</p>
        <h1>Messages</h1>
        <p>
          Contact the church team. Pastor and admins can read and reply. This
          preview saves messages in this browser only; it does not deliver them
          to another device.
        </p>
      </header>
      {storageError && (
        <div className="publishing-errors" role="alert">
          <p>{storageError}</p>
          <button className="button button-outline" onClick={retrySave}>
            Retry save
          </button>
        </div>
      )}
      <section className="panel cms-form">
        {staff && (
          <label>
            Member conversation
            <select
              value={memberId ?? ''}
              onChange={(event) => setSelected(event.target.value)}
            >
              {members.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div
          className="message-list"
          aria-label="Conversation"
          aria-live="polite"
        >
          {!messages.length && (
            <p>No messages yet. Start a conversation below.</p>
          )}
          {messages.map((item) => (
            <article className="message-card" key={item.id}>
              <strong>{item.senderName}</strong>
              <small>{new Date(item.createdAt).toLocaleString('en-NZ')}</small>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
        <form className="cms-form" onSubmit={send}>
          <label>
            Your message
            <textarea
              rows={4}
              value={body}
              maxLength={5000}
              required
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button"
            disabled={
              !ready || !!storageError || !current || !memberId || !body.trim()
            }
          >
            Save message to preview
          </button>
        </form>
      </section>
    </MemberShell>
  );
}
