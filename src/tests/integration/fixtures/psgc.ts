// src/tests/integration/fixtures/psgc.ts

export const mockPSGC = {
  id: 1,
  code: '130000000',
  region: 'National Capital Region (NCR)',
  province: 'Metro Manila',
  city_municipality: 'Manila',
  barangay: 'Ermita',
};

export const mockPSGCList = [
  mockPSGC,
  {
    id: 2,
    code: '130010000',
    region: 'National Capital Region (NCR)',
    province: 'Metro Manila',
    city_municipality: 'Makati',
    barangay: 'Poblacion',
  },
];
