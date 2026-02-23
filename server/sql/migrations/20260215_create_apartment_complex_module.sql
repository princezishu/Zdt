-- Apartment & Complex Management Module
-- Admin-managed buildings, rooms, and monthly rent tracking.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  address TEXT NOT NULL,
  type VARCHAR(20) NOT NULL,
  created_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  floor_number INT NOT NULL DEFAULT 1,
  room_label VARCHAR(80) NOT NULL,
  rent_amount NUMERIC(14, 2) NOT NULL,
  tenant_name VARCHAR(160),
  tenant_phone VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rooms_building_floor_room_label_unique UNIQUE (building_id, floor_number, room_label)
);

CREATE TABLE IF NOT EXISTS rent_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  month_key VARCHAR(7) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'unpaid',
  due_date DATE,
  paid_date DATE,
  amount_paid NUMERIC(14, 2),
  payment_method VARCHAR(10),
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rent_payments_room_month_unique UNIQUE (room_id, month_key)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'buildings_type_check'
  ) THEN
    ALTER TABLE buildings
      ADD CONSTRAINT buildings_type_check
      CHECK (type IN ('residential', 'commercial', 'mixed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rooms_rent_positive_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_rent_positive_check
      CHECK (rent_amount > 0);
  END IF;
END $$;

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
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_status_check'
  ) THEN
    ALTER TABLE rent_payments
      ADD CONSTRAINT rent_payments_status_check
      CHECK (status IN ('paid', 'unpaid'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_month_key_check'
  ) THEN
    ALTER TABLE rent_payments
      ADD CONSTRAINT rent_payments_month_key_check
      CHECK (month_key ~ '^\\d{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_payment_method_check'
  ) THEN
    ALTER TABLE rent_payments
      ADD CONSTRAINT rent_payments_payment_method_check
      CHECK (
        payment_method IS NULL
        OR payment_method IN ('cash', 'upi', 'bank')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_payments_amount_positive_check'
  ) THEN
    ALTER TABLE rent_payments
      ADD CONSTRAINT rent_payments_amount_positive_check
      CHECK (amount_paid IS NULL OR amount_paid > 0);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_rent_payments_updated_at ON rent_payments;
CREATE TRIGGER trg_rent_payments_updated_at
BEFORE UPDATE ON rent_payments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS buildings_created_idx
  ON buildings (created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_building_idx
  ON rooms (building_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rooms_building_floor_idx
  ON rooms (building_id, floor_number, created_at DESC);
CREATE INDEX IF NOT EXISTS rent_payments_room_month_idx
  ON rent_payments (room_id, month_key);
CREATE INDEX IF NOT EXISTS rent_payments_month_status_idx
  ON rent_payments (month_key, status);
