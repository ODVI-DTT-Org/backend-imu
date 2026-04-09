// src/tests/integration/fixtures/addresses.ts

import { mockClient } from './clients.js';
import { mockPSGC, mockPSGCList } from './psgc.js';

export const mockAddress = {
  id: '123e4567-e89b-12d3-a456-426614174200',
  client_id: mockClient.id,
  psgc_id: 1,
  label: 'Home',
  street_address: '123 Main St',
  postal_code: '1000',
  latitude: 14.5995,
  longitude: 120.9842,
  is_primary: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockAddressList = [
  mockAddress,
  {
    ...mockAddress,
    id: '123e4567-e89b-12d3-a456-426614174201',
    label: 'Work',
    is_primary: false,
  },
];

export const mockAddressWithPSGC = {
  ...mockAddress,
  psgc: mockPSGC,
};
