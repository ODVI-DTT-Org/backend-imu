-- Add notifications and device_tokens to the PowerSync publication.
-- notifications must sync to mobile so the app can display the inbox.
-- device_tokens does NOT need to sync to mobile (backend-only), but
-- notifications is the critical one.

ALTER PUBLICATION powersync ADD TABLE notifications;
