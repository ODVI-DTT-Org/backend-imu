// Matching method identifiers
export type SimilarityMethod = 'trigram' | 'fuzzy' | 'ai';

// Single similar client record
export interface SimilarClient {
  id: string;
  name: string;
  similarity_method: SimilarityMethod;
  score: number; // 0-1
}

// Complete metadata object
export interface DuplicateMetadata {
  is_possible_duplicate: boolean;
  confidence_score: number; // 0-100
  similar_clients: SimilarClient[];
  ai_flagged: boolean;
  last_checked_at: string; // ISO8601
}

// Client record from database
export interface ClientRecord {
  id: string;
  fullname?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  agency_name?: string;
  duplicate_metadata?: DuplicateMetadata | null;
}

// Matching result from a single strategy
export interface MatchingResult {
  client_id: string;
  name: string;
  score: number; // 0-1
  method: SimilarityMethod;
}

// Script options from CLI
export interface ScriptOptions {
  all: boolean;
  batchSize: number;
  dryRun: boolean;
  aiDisabled: boolean;
}
