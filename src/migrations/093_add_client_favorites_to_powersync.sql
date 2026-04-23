-- Add client_favorites to the PowerSync publication
-- This table needs to sync to mobile devices for offline access

ALTER PUBLICATION powersync ADD TABLE client_favorites;
