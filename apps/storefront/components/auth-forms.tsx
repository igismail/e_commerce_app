'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { browserApi } from '@/lib/api';
import { useAuth } from './providers';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name.').max(80),
  lastName: z.string().trim().min(1, 'Enter your last name.').max(80),
  email: z.string().trim().email('Enter a valid email address.').max(254),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
      'Include an uppercase letter, a lowercase letter, a number, and a symbol.',
    ),
});

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

export function LoginForm({ nextPath = '/account' }: { nextPath?: string }) {
  const { login } = useAuth();
  const router = useRouter();
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function submit(values: LoginValues) {
    try {
      await login(values.email, values.password);
      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Sign in failed.',
      });
    }
  }

  return (
    <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
      <label>
        Email address
        <input
          aria-describedby={
            form.formState.errors.email ? 'forgot-email-error' : undefined
          }
          aria-invalid={Boolean(form.formState.errors.email)}
          autoComplete="email"
          type="email"
          {...form.register('email')}
        />
      </label>
      {form.formState.errors.email ? (
        <p className="form-message" id="forgot-email-error" role="alert">
          {form.formState.errors.email.message}
        </p>
      ) : null}
      {form.formState.errors.email ? (
        <p className="form-message" role="alert">
          {form.formState.errors.email.message}
        </p>
      ) : null}
      <label>
        Password
        <input
          autoComplete="current-password"
          type="password"
          {...form.register('password')}
        />
      </label>
      {form.formState.errors.password ? (
        <p className="form-message" role="alert">
          {form.formState.errors.password.message}
        </p>
      ) : null}
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <button
        className="button button-dark"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-footnote">
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p className="auth-footnote">
        New to Commerce? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}

const emailSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254),
});

export function ForgotPasswordForm() {
  const form = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  });
  const [success, setSuccess] = useState('');

  async function submit(values: z.infer<typeof emailSchema>) {
    setSuccess('');
    try {
      const result = await browserApi<{ message: string }>(
        '/auth/forgot-password',
        { method: 'POST', body: JSON.stringify(values) },
      );
      setSuccess(result.message);
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not submit request.',
      });
    }
  }

  return (
    <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
      <label>
        Email address
        <input autoComplete="email" type="email" {...form.register('email')} />
      </label>
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {success ? (
        <p className="success-message" role="status">
          {success}
        </p>
      ) : null}
      <button
        className="button button-dark"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="auth-footnote">
        <Link href="/login">Return to sign in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const form = useForm<{ password: string; confirmPassword: string }>({
    resolver: zodResolver(
      z
        .object({
          password: registerSchema.shape.password,
          confirmPassword: z.string(),
        })
        .refine((value) => value.password === value.confirmPassword, {
          message: 'Passwords do not match.',
          path: ['confirmPassword'],
        }),
    ),
    defaultValues: { password: '', confirmPassword: '' },
  });
  const [success, setSuccess] = useState('');

  async function submit(values: {
    password: string;
    confirmPassword: string;
  }) {
    setSuccess('');
    try {
      const result = await browserApi<{ message: string }>(
        '/auth/reset-password',
        {
          method: 'POST',
          body: JSON.stringify({ token, password: values.password }),
        },
      );
      setSuccess(result.message);
      form.reset();
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not reset password.',
      });
    }
  }

  return (
    <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
      <label>
        New password
        <input
          autoComplete="new-password"
          type="password"
          {...form.register('password')}
        />
      </label>
      <label>
        Confirm password
        <input
          autoComplete="new-password"
          type="password"
          {...form.register('confirmPassword')}
        />
      </label>
      {form.formState.errors.password ? (
        <p className="form-message" role="alert">
          {form.formState.errors.password.message}
        </p>
      ) : null}
      {form.formState.errors.confirmPassword ? (
        <p className="form-message" role="alert">
          {form.formState.errors.confirmPassword.message}
        </p>
      ) : null}
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {success ? (
        <p className="success-message" role="status">
          {success} <Link href="/login">Sign in</Link>
        </p>
      ) : null}
      <button
        className="button button-dark"
        disabled={form.formState.isSubmitting || !token}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Updating…' : 'Update password'}
      </button>
    </form>
  );
}

export function VerifyEmail({ token }: { token: string }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function verify() {
    setPending(true);
    setError('');
    try {
      const result = await browserApi<{ message: string }>(
        '/auth/verify-email',
        { method: 'POST', body: JSON.stringify({ token }) },
      );
      setMessage(result.message);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not verify email.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-form">
      {message ? (
        <p className="success-message" role="status">
          {message} <Link href="/login">Sign in</Link>
        </p>
      ) : (
        <>
          <p>Verify your email address to activate your account.</p>
          {error ? (
            <p className="form-message" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button-dark"
            disabled={pending || !token}
            onClick={verify}
            type="button"
          >
            {pending ? 'Verifying…' : 'Verify email address'}
          </button>
        </>
      )}
    </div>
  );
}

export function RegisterForm() {
  const { register } = useAuth();
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });
  const [success, setSuccess] = useState('');

  async function submit(values: RegisterValues) {
    setSuccess('');
    try {
      const result = await register(values);
      setSuccess(result.message);
      form.reset();
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Account creation failed.',
      });
    }
  }

  return (
    <form className="auth-form" onSubmit={form.handleSubmit(submit)}>
      <div className="form-row">
        <label>
          First name
          <input
            aria-describedby={
              form.formState.errors.firstName ? 'register-first-name-error' : undefined
            }
            aria-invalid={Boolean(form.formState.errors.firstName)}
            autoComplete="given-name"
            {...form.register('firstName')}
          />
        </label>
        {form.formState.errors.firstName ? (
          <p className="form-message" id="register-first-name-error" role="alert">
            {form.formState.errors.firstName.message || 'Enter a valid first name.'}
          </p>
        ) : null}
        <label>
          Last name
          <input
            aria-describedby={
              form.formState.errors.lastName ? 'register-last-name-error' : undefined
            }
            aria-invalid={Boolean(form.formState.errors.lastName)}
            autoComplete="family-name"
            {...form.register('lastName')}
          />
        </label>
        {form.formState.errors.lastName ? (
          <p className="form-message" id="register-last-name-error" role="alert">
            {form.formState.errors.lastName.message || 'Enter a valid last name.'}
          </p>
        ) : null}
      </div>
      <label>
        Email address
        <input
          aria-describedby={
            form.formState.errors.email ? 'register-email-error' : undefined
          }
          aria-invalid={Boolean(form.formState.errors.email)}
          autoComplete="email"
          type="email"
          {...form.register('email')}
        />
      </label>
      {form.formState.errors.email ? (
        <p className="form-message" id="register-email-error" role="alert">
          {form.formState.errors.email.message}
        </p>
      ) : null}
      <label>
        Password
        <input
          aria-describedby={
            form.formState.errors.password ? 'register-password-error' : undefined
          }
          aria-invalid={Boolean(form.formState.errors.password)}
          autoComplete="new-password"
          type="password"
          {...form.register('password')}
        />
      </label>
      {form.formState.errors.password ? (
        <p className="form-message" id="register-password-error" role="alert">
          {form.formState.errors.password.message}
        </p>
      ) : null}
      <p className="field-hint">
        At least 12 characters, including uppercase and lowercase letters, a
        number, and a symbol.
      </p>
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {success ? (
        <p className="success-message" role="status">
          {success}
        </p>
      ) : null}
      <button
        className="button button-dark"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
      </button>
      <p className="auth-footnote">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
