-- Add groups, targets, and attendance to the PowerSync publication
-- These tables need to sync to mobile devices for offline access

ALTER PUBLICATION powersync ADD TABLE groups;
ALTER PUBLICATION powersync ADD TABLE targets;
ALTER PUBLICATION powersync ADD TABLE attendance;
