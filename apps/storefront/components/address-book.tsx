'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useAuth } from './providers';

const addressSchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(1).max(160),
  line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
  type: z.enum(['SHIPPING', 'BILLING', 'BOTH']),
  isDefault: z.boolean(),
});

type AddressValues = z.infer<typeof addressSchema>;
type Address = Omit<AddressValues, 'phone' | 'line2'> & {
  id: string;
  phone: string | null;
  line2: string | null;
  createdAt: string;
};

const emptyAddress: AddressValues = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: 'US',
  type: 'BOTH',
  isDefault: false,
};

function AddressForm({
  address,
  onSaved,
  onCancel,
}: {
  address?: Address;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { authorizedApi } = useAuth();
  const form = useForm<AddressValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: address
      ? {
          ...address,
          phone: address.phone ?? '',
          line2: address.line2 ?? '',
        }
      : emptyAddress,
  });

  async function submit(values: AddressValues) {
    try {
      await authorizedApi<Address>(
        address
          ? `/users/me/addresses/${encodeURIComponent(address.id)}`
          : '/users/me/addresses',
        {
          method: address ? 'PATCH' : 'POST',
          body: JSON.stringify({
            ...values,
            countryCode: values.countryCode.toUpperCase(),
          }),
        },
      );
      onSaved();
    } catch (error) {
      form.setError('root', {
        message:
          error instanceof Error ? error.message : 'Could not save this address.',
      });
    }
  }

  return (
    <form className="auth-form address-form" onSubmit={form.handleSubmit(submit)}>
      <div className="form-row">
        <label>
          Full name
          <input autoComplete="name" {...form.register('fullName')} />
        </label>
        <label>
          Phone
          <input autoComplete="tel" {...form.register('phone')} />
        </label>
      </div>
      <label>
        Address
        <input autoComplete="address-line1" {...form.register('line1')} />
      </label>
      <label>
        Apartment, suite, etc.
        <input autoComplete="address-line2" {...form.register('line2')} />
      </label>
      <div className="form-row">
        <label>
          City
          <input autoComplete="address-level2" {...form.register('city')} />
        </label>
        <label>
          State / region
          <input autoComplete="address-level1" {...form.register('region')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Postal code
          <input autoComplete="postal-code" {...form.register('postalCode')} />
        </label>
        <label>
          Country code
          <input maxLength={2} {...form.register('countryCode')} />
        </label>
      </div>
      <div className="form-row">
        <label>
          Address type
          <select {...form.register('type')}>
            <option value="BOTH">Shipping and billing</option>
            <option value="SHIPPING">Shipping</option>
            <option value="BILLING">Billing</option>
          </select>
        </label>
        <label className="checkbox-filter">
          <input type="checkbox" {...form.register('isDefault')} />
          Make default
        </label>
      </div>
      {Object.entries(form.formState.errors).some(
        ([field]) => field !== 'root',
      ) ? (
        <ul className="form-message" role="alert">
          {Object.entries(form.formState.errors).map(([field, error]) =>
            field !== 'root' && error?.message ? (
              <li key={field}>
                {field.replace(/([A-Z])/g, ' $1')}: {error.message}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {form.formState.errors.root ? (
        <p className="form-message" role="alert">
          {form.formState.errors.root.message}
        </p>
      ) : null}
      <div className="address-form-actions">
        <button
          className="button button-dark"
          disabled={form.formState.isSubmitting}
          type="submit"
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save address'}
        </button>
        {onCancel ? (
          <button className="text-button" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function AddressBook() {
  const { session, authorizedApi } = useAuth();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const queryKey = ['addresses', session?.user.id];
  const addresses = useQuery({
    queryKey,
    queryFn: () => authorizedApi<Address[]>('/users/me/addresses'),
    enabled: Boolean(session),
  });

  async function refresh() {
    setAdding(false);
    setEditingId(null);
    await queryClient.invalidateQueries({ queryKey });
  }

  async function removeAddress(addressId: string) {
    if (!window.confirm('Remove this saved address?')) return;
    setError('');
    try {
      await authorizedApi<void>(
        `/users/me/addresses/${encodeURIComponent(addressId)}`,
        { method: 'DELETE' },
      );
      await queryClient.invalidateQueries({ queryKey });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Could not remove address.',
      );
    }
  }

  if (addresses.isLoading) return <p aria-live="polite">Loading addresses…</p>;
  if (addresses.error) {
    return (
      <p className="form-message" role="alert">
        {addresses.error.message}
      </p>
    );
  }

  return (
    <div className="address-book">
      {addresses.data?.map((address) => (
        <article className="address-card" key={address.id}>
          {editingId === address.id ? (
            <AddressForm
              address={address}
              onCancel={() => setEditingId(null)}
              onSaved={refresh}
            />
          ) : (
            <>
              <div>
                <p className="eyebrow">
                  {address.type}
                  {address.isDefault ? ' · DEFAULT' : ''}
                </p>
                <address>
                  {address.fullName}
                  <br />
                  {address.line1}
                  {address.line2 ? (
                    <>
                      <br />
                      {address.line2}
                    </>
                  ) : null}
                  <br />
                  {address.city}, {address.region} {address.postalCode}
                  <br />
                  {address.countryCode}
                </address>
              </div>
              <div className="address-card-actions">
                <button
                  className="text-button"
                  onClick={() => setEditingId(address.id)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="text-button"
                  onClick={() => void removeAddress(address.id)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </article>
      ))}
      {error ? (
        <p className="form-message" role="alert">
          {error}
        </p>
      ) : null}
      {adding ? (
        <AddressForm onCancel={() => setAdding(false)} onSaved={refresh} />
      ) : (
        <button
          className="button button-outline"
          onClick={() => setAdding(true)}
          type="button"
        >
          Add an address
        </button>
      )}
    </div>
  );
}
