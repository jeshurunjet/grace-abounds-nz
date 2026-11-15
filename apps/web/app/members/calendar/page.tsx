'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, CalendarCheck, Search } from 'lucide-react';
import { MemberShell } from '../../components/member-shell';
import { MemberCalendar } from '../../components/member-calendar';
import {
  JoinActivities,
  MyPlans,
  useMemberPlans,
} from '../../components/member-activities';
import { useActivities } from '../../components/activity-ui';

/**
 * Calendar & bookings in three tabs, so nothing is a long scroll: the church
 * calendar, the member's own plans, and activities to join or book. The tab
 * is kept in the address (?tab=), and older links (?activity=, ?join=) open
 * the Join tab with that activity first.
 */
const tabs = [
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'plans', label: 'My plans', icon: CalendarCheck },
  { id: 'join', label: 'Join or book', icon: Search },
] as const;
type Tab = (typeof tabs)[number]['id'];

export default function WorkspaceCalendarPage() {
  const [tab, setTab] = useState<Tab>('calendar');
  const [focus, setFocus] = useState('');
  const { live } = useActivities();
  const { memberships, bookings } = useMemberPlans();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const planCount = memberships.length + bookings.length;

  // Arriving: honour ?tab= and older ?activity= / ?join= links.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id =
      params.get('activity') ??
      live.find((item) => item.title === params.get('join'))?.id;
    if (id) {
      setFocus(id);
      setTab('join');
      return;
    }
    const wanted = params.get('tab');
    if (tabs.some((item) => item.id === wanted)) setTab(wanted as Tab);
    // Once on arrival (live is stable after content loads).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.length]);

  function choose(next: Tab, focusTab = false) {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.delete('activity');
    url.searchParams.delete('join');
    if (next === 'calendar') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
    if (focusTab)
      buttons.current[tabs.findIndex((item) => item.id === next)]?.focus();
  }
  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((item) => item.id === tab);
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (event.key === 'Home') choose(tabs[0].id, true);
    else if (event.key === 'End') choose(tabs[tabs.length - 1]!.id, true);
    else if (step)
      choose(tabs[(index + step + tabs.length) % tabs.length]!.id, true);
    else return;
    event.preventDefault();
  }

  return (
    <MemberShell>
      <header className="workspace-header hub-header">
        <p className="eyebrow">Church life</p>
        <h1>Calendar &amp; bookings</h1>
        <p>See what’s on, keep track of your plans, and join in.</p>
      </header>
      <div
        className="hub-tabs"
        role="tablist"
        aria-label="Calendar and bookings"
        onKeyDown={onKey}
      >
        {tabs.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`hub-tab-${item.id}`}
              aria-selected={tab === item.id}
              aria-controls={`hub-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => choose(item.id)}
            >
              <Icon aria-hidden="true" size={18} />
              {item.label}
              {item.id === 'plans' && planCount > 0 && (
                <span className="hub-count">{planCount}</span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="hub-panel"
        role="tabpanel"
        id={`hub-panel-${tab}`}
        aria-labelledby={`hub-tab-${tab}`}
      >
        {tab === 'calendar' && <MemberCalendar />}
        {tab === 'plans' && <MyPlans onFind={() => choose('join')} />}
        {tab === 'join' && <JoinActivities focus={focus} />}
      </div>
    </MemberShell>
  );
}
