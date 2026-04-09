// src/tests/integration/fixtures/phone-numbers.ts

import { mockClient } from './clients.js';

export const mockPhoneNumber = {
  id: '223e4567-e89b-12d3-a456-426614174200',
  client_id: mockClient.id,
  label: 'Mobile',
  number: '09171234567',
  is_primary: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockPhoneNumberList = [
  mockPhoneNumber,
  {
    ...mockPhoneNumber,
    id: '223e4567-e89b-12d3-a456-426614174201',
    label: 'Home',
    is_primary: false,
  },
];
