import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthForm, PrayerForm } from './forms';
describe('frontend-only forms', () => {
  it('acknowledges a prayer request without implying persistence', () => {
    render(<PrayerForm />);
    fireEvent.change(screen.getByLabelText('Your name'), {
      target: { value: 'Grace' },
    });
    fireEvent.change(screen.getByLabelText('How can we pray for you?'), {
      target: { value: 'Please pray' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Send prayer request' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('not sent or saved');
  });
  it('toggles password visibility', () => {
    render(<AuthForm mode="login" />);
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
