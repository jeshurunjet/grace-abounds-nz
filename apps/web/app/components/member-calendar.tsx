'use client';

import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { useContent } from './content-provider';

const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function MemberCalendar() {
  const { content } = useContent();
  const { data } = useSession();
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const user =
    content.users.find((item) => item.email === data?.user?.email) ??
    content.users.find((item) => item.role === 'member');
  const assignments = content.serviceAssignments.filter(
    (item) => item.userId === user?.id,
  );
  const cells = useMemo(
    () => [
      ...Array(new Date(year, month, 1).getDay()).fill(null),
      ...Array.from(
        { length: new Date(year, month + 1, 0).getDate() },
        (_, index) => index + 1,
      ),
    ],
    [month, year],
  );
  const assignmentsForDay = (day: number) =>
    assignments.filter(
      (item) =>
        Number(item.date.match(/\d+/)?.[0]) === day &&
        item.date
          .toLowerCase()
          .includes(months[month]!.slice(0, 3).toLowerCase()),
    );
  const eventsForDay = (day: number) =>
    content.events.filter((item) => {
      const date = new Date(item.date);
      return (
        item.status === 'published' &&
        date.getFullYear() === year &&
        date.getMonth() === month &&
        date.getDate() === day
      );
    });
  function moveMonth(offset: number) {
    const next = new Date(year, month + offset, 1);
    setMonth(next.getMonth());
    setYear(next.getFullYear());
    setSelectedDay(null);
  }
  return (
    <section className="panel pastor-calendar member-calendar">
      <header>
        <div>
          <p className="eyebrow">Your planner</p>
          <h2>
            {months[month]} {year}
          </h2>
        </div>
        <span>
          <button onClick={() => moveMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <button onClick={() => moveMonth(1)} aria-label="Next month">
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
            className={day === selectedDay ? 'selected' : ''}
            disabled={!day}
            key={index}
            onClick={() => day && setSelectedDay(day)}
          >
            {day}
            {day &&
              assignmentsForDay(day).length + eventsForDay(day).length > 0 && (
                <i />
              )}
          </button>
        ))}
      </div>
      {selectedDay && (
        <div className="pastor-day-detail">
          <div>
            <b>
              {selectedDay} {months[month]}
            </b>
            <small>
              {assignmentsForDay(selectedDay).length} assignments ·{' '}
              {eventsForDay(selectedDay).length} events
            </small>
          </div>
          {eventsForDay(selectedDay).map((item) => (
            <p key={item.id}>
              <a href={`/events/${item.slug}`}>
                {item.title}
                <small>
                  {item.time} · {item.location}
                </small>
              </a>
            </p>
          ))}
          {assignmentsForDay(selectedDay).map((item) => (
            <p key={item.id}>
              <span>
                {item.title}
                <small>
                  {item.time} · {item.location}
                </small>
              </span>
              <em>{item.status}</em>
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
