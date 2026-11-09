'use client';
import { useState } from 'react';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import type { Sermon } from '../../lib/content';
export default function SermonAdmin() {
  const { content, update, storageError, retrySave } = useContent();
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const current =
    content.sermons.find((item) => item.id === selected) ?? content.sermons[0];
  const visible = content.sermons.filter((item) =>
    `${item.title} ${item.date} ${item.status}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  function change(patch: Partial<Sermon>) {
    if (current)
      update((state) => ({
        ...state,
        sermons: state.sermons.map((item) =>
          item.id === current.id ? { ...item, ...patch } : item,
        ),
      }));
  }
  return (
    <AdminShell>
      {storageError && (
        <div className="publishing-errors" role="alert">
          <p>{storageError}</p>
          <button className="button button-outline" onClick={retrySave}>
            Retry save
          </button>
        </div>
      )}
      <header className="workspace-header">
        <p className="eyebrow">Sermon library</p>
        <h1>Manage sermons</h1>
        <p>
          Edit sermon details and add a direct HTTPS video or audio URL. Upload
          and transcoding require the backend media service.
        </p>
        <button
          className="button"
          onClick={() => {
            const id = crypto.randomUUID();
            update((state) => ({
              ...state,
              sermons: [
                ...state.sermons,
                {
                  id,
                  slug: `sermon-${id}`,
                  title: 'New sermon',
                  series: '',
                  speaker: '',
                  date: new Date().toISOString().slice(0, 10),
                  duration: '',
                  image: '/images/hero-6.jpg',
                  summary: '',
                  status: 'draft',
                  progress: 100,
                  mediaUrl: '',
                },
              ],
            }));
            setSelected(id);
          }}
        >
          New sermon
        </button>
      </header>
      <div className="editor-layout">
        <aside className="panel item-list">
          <input
            type="search"
            aria-label="Search sermons"
            placeholder="Search by title, date or status"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {!content.sermons.length && (
            <p className="form-note">
              No sermons yet. Use “New sermon” to create the first one.
            </p>
          )}
          {content.sermons.length > 0 && !visible.length && (
            <p className="form-note">No sermons match your search.</p>
          )}
          {visible.map((item) => (
            <button
              className={current?.id === item.id ? 'active' : ''}
              key={item.id}
              onClick={() => setSelected(item.id)}
            >
              <b>{item.title}</b>
              <small>
                {item.date} · {item.status}
              </small>
            </button>
          ))}
        </aside>
        {current && (
          <section className="panel cms-form">
            <h2>{current.title}</h2>
            {(
              [
                'title',
                'slug',
                'series',
                'speaker',
                'date',
                'duration',
                'image',
                'mediaUrl',
              ] as const
            ).map((key) => (
              <label key={key}>
                {key === 'mediaUrl'
                  ? 'Direct media URL (MP4, MP3, WebM)'
                  : key === 'image'
                    ? 'Cover image URL or /images/ path'
                    : key}
                <input
                  value={current[key] ?? ''}
                  onChange={(event) => change({ [key]: event.target.value })}
                />
              </label>
            ))}
            <label>
              Summary
              <textarea
                rows={5}
                value={current.summary}
                onChange={(event) => change({ summary: event.target.value })}
              />
            </label>
            <label>
              Visibility
              <select
                value={current.status}
                onChange={(event) =>
                  change({ status: event.target.value as Sermon['status'] })
                }
              >
                <option value="draft">Keep as draft</option>
                <option value="published">Include on public website</option>
                <option value="archived">Archive</option>
              </select>
            </label>
            <p className="form-note">
              Changes go live immediately. Automated publishing from OBS will
              add its own approval step when the video backend is built.
            </p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
