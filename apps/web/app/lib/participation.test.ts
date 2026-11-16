import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { resetParticipationStore, usePlans } from './participation';
import type { MemberPlan } from '@grace-abounds/validation';

beforeEach(resetParticipationStore);
afterEach(() => vi.unstubAllGlobals());

it('ignores an old account response and loads the new account independently', async () => {
  const pending: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve))),
  );
  const { result, rerender } = renderHook(({ owner }) => usePlans(owner), {
    initialProps: { owner: 'anna' },
  });
  await waitFor(() => expect(pending).toHaveLength(1));
  rerender({ owner: 'ben' });
  await waitFor(() => expect(pending).toHaveLength(2));
  const plan = (id: string) => ({ id }) as MemberPlan;
  const response = (id: string) =>
    new Response(JSON.stringify({ data: [plan(id)] }), {
      headers: { 'content-type': 'application/json' },
    });
  await act(async () => pending[1]!(response('ben-plan')));
  expect(result.current.plans?.[0]?.id).toBe('ben-plan');
  await act(async () => pending[0]!(response('anna-plan')));
  expect(result.current.plans?.[0]?.id).toBe('ben-plan');
  rerender({ owner: '' });
  expect(result.current.plans).toBeNull();
  rerender({ owner: 'ben' });
  await waitFor(() => expect(pending).toHaveLength(3));
  expect(result.current.plans).toBeNull();
  await act(async () => pending[2]!(response('ben-fresh')));
  expect(result.current.plans?.[0]?.id).toBe('ben-fresh');
});
