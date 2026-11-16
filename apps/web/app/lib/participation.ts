'use client';
import { useEffect, useSyncExternalStore } from 'react';
import type { Availability, MemberPlan } from '@grace-abounds/validation';
import { api } from './api-client';

/*
 * Joining and booking (Phase 3B): the server is the only authority. One
 * shared store per page so every component (calendar, My plans, Join or
 * book, event details) shows the same bookings and counts after a change.
 * Nothing is kept in browser storage; old prototype bookings saved in a
 * browser are ignored, never imported.
 */

type State = {
  /** The signed-in person's active plans; null until loaded. */
  plans: MemberPlan[] | null;
  /** Whose plans these are (a different sign-in reloads them). */
  plansOwner: string;
  plansError: string;
  /** Places taken per activity and date (counts only). */
  availability: Availability;
  availabilityLoaded: boolean;
};

const initial: State = {
  plans: null,
  plansOwner: '',
  plansError: '',
  availability: {},
  availabilityLoaded: false,
};
let state = initial;
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;
const serverSnapshot = () => initial;

let plansRequest: { owner: string; promise: Promise<void> } | null = null;
let plansEpoch = 0;
let availabilityRequest: Promise<void> | null = null;

export function loadPlans(owner = state.plansOwner) {
  if (!owner) return Promise.resolve();
  if (plansRequest?.owner === owner) return plansRequest.promise;
  const epoch = plansEpoch;
  const promise = api<MemberPlan[]>('/member/participations')
    .then(({ data }) => {
      if (epoch === plansEpoch && state.plansOwner === owner)
        set({ plans: data, plansError: '' });
    })
    .catch(() => {
      if (epoch === plansEpoch && state.plansOwner === owner)
        set({
          plansError:
            'Your bookings couldn’t be loaded. Check your connection and try again.',
        });
    })
    .finally(() => {
      if (plansRequest?.promise === promise) plansRequest = null;
    });
  plansRequest = { owner, promise };
  return promise;
}

export function loadAvailability() {
  availabilityRequest ??= api<Availability>('/public/availability')
    .then(({ data }) => set({ availability: data, availabilityLoaded: true }))
    // Counts are a convenience: keep the last ones if this fails.
    .catch(() => undefined)
    .finally(() => {
      availabilityRequest = null;
    });
  return availabilityRequest;
}

/**
 * Joins an activity (date '') or books one date. The server decides: it
 * may refuse (full, cancelled, past). Counts and plans reload either way, so
 * what the page shows matches the server afterwards.
 */
export async function joinActivity(activityId: string, date = '') {
  try {
    const { data } = await api<MemberPlan>('/member/participations', {
      method: 'POST',
      body: JSON.stringify({ activityId, date }),
    });
    return data;
  } finally {
    await Promise.all([loadPlans(), loadAvailability()]);
  }
}

/** Cancels one of the person's own plans. */
export async function cancelPlan(id: string) {
  try {
    await api(`/member/participations/${id}`, { method: 'DELETE' });
  } finally {
    await Promise.all([loadPlans(), loadAvailability()]);
  }
}

/** For tests: forget everything loaded. */
export function resetParticipationStore() {
  state = initial;
  plansEpoch += 1;
  plansRequest = null;
  availabilityRequest = null;
}

/** Live counts, loaded once and refreshed when the visitor comes back. */
export function useAvailability() {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!state.availabilityLoaded) void loadAvailability();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadAvailability();
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, []);
  return current.availability;
}

/**
 * The signed-in person's plans: null while loading, or when signed out
 * (userId ''). Another sign-in in the same tab loads that person's plans.
 */
export function usePlans(userId: string) {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (state.plansOwner !== userId) {
      plansEpoch += 1;
      plansRequest = null;
      set({ plans: null, plansOwner: userId, plansError: '' });
      if (userId) void loadPlans(userId);
    }
    const refresh = () => {
      if (userId && document.visibilityState === 'visible')
        void loadPlans(userId);
    };
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [userId]);
  const mine = !!userId && current.plansOwner === userId;
  return {
    plans: mine ? current.plans : null,
    error: mine ? current.plansError : '',
  };
}
