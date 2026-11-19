import { describe, expect, it } from 'vitest';
import { nextStepHref } from './content-adapter';

describe('Next steps link destinations', () => {
  it('follows only links the shared classifier accepts', () => {
    const step = (target: string) => ({
      title: 'Serve',
      cta: { kind: 'link' as const, label: 'Go', target },
    });
    expect(nextStepHref(step('/\\video.example/watch'))).toBe('/next-steps');
    expect(nextStepHref(step('//video.example'))).toBe('/next-steps');
    expect(nextStepHref(step('/give'))).toBe('/give');
    expect(nextStepHref(step('https://example.org/serve'))).toBe(
      'https://example.org/serve',
    );
  });

  it('appointment steps open the Appointments page (Phase 4B)', () => {
    expect(
      nextStepHref({
        title: 'Meet the pastor',
        cta: { kind: 'appointment', label: 'Ask', target: '' },
      }),
    ).toBe('/members/appointments');
  });
});
