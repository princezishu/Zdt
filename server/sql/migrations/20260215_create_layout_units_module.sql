-- Layout-Based Room / Unit Management Module
-- Extend-only migration for floor layouts, units, and marker mapping.

CREATE OR REPLACE FUNCTION set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS floors (
  id BIGSERIAL PRIMARY KEY,
  building_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floor_number INT NOT NULL,
  floor_name VARCHAR(80) NOT NULL DEFAULT '',
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT floors_building_floor_unique UNIQUE (building_id, floor_number)
);

CREATE TABLE IF NOT EXISTS layout_files (
  id BIGSERIAL PRIMARY KEY,
  floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type VARCHAR(16) NOT NULL DEFAULT 'image',
  mime_type VARCHAR(80) NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  original_name VARCHAR(180) NOT NULL DEFAULT '',
  uploaded_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'layout_files_file_type_check'
  ) THEN
    ALTER TABLE layout_files
      ADD CONSTRAINT layout_files_file_type_check
      CHECK (file_type IN ('image', 'pdf'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS units (
  id BIGSERIAL PRIMARY KEY,
  floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  layout_file_id BIGINT REFERENCES layout_files(id) ON DELETE SET NULL,
  unit_number VARCHAR(50) NOT NULL,
  unit_type VARCHAR(24) NOT NULL,
  category VARCHAR(24) NOT NULL,
  listing_type VARCHAR(16) NOT NULL,
  area_covered NUMERIC(14, 2) NOT NULL,
  rent_amount NUMERIC(14, 2),
  deposit_amount NUMERIC(14, 2),
  maintenance_amount NUMERIC(14, 2),
  sale_price NUMERIC(14, 2),
  lease_amount NUMERIC(14, 2),
  status VARCHAR(20) NOT NULL DEFAULT 'Available',
  occupied_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT units_floor_unit_unique UNIQUE (floor_id, unit_number)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_unit_type_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_unit_type_check
      CHECK (unit_type IN ('Flat', 'Room', 'Shop', 'Office'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_category_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_category_check
      CHECK (category IN ('Residential', 'Commercial'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_listing_type_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_listing_type_check
      CHECK (listing_type IN ('Rent', 'Sale', 'Lease'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_status_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_status_check
      CHECK (status IN ('Available', 'Occupied', 'Maintenance'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_pricing_requirements_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_pricing_requirements_check
      CHECK (
        (listing_type <> 'Rent' OR rent_amount IS NOT NULL)
        AND (listing_type <> 'Sale' OR sale_price IS NOT NULL)
        AND (listing_type <> 'Lease' OR lease_amount IS NOT NULL)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'units_occupied_tenant_check'
  ) THEN
    ALTER TABLE units
      ADD CONSTRAINT units_occupied_tenant_check
      CHECK (
        (status <> 'Occupied')
        OR (occupied_by_user_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS unit_amenities (
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  amenity_id BIGINT NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unit_id, amenity_id)
);

CREATE TABLE IF NOT EXISTS layout_markers (
  id BIGSERIAL PRIMARY KEY,
  floor_id BIGINT NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  marker_x NUMERIC(8, 4) NOT NULL,
  marker_y NUMERIC(8, 4) NOT NULL,
  created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT layout_markers_floor_unit_unique UNIQUE (floor_id, unit_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'layout_markers_xy_range_check'
  ) THEN
    ALTER TABLE layout_markers
      ADD CONSTRAINT layout_markers_xy_range_check
      CHECK (
        marker_x >= 0 AND marker_x <= 100
        AND marker_y >= 0 AND marker_y <= 100
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_floors_updated_at ON floors;
CREATE TRIGGER trg_floors_updated_at
BEFORE UPDATE ON floors
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_layout_files_updated_at ON layout_files;
CREATE TRIGGER trg_layout_files_updated_at
BEFORE UPDATE ON layout_files
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_units_updated_at ON units;
CREATE TRIGGER trg_units_updated_at
BEFORE UPDATE ON units
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_unit_amenities_updated_at ON unit_amenities;
CREATE TRIGGER trg_unit_amenities_updated_at
BEFORE UPDATE ON unit_amenities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_layout_markers_updated_at ON layout_markers;
CREATE TRIGGER trg_layout_markers_updated_at
BEFORE UPDATE ON layout_markers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at_timestamp();

CREATE INDEX IF NOT EXISTS floors_building_idx
  ON floors (building_id, floor_number);
CREATE INDEX IF NOT EXISTS layout_files_floor_created_idx
  ON layout_files (floor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS units_floor_status_idx
  ON units (floor_id, status);
CREATE INDEX IF NOT EXISTS units_listing_type_idx
  ON units (listing_type);
CREATE INDEX IF NOT EXISTS layout_markers_floor_idx
  ON layout_markers (floor_id, updated_at DESC);
