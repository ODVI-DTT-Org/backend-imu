import { describe, expect, test } from 'vitest';
import {
  buildAddressEditUpdate,
  assertAffectedRows,
} from '../approval-processing.js';

describe('approval address processing', () => {
  test('maps full_address into street_address for address_edit approvals', () => {
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
      street_address: 'House 12, Barangay 1, City A, Province B',
      barangay: 'Barangay 1',
      city: 'City A',
      province: 'Province B',
    });
    expect(update.fields).not.toHaveProperty('full_address');
  });

  test('prefers explicit street_address before full_address and street', () => {
    const update = buildAddressEditUpdate({
      address_id: 'address-1',
      street: 'Short street',
      full_address: 'Full address fallback',
      street_address: 'Explicit long form',
    });

    expect(update.fields.street_address).toBe('Explicit long form');
  });

  test('throws when an expected mutation affects no rows', () => {
    expect(() => assertAffectedRows({ rowCount: 0 }, 'address_edit', 'address-1'))
      .toThrow('address_edit did not update any rows for address-1');
  });
});
