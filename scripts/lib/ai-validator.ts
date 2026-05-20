import { OpenAI } from 'openai';
import type { MatchingResult, ClientRecord } from './types.js';

/**
 * AI-powered duplicate validation using OpenAI GPT-4o Mini
 * Used for borderline cases (60-80% similarity)
 * Invokes AI with client context for final validation
 */
export class AIValidator {
  private openai: OpenAI;
  private apiCallCount: number = 0;
  private maxRetries: number = 3;
  private timeoutMs: number = 5000;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Validate if two clients are duplicates using AI
   * Returns: 'yes' (duplicate), 'no' (not duplicate), 'unsure' (uncertain)
   */
  async validate(
    clientA: ClientRecord,
    clientB: ClientRecord
  ): Promise<'yes' | 'no' | 'unsure'> {
    const nameA = clientA.fullname || `${clientA.first_name} ${clientA.last_name}`.trim();
    const nameB = clientB.fullname || `${clientB.first_name} ${clientB.last_name}`.trim();

    // Build context message with relevant fields
    const prompt = `You are a duplicate detection system. Determine if these two client records represent the same person.

Client A:
- Name: ${nameA}
- DOB: ${clientA.birth_date || 'Unknown'}
- Agency: ${clientA.agency_name || 'Unknown'}

Client B:
- Name: ${nameB}
- DOB: ${clientB.birth_date || 'Unknown'}
- Agency: ${clientB.agency_name || 'Unknown'}

Are these the same person? Answer with exactly one word: yes, no, or unsure.`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await this.openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 10,
          temperature: 0,
        });

        clearTimeout(timeoutId);
        this.apiCallCount++;

        const content = response.choices[0]?.message?.content?.toLowerCase().trim() || '';

        if (content.includes('yes')) return 'yes';
        if (content.includes('no')) return 'no';
        return 'unsure';
      } catch (error: any) {
        lastError = error;
        if (attempt < this.maxRetries - 1) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    console.warn(
      `[AIValidator] Failed to validate ${nameA} vs ${nameB} after ${this.maxRetries} attempts:`,
      lastError?.message
    );
    return 'unsure';
  }

  /**
   * Get number of API calls made
   */
  getApiCallCount(): number {
    return this.apiCallCount;
  }
}
