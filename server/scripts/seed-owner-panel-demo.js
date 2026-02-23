import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import {
  pool,
  ensureAuthTables,
  ensureBuilderCompanyTables,
  ensureOwnerTables,
} from '../src/db.js';

dotenv.config();

async function hasColumn(tableName, columnName) {
  const rows = await pool.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [tableName, columnName]
  );
  return rows.rowCount > 0;
}

async function ensureUser({ name, email, role, password }) {
  const normalizedEmail = email.toLowerCase();
  const existing = await pool.query('SELECT id, role FROM users WHERE email = $1 LIMIT 1', [
    normalizedEmail,
  ]);
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    if (role && row.role !== role) {
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, row.id]);
    }
    return Number(row.id);
  }

  const hash = await bcrypt.hash(password, 12);
  const inserted = await pool.query(
    `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [name, normalizedEmail, hash, role]
  );
  return Number(inserted.rows[0].id);
}

async function ensureOwnerCompany(ownerId, ownerName, ownerEmail) {
  const code = `owner-${ownerId}`;
  const companyRows = await pool.query(
    `
      INSERT INTO companies (code, name, company_type, email, created_by_user_id)
      VALUES ($1, $2, 'owner', $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, updated_at = NOW()
      RETURNING id
    `,
    [code, `${ownerName} Properties`, ownerEmail, ownerId]
  );
  const companyId = Number(companyRows.rows[0].id);

  await pool.query(
    `
      INSERT INTO owner_profiles (user_id, company_id, display_name, subscription_plan)
      VALUES ($1, $2, $3, 'Pro')
      ON CONFLICT (user_id)
      DO UPDATE SET company_id = EXCLUDED.company_id, display_name = EXCLUDED.display_name
    `,
    [ownerId, companyId, ownerName]
  );

  return companyId;
}

async function seed() {
  await ensureAuthTables();
  await ensureBuilderCompanyTables();
  await ensureOwnerTables();

  const ownerEmail = process.env.OWNER_SEED_EMAIL || 'owner.demo@zdtrealty.local';
  const ownerPassword = process.env.OWNER_SEED_PASSWORD || 'Owner@12345';
  const ownerName = process.env.OWNER_SEED_NAME || 'Aarav Kapoor';

  const userEmail = process.env.USER_SEED_EMAIL || 'renter.demo@zdtrealty.local';
  const userPassword = process.env.USER_SEED_PASSWORD || 'User@12345';

  const ownerId = await ensureUser({
    name: ownerName,
    email: ownerEmail,
    role: 'owner',
    password: ownerPassword,
  });

  const leadUserId = await ensureUser({
    name: 'Nisha Sharma',
    email: userEmail,
    role: 'user',
    password: userPassword,
  });

  const companyId = await ensureOwnerCompany(ownerId, ownerName, ownerEmail);
  const hasPropertyOwnerId = await hasColumn('properties', 'owner_id');
  const hasRentalOwnerId = await hasColumn('rentals', 'owner_id');

  const existingProperty = await pool.query(
    `SELECT id FROM properties WHERE posted_by = $1 AND title = $2 LIMIT 1`,
    [ownerId, 'Skyline Residence - 3BHK']
  );

  let propertyId;
  if (existingProperty.rowCount > 0) {
    propertyId = Number(existingProperty.rows[0].id);
  } else {
    const propertyColumns = [
      'company_id',
      'title',
      'property_type',
      'listing_type',
      'price',
      'price_per_sqft',
      'state',
      'city',
      'area',
      'locality',
      'address',
      'full_address',
      'bedrooms',
      'bathrooms',
      'floor_number',
      'total_floors',
      'facing',
      'is_negotiable',
      'rera_number',
      'image_urls',
      'description',
      'posted_by',
      'created_by_user_id',
      'is_verified',
      'is_featured',
    ];

    const propertyValues = [
      companyId,
      'Skyline Residence - 3BHK',
      'Apartment',
      'sale',
      12500000,
      9200,
      'Maharashtra',
      'Mumbai',
      'Bandra',
      'Bandra West',
      'Hill Road, Bandra West',
      'Hill Road, Bandra West, Mumbai',
      3,
      3,
      12,
      24,
      'East',
      true,
      'RERA-MH-12345',
      ['https://images.unsplash.com/photo-1505691723518-36a5ac3be353?q=80&w=1200&auto=format&fit=crop'],
      'Premium 3BHK with skyline views, club access, and skyline deck.',
      ownerId,
      ownerId,
      true,
      true,
    ];

    if (hasPropertyOwnerId) {
      propertyColumns.unshift('owner_id');
      propertyValues.unshift(ownerId);
    }

    const placeholders = propertyValues.map((_, index) => `$${index + 1}`).join(', ');
    const insertedProperty = await pool.query(
      `
        INSERT INTO properties (
          ${propertyColumns.join(', ')}
        )
        VALUES (
          ${placeholders}
        )
        RETURNING id
      `,
      propertyValues
    );
    propertyId = Number(insertedProperty.rows[0].id);
  }

  const existingRental = await pool.query(
    `SELECT id FROM rentals WHERE posted_by = $1 AND title = $2 LIMIT 1`,
    [ownerId, 'Harbor Heights - 2BHK']
  );

  let rentalId;
  if (existingRental.rowCount > 0) {
    rentalId = Number(existingRental.rows[0].id);
  } else {
    const rentalColumns = [
      'title',
      'description',
      'monthly_rent',
      'security_deposit',
      'maintenance_charges',
      'city',
      'locality',
      'address',
      'property_type',
      'bhk',
      'furnished_status',
      'tenant_preference',
      'available_from',
      'lease_duration',
      'image_urls',
      'posted_by',
      'is_verified',
      'is_featured',
    ];

    const rentalValues = [
      'Harbor Heights - 2BHK',
      'Sea-facing rental with coworking lounge and on-site concierge.',
      52000,
      150000,
      3000,
      'Mumbai',
      'Lower Parel',
      'Senapati Bapat Marg, Lower Parel',
      'Apartment',
      2,
      'full',
      'family',
      new Date().toISOString().slice(0, 10),
      '11 months',
      ['https://images.unsplash.com/photo-1484154218962-a197022b5858?q=80&w=1200&auto=format&fit=crop'],
      ownerId,
      true,
      false,
    ];

    if (hasRentalOwnerId) {
      rentalColumns.unshift('owner_id');
      rentalValues.unshift(ownerId);
    }

    const rentalPlaceholders = rentalValues.map((_, index) => `$${index + 1}`).join(', ');
    const insertedRental = await pool.query(
      `
        INSERT INTO rentals (
          ${rentalColumns.join(', ')}
        )
        VALUES (
          ${rentalPlaceholders}
        )
        RETURNING id
      `,
      rentalValues
    );
    rentalId = Number(insertedRental.rows[0].id);
  }

  await pool.query(
    `
      INSERT INTO leads (property_id, user_id, lead_type, requester_name, requester_phone, requester_email, message, status, notes)
      VALUES ($1, $2, 'contact_seller', 'Nisha Sharma', '+91-9876543210', $3, $4, 'new', '')
      ON CONFLICT DO NOTHING
    `,
    [propertyId, leadUserId, userEmail, 'Interested in a site visit this weekend.']
  );

  await pool.query(
    `
      INSERT INTO rental_leads (rental_id, user_id, message, status, notes)
      VALUES ($1, $2, $3, 'new', '')
      ON CONFLICT DO NOTHING
    `,
    [rentalId, leadUserId, 'Looking to move in next month with family of 3.']
  );

  console.log('Owner panel demo seed complete.');
  console.log(`Owner login: ${ownerEmail} / ${ownerPassword}`);
  console.log(`User login: ${userEmail} / ${userPassword}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
