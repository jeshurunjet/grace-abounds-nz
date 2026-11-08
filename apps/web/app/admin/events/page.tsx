'use client';
import { useState } from 'react';
import { AdminShell } from '../../components/admin-shell';
import { useContent } from '../../components/content-provider';
import type { EventItem } from '../../lib/content';
export default function EventsAdmin() {
  const { content, update } = useContent();
  const [selected, setSelected] = useState('');
  const current =
    content.events.find((item) => item.id === selected) ?? content.events[0];
  function change(patch: Partial<EventItem>) {
    if (current)
      update((state) => ({
        ...state,
        events: state.events.map((item) =>
          item.id === current.id ? { ...item, ...patch } : item,
        ),
      }));
  }
  return (
    <AdminShell>
      <header className="workspace-header">
        <p className="eyebrow">Events &amp; calendar</p>
        <h1>Manage events</h1>
        <p>
          One event library supplies the public events page and member
          attendance list. Changes save to the draft.
        </p>
        <button
          className="button"
          onClick={() => {
            const id = crypto.randomUUID();
            update((state) => ({
              ...state,
              events: [
                ...state.events,
                {
                  id,
                  slug: `event-${id}`,
                  title: 'New event',
                  date: new Date().toISOString().slice(0, 10),
                  time: '10:00',
                  location: '',
                  tag: 'Community',
                  summary: '',
                  image: '/images/community.jpg',
                  status: 'draft',
                },
              ],
            }));
            setSelected(id);
          }}
        >
          New event
        </button>
      </header>
      <div className="editor-layout">
        <aside className="panel item-list">
          {content.events.map((item) => (
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
                'date',
                'time',
                'location',
                'tag',
                'image',
              ] as const
            ).map((key) => (
              <label key={key}>
                {key === 'image' ? 'Image URL or /images/ path' : key}
                <input
                  value={current[key]}
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
              Visibility after pastor approval
              <select
                value={current.status}
                onChange={(event) =>
                  change({ status: event.target.value as EventItem['status'] })
                }
              >
                <option value="draft">Keep as draft</option>
                <option value="published">Include on public website</option>
                <option value="archived">Archive</option>
              </select>
            </label>
            <p>
              Use the approval controls above to publish the complete website
              draft.
            </p>
          </section>
        )}
      </div>
    </AdminShell>
  );
}
