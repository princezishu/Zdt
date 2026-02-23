-- Add floor-wise support to Apartment & Complex rooms.
-- Safe incremental migration for already-installed module.

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS floor_number INT;

UPDATE rooms
SET floor_number = 1
WHERE floor_number IS NULL;

ALTER TABLE rooms
  ALTER COLUMN floor_number SET DEFAULT 1,
  ALTER COLUMN floor_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_floor_positive_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_floor_positive_check
      CHECK (floor_number >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_building_room_label_unique'
  ) THEN
    ALTER TABLE rooms
      DROP CONSTRAINT rooms_building_room_label_unique;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_building_floor_room_label_unique'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_building_floor_room_label_unique
      UNIQUE (building_id, floor_number, room_label);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rooms_building_floor_idx
  ON rooms (building_id, floor_number, created_at DESC);
