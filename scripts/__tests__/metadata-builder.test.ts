import { describe, it, expect, beforeEach } from 'vitest';
import { MetadataBuilder } from '../lib/metadata-builder';
import type { MatchingResult } from '../lib/types';

describe('MetadataBuilder', () => {
  let builder: MetadataBuilder;

  beforeEach(() => {
    builder = new MetadataBuilder();
  });

  it('should create metadata with no duplicates', () => {
    const metadata = builder.buildMetadata([]);

    expect(metadata.is_possible_duplicate).toBe(false);
    expect(metadata.confidence_score).toBe(0);
    expect(metadata.similar_clients).toHaveLength(0);
    expect(metadata.ai_flagged).toBe(false);
  });

  it('should calculate confidence score as max score * 100', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 0.85, method: 'trigram' },
      { client_id: 'id2', name: 'Client 2', score: 0.7, method: 'fuzzy' },
    ];

    const metadata = builder.buildMetadata(matches);

    expect(metadata.confidence_score).toBe(85);
  });

  it('should mark as duplicate when matches exist', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 0.9, method: 'trigram' },
    ];

    const metadata = builder.buildMetadata(matches);

    expect(metadata.is_possible_duplicate).toBe(true);
  });

  it('should sort similar clients by score descending', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 0.7, method: 'fuzzy' },
      { client_id: 'id2', name: 'Client 2', score: 0.95, method: 'trigram' },
      { client_id: 'id3', name: 'Client 3', score: 0.85, method: 'fuzzy' },
    ];

    const metadata = builder.buildMetadata(matches);

    expect(metadata.similar_clients[0].score).toBe(0.95);
    expect(metadata.similar_clients[1].score).toBe(0.85);
    expect(metadata.similar_clients[2].score).toBe(0.7);
  });

  it('should round scores to 2 decimals', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 0.8765432, method: 'fuzzy' },
    ];

    const metadata = builder.buildMetadata(matches);

    expect(metadata.similar_clients[0].score).toBe(0.88);
  });

  it('should set ai_flagged flag', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 0.85, method: 'ai' },
    ];

    const metadata = builder.buildMetadata(matches, true);

    expect(metadata.ai_flagged).toBe(true);
  });

  it('should set last_checked_at to ISO string', () => {
    const before = new Date().toISOString();
    const metadata = builder.buildMetadata([]);
    const after = new Date().toISOString();

    expect(metadata.last_checked_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(new Date(metadata.last_checked_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    expect(new Date(metadata.last_checked_at).getTime()).toBeLessThanOrEqual(new Date(after).getTime());
  });

  it('should validate correct metadata', () => {
    const metadata = builder.buildMetadata([
      { client_id: 'id1', name: 'Client 1', score: 0.85, method: 'trigram' },
    ]);

    expect(builder.validate(metadata)).toBe(true);
  });

  it('should reject metadata with missing is_possible_duplicate', () => {
    const metadata = builder.buildMetadata([]);
    const invalid = { ...metadata, is_possible_duplicate: null as any };

    expect(builder.validate(invalid)).toBe(false);
  });

  it('should reject metadata with invalid confidence score', () => {
    const metadata = builder.buildMetadata([]);
    const invalid = { ...metadata, confidence_score: 150 };

    expect(builder.validate(invalid)).toBe(false);
  });

  it('should reject metadata with invalid similar client', () => {
    const matches: MatchingResult[] = [
      { client_id: 'id1', name: 'Client 1', score: 1.5, method: 'trigram' }, // Invalid score
    ];
    const metadata = builder.buildMetadata(matches);

    expect(builder.validate(metadata)).toBe(false);
  });
});
