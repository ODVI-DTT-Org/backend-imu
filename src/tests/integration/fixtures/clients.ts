// src/tests/integration/fixtures/clients.ts

export const mockClient = {
  id: '123e4567-e89b-12d3-a456-426614174100',
  user_id: 'user-1',
  first_name: 'Juan',
  last_name: 'Dela Cruz',
  created_at: new Date().toISOString(),
  deleted_at: null,
};

export const mockOtherClient = {
  id: '123e4567-e89b-12d3-a456-426614174101',
  user_id: 'user-2',
  first_name: 'Maria',
  last_name: 'Santos',
  created_at: new Date().toISOString(),
  deleted_at: null,
};
