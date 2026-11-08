'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useContent } from './content-provider';
export function PublicEventCalendar() {
  const { content } = useContent();
  const [date, setDate] = useState(() => new Date());
  const [selected, setSelected] = useState<number | null>(null);
  const year = date.getFullYear();
  const month = date.getMonth();
  const cells: (number | null)[] = [
    ...Array(new Date(year, month, 1).getDay()).fill(null),
    ...Array.from(
      { length: new Date(year, month + 1, 0).getDate() },
      (_, index) => index + 1,
    ),
  ];
  const events = (day: number) =>
    content.events.filter((item) => {
      const start = new Date(item.date);
      return (
        item.status === 'published' &&
        start.getFullYear() === year &&
        start.getMonth() === month &&
        start.getDate() === day
      );
    });
  function move(offset: number) {
    setDate(new Date(year, month + offset, 1));
    setSelected(null);
  }
  return (
    <section
      className="panel pastor-calendar member-calendar public-event-calendar"
      aria-label="Church events calendar"
    >
      <header>
        <h2>
          {date.toLocaleDateString('en-NZ', { month: 'long', year: 'numeric' })}
        </h2>
        <span>
          <button aria-label="Previous month" onClick={() => move(-1)}>
            ‹
          </button>
          <button aria-label="Next month" onClick={() => move(1)}>
            ›
          </button>
        </span>
      </header>
      <div className="pastor-week">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <b key={day}>{day}</b>
        ))}
      </div>
      <div className="pastor-calendar-grid">
        {cells.map((day, index) => (
          <button
            key={index}
            disabled={!day}
            aria-pressed={day === selected}
            className={day === selected ? 'selected' : ''}
            aria-label={
              day ? `${day}, ${events(day).length} events` : undefined
            }
            onClick={() => setSelected(day)}
          >
            {day}
            {day && events(day).length > 0 && <i />}
          </button>
        ))}
      </div>
      {selected && (
        <div className="pastor-day-detail">
          <h3>
            {selected} {date.toLocaleDateString('en-NZ', { month: 'long' })}
          </h3>
          {!events(selected).length && <p>No events scheduled for this day.</p>}
          {events(selected).map((item) => (
            <p key={item.id}>
              <Link href={`/events/${item.slug}`}>
                {item.title}
                <small>
                  {item.time} · {item.location}
                </small>
              </Link>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
