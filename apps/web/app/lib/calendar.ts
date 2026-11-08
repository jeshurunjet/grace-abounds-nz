export type CalendarCategory =
  'gathering' | 'pastoral' | 'community' | 'ministry';
export type CalendarSyncState = 'local' | 'synced' | 'pending' | 'error';

export type CalendarRecord = {
  id: string;
  externalId?: string;
  title: string;
  start: string;
  end?: string;
  timezone: string;
  allDay: boolean;
  location?: string;
  attendees?: string[];
  category: CalendarCategory;
  recurrence?: string;
  notes?: string;
  syncState: CalendarSyncState;
  lastSyncedAt?: string;
  providerMeta?: Record<string, unknown>;
};

export interface CalendarService {
  list(range?: { from: string; to: string }): Promise<CalendarRecord[]>;
  create(
    input: Omit<CalendarRecord, 'id' | 'syncState'>,
  ): Promise<CalendarRecord>;
  update(id: string, input: Partial<CalendarRecord>): Promise<CalendarRecord>;
  remove(id: string): Promise<void>;
}

export const mockCalendarRecords: CalendarRecord[] = [
  {
    id: 'c1',
    title: 'Sunday Gathering',
    start: '2026-10-04T10:00:00+13:00',
    end: '2026-10-04T11:30:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Grace Centre',
    category: 'gathering',
    recurrence: 'Weekly on Sunday',
    syncState: 'local',
  },
  {
    id: 'c2',
    title: 'Pastoral care — Aroha',
    start: '2026-10-06T09:30:00+13:00',
    end: '2026-10-06T10:15:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Pastoral office',
    attendees: ['Aroha Example'],
    category: 'pastoral',
    syncState: 'local',
  },
  {
    id: 'c3',
    title: 'Connect leaders gathering',
    start: '2026-10-08T19:00:00+13:00',
    end: '2026-10-08T20:30:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Community Room',
    category: 'ministry',
    syncState: 'local',
  },
  {
    id: 'c4',
    title: 'Community lunch',
    start: '2026-10-11T12:00:00+13:00',
    end: '2026-10-11T14:00:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Grace Centre',
    category: 'community',
    syncState: 'local',
  },
  {
    id: 'c5',
    title: 'Baptism interview',
    start: '2026-10-15T16:00:00+13:00',
    end: '2026-10-15T16:45:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Pastoral office',
    category: 'pastoral',
    syncState: 'local',
  },
  {
    id: 'c6',
    title: 'Worship rehearsal',
    start: '2026-10-22T18:30:00+13:00',
    end: '2026-10-22T20:30:00+13:00',
    timezone: 'Pacific/Auckland',
    allDay: false,
    location: 'Main Auditorium',
    category: 'ministry',
    syncState: 'local',
  },
];

// Swap this adapter for Google, Outlook, or another provider without changing the UI.
export function createMockCalendarService(
  seed = mockCalendarRecords,
): CalendarService {
  let records = [...seed];
  return {
    async list() {
      return records;
    },
    async create(input) {
      const record = {
        ...input,
        id: crypto.randomUUID(),
        syncState: 'local' as const,
      };
      records = [...records, record];
      return record;
    },
    async update(id, input) {
      const record = { ...records.find((item) => item.id === id)!, ...input };
      records = records.map((item) => (item.id === id ? record : item));
      return record;
    },
    async remove(id) {
      records = records.filter((item) => item.id !== id);
    },
  };
}

/** Parses a canonical YYYY-MM-DD date as a local calendar day. */
export function parseCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]) - 1,
    day: Number(match[3]),
  };
}

/** Formats a canonical YYYY-MM-DD date for display, e.g. "Sun 11 Oct 2026". */
export function formatCalendarDate(value: string) {
  const parts = parseCalendarDate(value);
  if (!parts) return value;
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(
    'en-NZ',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  );
}
