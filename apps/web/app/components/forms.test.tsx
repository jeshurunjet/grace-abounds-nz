import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthForm, PrayerForm } from './forms';
import { ToastProvider } from './toast';

const signIn = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...args: unknown[]) => signIn(...args),
}));
vi.mock('next-auth/webauthn', () => ({ signIn: vi.fn() }));

const renderForm = (props: Parameters<typeof AuthForm>[0]) =>
  render(
    <ToastProvider>
      <AuthForm {...props} />
    </ToastProvider>,
  );
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  signIn.mockReset();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

describe('auth and prayer forms', () => {
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

  it('toggles password visibility on the password sign-in step', () => {
    renderForm({ mode: 'login' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a password instead' }),
    );
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(
      screen.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('shows the code step only after the code request is accepted', async () => {
    signIn.mockResolvedValue({ ok: true, error: null });
    renderForm({ mode: 'login' });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'Member@Example.org ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    await screen.findByRole('button', { name: 'Verify code' });
    expect(signIn).toHaveBeenCalledWith(
      'email-code',
      expect.objectContaining({ email: 'member@example.org', redirect: false }),
    );
    const verify = screen.getByRole('button', { name: 'Verify code' });
    expect(verify).toBeDisabled();
    fireEvent.paste(screen.getByLabelText('Verification code digit 1'), {
      clipboardData: { getData: () => '123456' },
    });
    expect(verify).toBeEnabled();
    expect(screen.getByLabelText('Verification code digit 6')).toHaveValue('6');
  });

  it('keeps the email and shows an error when a code cannot be sent', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'EmailSignin' });
    renderForm({ mode: 'login' });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.org' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Email me a code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'couldn’t send a code',
    );
    expect(screen.getByLabelText('Email')).toHaveValue('member@example.org');
    expect(
      screen.queryByRole('button', { name: 'Verify code' }),
    ).not.toBeInTheDocument();
  });

  it('reports a failed password sign-in without success and keeps the input', async () => {
    signIn.mockResolvedValue({ ok: false, error: 'CredentialsSignin' });
    const { container } = renderForm({ mode: 'login' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Use a password instead' }),
    );
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'member@example.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with password' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email or password is incorrect.',
    );
    expect(screen.getByLabelText('Password')).toHaveValue('wrong-pass');
    expect(container.querySelector('.toast.success')).toBeNull();
  });

  it('password sign-up waits for the code and shows server errors inline', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(202, { data: { status: 'code_sent' } }),
      )
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: {
            code: 'INVALID_CODE',
            message: 'That code is wrong or has expired. Request a new code.',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderForm({ mode: 'signup' });
    fireEvent.change(screen.getByLabelText('Full name'), {
      target: { value: 'Ana' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'ana@example.org' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('button', { name: 'Verify code' });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/account/signup');
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
      name: 'Ana',
      email: 'ana@example.org',
      password: 'long-password',
    });
    fireEvent.paste(screen.getByLabelText('Verification code digit 1'), {
      clipboardData: { getData: () => '654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify code' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'wrong or has expired',
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verify code' })).toBeEnabled(),
    );
    expect(signIn).not.toHaveBeenCalled();
    expect(container.querySelector('.toast.success')).toBeNull();
  });

  it('offers passwordless sign-up, and Google only when it is configured', () => {
    const { unmount } = renderForm({ mode: 'signup' });
    expect(
      screen.queryByRole('button', { name: /Continue with Google/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /email code instead/ }));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Email me a code' }),
    ).toBeInTheDocument();
    unmount();
    renderForm({ mode: 'login', googleEnabled: true });
    expect(
      screen.getByRole('button', { name: /Continue with Google/ }),
    ).toBeInTheDocument();
  });
});
