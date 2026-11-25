'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from './providers';

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

type Profile = z.infer<typeof profileSchema> & { id: string; email: string };

export function AccountProfile() {
  const { session, authorizedApi } = useAuth();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const profile = useQuery({
    queryKey: ['profile', session?.user.id],
    queryFn: () => authorizedApi<Profile>('/users/me'),
    enabled: Boolean(session),
  });
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: '', lastName: '' },
  });

  useEffect(() => {
    if (profile.data) {
      form.reset({
        firstName: profile.data.firstName,
        lastName: profile.data.lastName,
      });
    }
  }, [form, profile.data]);

  async function submit(values: z.infer<typeof profileSchema>) {
    setMessage('');
    try {
      const updated = await authorizedApi<Profile>('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      queryClient.setQueryData(['profile', session?.user.id], updated);
      setMessage('Your details have been saved.');
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not save your details.',
      });
    }
  }

  if (profile.isLoading) return <p aria-live="polite">Loading your details…</p>;
  if (profile.error) {
    return (
      <p className="form-message" role="alert">
        {profile.error.message}
      </p>
    );
  }
  if (!profile.data) return <p role="alert">Your profile is unavailable.</p>;

  return (
    <form className="auth-form account-profile" onSubmit={form.handleSubmit(submit)}>
      <label>
        Email address
        <input readOnly value={profile.data.email} />
      </label>
      <div className="form-row">
        <label>
          First name
          <input autoComplete="given-name" {...form.register('firstName')} />
        </label>
        <label>
          Last name
          <input autoComplete="family-name" {...form.register('lastName')} />
        </label>
      </div>
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      {message ? (
        <p className="success-message" role="status">
          {message}
        </p>
      ) : null}
      <button
        className="button button-outline"
        disabled={form.formState.isSubmitting}
        type="submit"
      >
        {form.formState.isSubmitting ? 'Saving…' : 'Save details'}
      </button>
    </form>
  );
}
