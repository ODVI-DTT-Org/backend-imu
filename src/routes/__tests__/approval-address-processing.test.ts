import { describe, expect, test } from 'vitest';
import {
  buildAddressEditUpdate,
  assertAffectedRows,
} from '../approval-processing.js';

describe('approval address processing', () => {
  test('maps full_address into full_address column for address_edit approvals', () => {
    const update = buildAddressEditUpdate({
      address_id: 'address-1',
      street: 'House 12',
      full_address: 'House 12, Barangay 1, City A, Province B',
      barangay: 'Barangay 1',
      city: 'City A',
      province: 'Province B',
    });

    expect(update.addressId).toBe('address-1');
    expect(update.fields).toMatchObject({
      street: 'House 12',
      full_address: 'House 12, Barangay 1, City A, Province B',
      barangay: 'Barangay 1',
      city: 'City A',
      province: 'Province B',
    });
    expect(update.fields).not.toHaveProperty('street_address');
  });

  test('falls back to street_address payload key when full_address absent', () => {
    const update = buildAddressEditUpdate({
      address_id: 'address-1',
      street: 'Short street',
      street_address: 'Explicit long form',
    });

    expect(update.fields.full_address).toBe('Explicit long form');
  });

  test('throws when an expected mutation affects no rows', () => {
    expect(() => assertAffectedRows({ rowCount: 0 }, 'address_edit', 'address-1'))
      .toThrow('address_edit did not update any rows for address-1');
  });
});
