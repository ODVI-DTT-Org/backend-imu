import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { emailService } from '../services/email.js';

const feedback = new Hono();

const feedbackSchema = z.object({
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000),
  appVersion: z.string().optional(),
});

feedback.post(
  '/',
  authMiddleware,
  async (c) => {
    const user = c.get('user');

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return c.json({ success: false, error: firstError?.message ?? 'Validation error' }, 400);
    }

    const { message, appVersion } = parsed.data;

    await emailService.sendFeedback({
      fromEmail: user.email,
      fromName: `${user.first_name} ${user.last_name}`.trim() || user.email,
      message,
      appVersion,
    });

    return c.json({ success: true });
  }
);

export default feedback;
