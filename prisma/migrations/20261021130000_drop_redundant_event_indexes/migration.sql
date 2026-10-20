-- Redundant indexes: `firebase_event_id` is already covered by its UNIQUE
-- index (`irrigation_event_firebase_event_id_key`), and `started_at` is the
-- leading column of `irrigation_event_started_at_id_idx`.
DROP INDEX `irrigation_event_firebase_event_id_idx` ON `irrigation_event`;
DROP INDEX `irrigation_event_started_at_idx` ON `irrigation_event`;
