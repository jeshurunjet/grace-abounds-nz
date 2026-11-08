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
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a password instead' }),
    );
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(password).toHaveAttribute('type', 'text');
  });
  it('accepts a pasted six-digit code without claiming verification', () => {
    render(<AuthForm mode="login" />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.org' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with email' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No code has been sent',
    );
    const verify = screen.getByRole('button', { name: 'Verify code' });
    expect(verify).toBeDisabled();
    fireEvent.paste(screen.getByLabelText('Verification code digit 1'), {
      clipboardData: { getData: () => '123456' },
    });
    expect(verify).toBeEnabled();
    expect(screen.getByLabelText('Verification code digit 6')).toHaveValue('6');
    fireEvent.click(verify);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No sign-in has occurred',
    );
  });
  it('keeps Google and passkeys unavailable without reporting a successful login', () => {
    render(<AuthForm mode="login" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with Google' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No Google account has been authenticated',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with a passkey' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No device prompt or authentication has occurred',
    );
  });
});
