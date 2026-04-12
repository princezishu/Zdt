import bcrypt from 'bcryptjs';
import {
  ensureAuthTables,
  ensureBuilderCompanyTables,
  pool,
} from '../src/db.js';

const PASSWORDS = {
  customer: 'SeedUser@123',
  admin: 'SeedAdmin@123',
  team: 'SeedTeam@123',
  owner: 'SeedOwner@123',
};

const customerUsers = [
  { key: 'customer_1', name: 'Seed User 1', email: 'seed.user1@zdt.local', phone: '+919100000101' },
  { key: 'customer_2', name: 'Seed User 2', email: 'seed.user2@zdt.local', phone: '+919100000102' },
  { key: 'customer_3', name: 'Seed User 3', email: 'seed.user3@zdt.local', phone: '+919100000103' },
  { key: 'customer_4', name: 'Seed User 4', email: 'seed.user4@zdt.local', phone: '+919100000104' },
  { key: 'customer_5', name: 'Seed User 5', email: 'seed.user5@zdt.local', phone: '+919100000105' },
];

const adminUser = {
  key: 'admin_1',
  name: 'Seed Admin 1',
  email: 'seed.admin1@zdt.local',
  phone: '+919100000201',
};

const teamMembers = [
  { key: 'team_1', name: 'Seed Team 1', email: 'seed.team1@zdt.local', phone: '+919100000301' },
  { key: 'team_2', name: 'Seed Team 2', email: 'seed.team2@zdt.local', phone: '+919100000302' },
  { key: 'team_3', name: 'Seed Team 3', email: 'seed.team3@zdt.local', phone: '+919100000303' },
  { key: 'team_4', name: 'Seed Team 4', email: 'seed.team4@zdt.local', phone: '+919100000304' },
  { key: 'team_5', name: 'Seed Team 5', email: 'seed.team5@zdt.local', phone: '+919100000305' },
];

const companyOwners = [
  {
    key: 'builder_owner',
    name: 'Seed Builder Owner',
    email: 'seed.builder.owner@zdt.local',
    phone: '+919100000401',
  },
  {
    key: 'dealer_owner',
    name: 'Seed Dealer Owner',
    email: 'seed.dealer.owner@zdt.local',
    phone: '+919100000402',
  },
];

const companies = [
  {
    key: 'builder_main',
    ownerKey: 'builder_owner',
    companyCode: 'COMP-SEED-B01',
    name: 'Seed Skyline Builders',
    companyType: 'builder',
    city: 'Hyderabad',
    state: 'Telangana',
    area: 'Gachibowli',
    address: 'Seed Skyline Builders, Gachibowli, Hyderabad',
    websiteUrl: 'https://seed-skyline-builders.example.com',
    phone: '+91-91000-04001',
    email: 'contact@seed-skyline-builders.example.com',
    reraNumber: 'RERA-SEED-B01',
    description: 'Seed builder company for demo listings and projects.',
    serviceAreas: ['Hyderabad', 'Secunderabad'],
    logoUrl: '/images/logo.png',
    bannerUrl: '/images/hero-bg.jpg',
    isVerified: true,
  },
  {
    key: 'dealer_main',
    ownerKey: 'dealer_owner',
    companyCode: 'COMP-SEED-D01',
    name: 'Seed Metro Dealers',
    companyType: 'dealer',
    city: 'Pune',
    state: 'Maharashtra',
    area: 'Wakad',
    address: 'Seed Metro Dealers, Wakad, Pune',
    websiteUrl: 'https://seed-metro-dealers.example.com',
    phone: '+91-91000-04002',
    email: 'contact@seed-metro-dealers.example.com',
    reraNumber: 'RERA-SEED-D01',
    description: 'Seed dealer company for demo listings and projects.',
    serviceAreas: ['Pune', 'PCMC'],
    logoUrl: '/images/logo.png',
    bannerUrl: '/images/hero-bg.jpg',
    isVerified: true,
  },
];

const projectSeeds = [
  {
    key: 'seed_construct_residency',
    companyKey: 'builder_main',
    projectName: 'SEED Construct Residency One',
    projectType: 'Apartment',
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Kokapet',
    fullAddress: 'SEED Construct Residency One, Kokapet, Hyderabad',
    landmark: 'Near Financial District',
    priceMin: 7200000,
    priceMax: 12800000,
    pricePerSqft: 7800,
    configurations: ['2 BHK', '3 BHK'],
    totalUnits: 180,
    totalFloors: 16,
    totalArea: 220000,
    possessionDate: '2027-03-31',
    status: 'Under Construction',
    imageUrls: ['/images/property-1.jpg'],
    highlights: 'Construct-with-us showcase project: apartment towers with full amenities.',
    isConstructProject: true,
  },
  {
    key: 'seed_construct_business_hub',
    companyKey: 'builder_main',
    projectName: 'SEED Construct Business Hub',
    projectType: 'Commercial',
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Madhapur',
    fullAddress: 'SEED Construct Business Hub, Madhapur, Hyderabad',
    landmark: 'Near HITEC City',
    priceMin: 9800000,
    priceMax: 22800000,
    pricePerSqft: 10200,
    configurations: ['Office', 'Retail'],
    totalUnits: 92,
    totalFloors: 12,
    totalArea: 160000,
    possessionDate: '2026-12-31',
    status: 'Ready to Move',
    imageUrls: ['/images/property-4.jpg'],
    highlights: 'Construct-with-us showcase project: ready commercial complex.',
    isConstructProject: true,
  },
  {
    key: 'seed_villa_county',
    companyKey: 'builder_main',
    projectName: 'SEED Green Villa County',
    projectType: 'Villa',
    state: 'Telangana',
    city: 'Hyderabad',
    area: 'Shamshabad',
    fullAddress: 'SEED Green Villa County, Shamshabad, Hyderabad',
    landmark: 'Near ORR Exit 14',
    priceMin: 14500000,
    priceMax: 31000000,
    pricePerSqft: 8900,
    configurations: ['3 BHK Villa', '4 BHK Villa'],
    totalUnits: 74,
    totalFloors: 2,
    totalArea: 140000,
    possessionDate: '2027-09-30',
    status: 'Upcoming',
    imageUrls: ['/images/property-2.jpg'],
    highlights: 'Premium gated villa project with private gardens.',
    isConstructProject: false,
  },
  {
    key: 'seed_plot_estate',
    companyKey: 'dealer_main',
    projectName: 'SEED Metro Plot Estate',
    projectType: 'Plotted',
    state: 'Maharashtra',
    city: 'Pune',
    area: 'Hinjawadi Phase 3',
    fullAddress: 'SEED Metro Plot Estate, Hinjawadi Phase 3, Pune',
    landmark: 'Near IT Park Ring Road',
    priceMin: 2800000,
    priceMax: 7600000,
    pricePerSqft: 3600,
    configurations: ['1200 sq.ft', '1500 sq.ft', '2000 sq.ft'],
    totalUnits: 210,
    totalFloors: 0,
    totalArea: 310000,
    possessionDate: '2026-10-31',
    status: 'Under Construction',
    imageUrls: ['/images/property-3.jpg'],
    highlights: 'Plotted development with internal roads and clubhouse.',
    isConstructProject: false,
  },
  {
    key: 'seed_trade_arcade',
    companyKey: 'dealer_main',
    projectName: 'SEED Trade Arcade Complex',
    projectType: 'Commercial',
    state: 'Maharashtra',
    city: 'Pune',
    area: 'Baner',
    fullAddress: 'SEED Trade Arcade Complex, Baner, Pune',
    landmark: 'Near Baner Highway Junction',
    priceMin: 6200000,
    priceMax: 16800000,
    pricePerSqft: 9200,
    configurations: ['Shop', 'Office'],
    totalUnits: 110,
    totalFloors: 8,
    totalArea: 120000,
    possessionDate: '2026-08-31',
    status: 'Ready to Move',
    imageUrls: ['/images/property-4.jpg'],
    highlights: 'Commercial retail and office spaces in a prime micro-market.',
    isConstructProject: false,
  },
  {
    key: 'seed_lakeview_apartments',
    companyKey: 'dealer_main',
    projectName: 'SEED Lakeview Apartments',
    projectType: 'Apartment',
    state: 'Maharashtra',
    city: 'Pune',
    area: 'Kharadi',
    fullAddress: 'SEED Lakeview Apartments, Kharadi, Pune',
    landmark: 'Near World Trade Center',
    priceMin: 5400000,
    priceMax: 12400000,
    pricePerSqft: 7400,
    configurations: ['1 BHK', '2 BHK', '3 BHK'],
    totalUnits: 260,
    totalFloors: 14,
    totalArea: 210000,
    possessionDate: '2027-06-30',
    status: 'Upcoming',
    imageUrls: ['/images/property-1.jpg'],
    highlights: 'Mid-segment apartment project near IT offices.',
    isConstructProject: false,
  },
];

const listingSeeds = [
  {
    referenceId: 'SEED-LIST-001',
    requestType: 'sell',
    submittedBy: 'customer_1',
    city: 'Hyderabad',
    locality: 'Kokapet',
    propertyType: 'Plot',
    address: 'Plot 21, Kokapet, Hyderabad',
    price: 5600000,
    details: { plotArea: '1800', facing: 'East', approvals: 'RERA + NA', vastu: { scorePreview: 82 } },
  },
  {
    referenceId: 'SEED-LIST-002',
    requestType: 'sell',
    submittedBy: 'customer_2',
    city: 'Bengaluru',
    locality: 'Whitefield',
    propertyType: 'Villa',
    address: 'Villa 12, Whitefield, Bengaluru',
    price: 18200000,
    details: { bhk: '4 BHK', builtUpArea: '2800', parking: '2', vastu: { scorePreview: 77 } },
  },
  {
    referenceId: 'SEED-LIST-003',
    requestType: 'sell',
    submittedBy: 'customer_3',
    city: 'Pune',
    locality: 'Wakad',
    propertyType: 'Flat / Apartment',
    address: 'Tower C, Wakad, Pune',
    price: 8800000,
    details: { bhk: '3 BHK', carpetArea: '1180', floorPreference: 'Middle', vastu: { scorePreview: 74 } },
  },
  {
    referenceId: 'SEED-LIST-004',
    requestType: 'sell',
    submittedBy: 'customer_4',
    city: 'Mumbai',
    locality: 'Andheri East',
    propertyType: 'Commercial',
    address: 'Office 705, Andheri East, Mumbai',
    price: 22500000,
    details: { type: 'Office', area: '1450', powerBackup: 'Yes', vastu: { scorePreview: 69 } },
  },
  {
    referenceId: 'SEED-LIST-005',
    requestType: 'rent',
    submittedBy: 'customer_5',
    city: 'Hyderabad',
    locality: 'Gachibowli',
    propertyType: 'Flat / Apartment',
    address: 'Block A, Gachibowli, Hyderabad',
    monthlyRent: 38000,
    deposit: 76000,
    details: { bhk: '2 BHK', carpetArea: '1050', furnishing: 'Semi-Furnished', vastu: { scorePreview: 81 } },
  },
  {
    referenceId: 'SEED-LIST-006',
    requestType: 'rent',
    submittedBy: 'customer_1',
    city: 'Noida',
    locality: 'Sector 137',
    propertyType: 'Villa',
    address: 'Villa 8, Sector 137, Noida',
    monthlyRent: 65000,
    deposit: 130000,
    details: { bhk: '4 BHK', builtUpArea: '3000', gatedCommunity: 'Yes', vastu: { scorePreview: 72 } },
  },
  {
    referenceId: 'SEED-LIST-007',
    requestType: 'sell',
    submittedBy: 'customer_2',
    city: 'Chennai',
    locality: 'OMR',
    propertyType: 'Plot',
    address: 'Plot 44, OMR, Chennai',
    price: 4700000,
    details: { plotArea: '1600', roadAccess: '40ft', cornerPlot: 'No', vastu: { scorePreview: 79 } },
  },
  {
    referenceId: 'SEED-LIST-008',
    requestType: 'rent',
    submittedBy: 'customer_3',
    city: 'Gurugram',
    locality: 'Sector 57',
    propertyType: 'Commercial',
    address: 'Retail 04, Sector 57, Gurugram',
    monthlyRent: 72000,
    deposit: 150000,
    details: { type: 'Shop', area: '900', frontage: '22', parking: 'Yes', vastu: { scorePreview: 66 } },
  },
  {
    referenceId: 'SEED-LIST-009',
    requestType: 'sell',
    submittedBy: 'customer_4',
    city: 'Kolkata',
    locality: 'New Town',
    propertyType: 'Flat / Apartment',
    address: 'Tower B, New Town, Kolkata',
    price: 6300000,
    details: { bhk: '2 BHK', carpetArea: '980', floorPreference: 'Higher', vastu: { scorePreview: 76 } },
  },
  {
    referenceId: 'SEED-LIST-010',
    requestType: 'rent',
    submittedBy: 'customer_5',
    city: 'Ahmedabad',
    locality: 'SG Highway',
    propertyType: 'Flat / Apartment',
    address: 'Block D, SG Highway, Ahmedabad',
    monthlyRent: 26000,
    deposit: 52000,
    details: { bhk: '2 BHK', carpetArea: '920', furnishing: 'Furnished', vastu: { scorePreview: 84 } },
  },
];

const hashCache = new Map();

function isRoleSeatLimitError(error) {
  if (!error || typeof error !== 'object') return false;
  if (error.code !== 'P0001') return false;
  const text = String(error.message || '').toLowerCase();
  return text.includes('limit reached');
}

async function getPasswordHash(password) {
  if (hashCache.has(password)) {
    return hashCache.get(password);
  }
  const nextHash = await bcrypt.hash(password, 12);
  hashCache.set(password, nextHash);
  return nextHash;
}

async function upsertUser({
  name,
  email,
  phone,
  role,
  password,
  accountType = 'individual',
  subscriptionTier = 'free',
  isMainAdmin = false,
  forcePasswordReset = false,
}) {
  const passwordHash = await getPasswordHash(password);
  const normalizedEmail = email.toLowerCase();
  const existing = await pool.query(
    `
      SELECT id
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail]
  );

  let result;
  if (existing.rowCount > 0) {
    result = await pool.query(
      `
        UPDATE users
        SET
          name = $2,
          password_hash = $3,
          phone = $4,
          role = $5,
          account_type = $6,
          subscription_tier = $7,
          is_main_admin = $8,
          is_active = TRUE,
          force_password_reset = $9
        WHERE id = $1
        RETURNING
          id,
          name,
          email,
          role,
          account_type,
          subscription_tier,
          is_main_admin
      `,
      [
        Number(existing.rows[0].id),
        name,
        passwordHash,
        phone || null,
        role,
        accountType,
        subscriptionTier,
        Boolean(isMainAdmin),
        forcePasswordReset,
      ]
    );
  } else {
    result = await pool.query(
      `
        INSERT INTO users (
          name,
          email,
          password_hash,
          phone,
          role,
          account_type,
          subscription_tier,
          is_main_admin,
          is_active,
          force_password_reset
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
        RETURNING
          id,
          name,
          email,
          role,
          account_type,
          subscription_tier,
          is_main_admin
      `,
      [
        name,
        normalizedEmail,
        passwordHash,
        phone || null,
        role,
        accountType,
        subscriptionTier,
        Boolean(isMainAdmin),
        forcePasswordReset,
      ]
    );
  }

  return result.rows[0];
}

function buildPlanConfig(subscriptionTier) {
  if (subscriptionTier === 'enterprise') {
    return {
      planId: 'enterprise_plan',
      listingQuota: 1000,
      boostCredits: 200,
      features: {
        crm_access: true,
        analytics_access: true,
        verified_eligibility: true,
        priority_support: true,
      },
    };
  }

  if (subscriptionTier === 'premium') {
    return {
      planId: 'premium_plan',
      listingQuota: 200,
      boostCredits: 60,
      features: {
        crm_access: true,
        analytics_access: true,
        verified_eligibility: true,
      },
    };
  }

  if (subscriptionTier === 'pro') {
    return {
      planId: 'pro_plan',
      listingQuota: 50,
      boostCredits: 20,
      features: {
        crm_access: true,
        analytics_access: true,
        verified_eligibility: false,
      },
    };
  }

  return {
    planId: 'free_plan',
    listingQuota: 10,
    boostCredits: 3,
    features: {
      crm_access: false,
      analytics_access: false,
      verified_eligibility: false,
    },
  };
}

async function upsertActiveSubscription({ userId, subscriptionTier, createdByUserId = null }) {
  const planConfig = buildPlanConfig(subscriptionTier);
  await pool.query(
    `
      INSERT INTO subscriptions (
        user_id,
        plan_id,
        subscription_tier,
        start_date,
        end_date,
        features_json,
        listing_quota,
        boost_credits,
        is_active,
        created_by_user_id
      )
      VALUES (
        $1,
        $2,
        $3,
        CURRENT_DATE,
        NULL,
        $4::jsonb,
        $5,
        $6,
        TRUE,
        $7
      )
      ON CONFLICT (user_id) WHERE is_active = TRUE
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        subscription_tier = EXCLUDED.subscription_tier,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        features_json = EXCLUDED.features_json,
        listing_quota = EXCLUDED.listing_quota,
        boost_credits = EXCLUDED.boost_credits,
        is_active = EXCLUDED.is_active,
        created_by_user_id = EXCLUDED.created_by_user_id,
        updated_at = NOW()
    `,
    [
      userId,
      planConfig.planId,
      subscriptionTier,
      JSON.stringify(planConfig.features),
      planConfig.listingQuota,
      planConfig.boostCredits,
      createdByUserId,
    ]
  );
}

async function upsertCompanyWithOwner(companySeed, ownerUserId) {
  const companyResult = await pool.query(
    `
      INSERT INTO builder_companies (
        company_code,
        name,
        company_type,
        logo_url,
        created_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_code)
      DO UPDATE SET
        name = EXCLUDED.name,
        company_type = EXCLUDED.company_type,
        logo_url = EXCLUDED.logo_url,
        created_by_user_id = EXCLUDED.created_by_user_id,
        updated_at = NOW()
      RETURNING id
    `,
    [
      companySeed.companyCode,
      companySeed.name,
      companySeed.companyType,
      companySeed.logoUrl || '',
      ownerUserId,
    ]
  );

  const companyId = Number(companyResult.rows[0].id);

  await pool.query(
    `
      UPDATE users
      SET company_id = $1,
          company_role = 'owner'
      WHERE id = $2
    `,
    [companyId, ownerUserId]
  );

  await pool.query(
    `
      INSERT INTO companies (
        id,
        code,
        name,
        company_type,
        city,
        state,
        area,
        address,
        website_url,
        phone,
        email,
        rera_number,
        description,
        service_areas,
        logo_url,
        banner_url,
        is_verified,
        created_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14::TEXT[], $15, $16, $17, $18
      )
      ON CONFLICT (id)
      DO UPDATE SET
        code = EXCLUDED.code,
        name = EXCLUDED.name,
        company_type = EXCLUDED.company_type,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        area = EXCLUDED.area,
        address = EXCLUDED.address,
        website_url = EXCLUDED.website_url,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        rera_number = EXCLUDED.rera_number,
        description = EXCLUDED.description,
        service_areas = EXCLUDED.service_areas,
        logo_url = EXCLUDED.logo_url,
        banner_url = EXCLUDED.banner_url,
        is_verified = EXCLUDED.is_verified,
        created_by_user_id = EXCLUDED.created_by_user_id,
        updated_at = NOW()
    `,
    [
      companyId,
      companySeed.companyCode,
      companySeed.name,
      companySeed.companyType,
      companySeed.city,
      companySeed.state,
      companySeed.area,
      companySeed.address,
      companySeed.websiteUrl,
      companySeed.phone,
      companySeed.email,
      companySeed.reraNumber,
      companySeed.description,
      companySeed.serviceAreas,
      companySeed.logoUrl || '',
      companySeed.bannerUrl || '',
      Boolean(companySeed.isVerified),
      ownerUserId,
    ]
  );

  return companyId;
}

async function upsertProject(projectSeed, companyId, ownerUserId) {
  const existing = await pool.query(
    `
      SELECT id
      FROM projects
      WHERE company_id = $1
        AND project_name = $2
      LIMIT 1
    `,
    [companyId, projectSeed.projectName]
  );

  if (existing.rowCount > 0) {
    const projectId = Number(existing.rows[0].id);
    await pool.query(
      `
        UPDATE projects
        SET
          project_type = $3,
          state = $4,
          city = $5,
          area = $6,
          full_address = $7,
          landmark = $8,
          price_min = $9,
          price_max = $10,
          price_per_sqft = $11,
          configurations = $12::TEXT[],
          total_units = $13,
          total_floors = $14,
          total_area = $15,
          possession_date = $16,
          status = $17,
          image_urls = $18::TEXT[],
          highlights = $19,
          created_by_user_id = $20,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        projectId,
        companyId,
        projectSeed.projectType,
        projectSeed.state,
        projectSeed.city,
        projectSeed.area,
        projectSeed.fullAddress,
        projectSeed.landmark,
        projectSeed.priceMin,
        projectSeed.priceMax,
        projectSeed.pricePerSqft,
        projectSeed.configurations,
        projectSeed.totalUnits,
        projectSeed.totalFloors,
        projectSeed.totalArea,
        projectSeed.possessionDate,
        projectSeed.status,
        projectSeed.imageUrls,
        projectSeed.highlights,
        ownerUserId,
      ]
    );
    return projectId;
  }

  const inserted = await pool.query(
    `
      INSERT INTO projects (
        company_id,
        project_name,
        project_type,
        state,
        city,
        area,
        full_address,
        landmark,
        price_min,
        price_max,
        price_per_sqft,
        configurations,
        total_units,
        total_floors,
        total_area,
        possession_date,
        status,
        image_urls,
        highlights,
        created_by_user_id
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12::TEXT[],
        $13, $14, $15, $16, $17, $18::TEXT[], $19, $20
      )
      RETURNING id
    `,
    [
      companyId,
      projectSeed.projectName,
      projectSeed.projectType,
      projectSeed.state,
      projectSeed.city,
      projectSeed.area,
      projectSeed.fullAddress,
      projectSeed.landmark,
      projectSeed.priceMin,
      projectSeed.priceMax,
      projectSeed.pricePerSqft,
      projectSeed.configurations,
      projectSeed.totalUnits,
      projectSeed.totalFloors,
      projectSeed.totalArea,
      projectSeed.possessionDate,
      projectSeed.status,
      projectSeed.imageUrls,
      projectSeed.highlights,
      ownerUserId,
    ]
  );

  return Number(inserted.rows[0].id);
}

async function upsertBuilderProject(projectSeed, companyId, ownerUserId, publicProjectId) {
  const existing = await pool.query(
    `
      SELECT id
      FROM builder_projects
      WHERE company_id = $1
        AND title = $2
      LIMIT 1
    `,
    [companyId, projectSeed.projectName]
  );

  const details = {
    projectType: projectSeed.projectType,
    status: projectSeed.status,
    fullAddress: projectSeed.fullAddress,
    landmark: projectSeed.landmark,
    priceMin: projectSeed.priceMin,
    priceMax: projectSeed.priceMax,
    pricePerSqft: projectSeed.pricePerSqft,
    configurations: projectSeed.configurations,
    totalUnits: projectSeed.totalUnits,
    totalFloors: projectSeed.totalFloors,
    totalArea: projectSeed.totalArea,
    possessionDate: projectSeed.possessionDate,
    imageUrls: projectSeed.imageUrls,
    highlights: projectSeed.highlights,
  };

  if (existing.rowCount > 0) {
    await pool.query(
      `
        UPDATE builder_projects
        SET
          city = $3,
          location = $4,
          description = $5,
          details = $6::jsonb,
          status = 'approved',
          approved_by_user_id = $7,
          approved_at = COALESCE(approved_at, NOW()),
          public_project_id = $8,
          updated_at = NOW()
        WHERE id = $1
          AND company_id = $2
      `,
      [
        Number(existing.rows[0].id),
        companyId,
        projectSeed.city,
        projectSeed.area,
        projectSeed.highlights,
        JSON.stringify(details),
        ownerUserId,
        publicProjectId,
      ]
    );
    return;
  }

  await pool.query(
    `
      INSERT INTO builder_projects (
        company_id,
        title,
        city,
        location,
        description,
        details,
        status,
        created_by_user_id,
        approved_by_user_id,
        approved_at,
        public_project_id
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'approved', $7, $7, NOW(), $8)
    `,
    [
      companyId,
      projectSeed.projectName,
      projectSeed.city,
      projectSeed.area,
      projectSeed.highlights,
      JSON.stringify(details),
      ownerUserId,
      publicProjectId,
    ]
  );
}

function buildListingPricing(seed) {
  if (seed.requestType === 'rent') {
    return {
      monthlyRent: seed.monthlyRent,
      securityDeposit: seed.deposit,
    };
  }
  return {
    expectedPrice: seed.price,
  };
}

async function upsertPropertyRequest(seed, requester) {
  const pricing = buildListingPricing(seed);
  const lifecycleStatus = 'approved';
  const moderationNotes = 'Seed dataset: approved for demo visibility.';
  const riskScore = seed.requestType === 'rent' ? 24 : 18;
  const engagementScore = seed.requestType === 'rent' ? 14 : 18;
  const boostWeight = 4;

  await pool.query(
    `
      INSERT INTO property_requests (
        reference_id,
        request_type,
        source,
        submitted_by_user_id,
        requester_name,
        requester_phone,
        requester_email,
        city,
        locality,
        property_type,
        address,
        map_pin,
        pricing,
        details,
        need_help,
        help_type,
        preferred_call_time,
        assisted_listing,
        interaction_status,
        listing_status,
        workflow_stage,
        is_featured,
        is_fake,
        is_removed,
        lifecycle_status,
        moderation_notes,
        risk_score,
        engagement_score,
        boost_weight
      )
      VALUES (
        $1, $2, 'public', $3, $4, $5, $6, $7, $8, $9, $10, '',
        $11::jsonb, $12::jsonb, FALSE, NULL, NULL, FALSE,
        'New', 'Approved', 'Approved', FALSE, FALSE, FALSE, $13, $14, $15, $16, $17
      )
      ON CONFLICT (reference_id)
      DO UPDATE SET
        request_type = EXCLUDED.request_type,
        source = EXCLUDED.source,
        submitted_by_user_id = EXCLUDED.submitted_by_user_id,
        requester_name = EXCLUDED.requester_name,
        requester_phone = EXCLUDED.requester_phone,
        requester_email = EXCLUDED.requester_email,
        city = EXCLUDED.city,
        locality = EXCLUDED.locality,
        property_type = EXCLUDED.property_type,
        address = EXCLUDED.address,
        map_pin = EXCLUDED.map_pin,
        pricing = EXCLUDED.pricing,
        details = EXCLUDED.details,
        need_help = EXCLUDED.need_help,
        help_type = EXCLUDED.help_type,
        preferred_call_time = EXCLUDED.preferred_call_time,
        assisted_listing = EXCLUDED.assisted_listing,
        interaction_status = EXCLUDED.interaction_status,
        listing_status = EXCLUDED.listing_status,
        workflow_stage = EXCLUDED.workflow_stage,
        is_featured = EXCLUDED.is_featured,
        is_fake = EXCLUDED.is_fake,
        is_removed = EXCLUDED.is_removed,
        lifecycle_status = EXCLUDED.lifecycle_status,
        moderation_notes = EXCLUDED.moderation_notes,
        risk_score = EXCLUDED.risk_score,
        engagement_score = EXCLUDED.engagement_score,
        boost_weight = EXCLUDED.boost_weight,
        updated_at = NOW()
    `,
    [
      seed.referenceId,
      seed.requestType,
      requester.id,
      requester.name,
      requester.phone,
      requester.email,
      seed.city,
      seed.locality,
      seed.propertyType,
      seed.address,
      JSON.stringify(pricing),
      JSON.stringify(seed.details || {}),
      lifecycleStatus,
      moderationNotes,
      riskScore,
      engagementScore,
      boostWeight,
    ]
  );
}

async function fetchSummaryCounts() {
  const [seedUserRows, listingRows, projectRows, companyRows, teamRows, adminRows, subscriptionRows] =
    await Promise.all([
    pool.query(`SELECT COUNT(*)::INT AS count FROM users WHERE email LIKE 'seed.%@zdt.local'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM property_requests WHERE reference_id LIKE 'SEED-LIST-%'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM projects WHERE project_name LIKE 'SEED %'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM builder_companies WHERE company_code LIKE 'COMP-SEED-%'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM users WHERE role = 'team_member' AND email LIKE 'seed.team%@zdt.local'`),
    pool.query(`SELECT COUNT(*)::INT AS count FROM users WHERE role = 'admin' AND email = 'seed.admin1@zdt.local'`),
    pool.query(
      `
        SELECT COUNT(*)::INT AS count
        FROM subscriptions s
        INNER JOIN users u
          ON u.id = s.user_id
        WHERE u.email LIKE 'seed.%@zdt.local'
          AND s.is_active = TRUE
      `
    ),
    ]);

  return {
    seededUsers: Number(seedUserRows.rows[0].count || 0),
    seededListings: Number(listingRows.rows[0].count || 0),
    seededProjects: Number(projectRows.rows[0].count || 0),
    seededCompanies: Number(companyRows.rows[0].count || 0),
    seededTeamMembers: Number(teamRows.rows[0].count || 0),
    seededAdmins: Number(adminRows.rows[0].count || 0),
    seededSubscriptions: Number(subscriptionRows.rows[0].count || 0),
  };
}

async function main() {
  const warnings = [];
  const usersByKey = new Map();
  const companyIdsByKey = new Map();

  await ensureAuthTables();
  await ensureBuilderCompanyTables();

  for (const [index, seedUser] of customerUsers.entries()) {
    const customerTier = index === 0 ? 'premium' : index <= 2 ? 'pro' : 'free';
    const user = await upsertUser({
      name: seedUser.name,
      email: seedUser.email,
      phone: seedUser.phone,
      role: 'user',
      password: PASSWORDS.customer,
      accountType: 'individual',
      subscriptionTier: customerTier,
      forcePasswordReset: false,
    });
    usersByKey.set(seedUser.key, {
      id: Number(user.id),
      name: user.name,
      email: user.email,
      phone: seedUser.phone,
      accountType: user.account_type,
      subscriptionTier: user.subscription_tier,
    });
  }

  try {
    const admin = await upsertUser({
      name: adminUser.name,
      email: adminUser.email,
      phone: adminUser.phone,
      role: 'admin',
      password: PASSWORDS.admin,
      accountType: 'corporate',
      subscriptionTier: 'enterprise',
      forcePasswordReset: true,
    });
    usersByKey.set(adminUser.key, {
      id: Number(admin.id),
      name: admin.name,
      email: admin.email,
      phone: adminUser.phone,
      accountType: admin.account_type,
      subscriptionTier: admin.subscription_tier,
    });
  } catch (error) {
    if (isRoleSeatLimitError(error)) {
      warnings.push(`Skipped admin seed (${adminUser.email}) because admin seat cap is already full.`);
    } else {
      throw error;
    }
  }

  for (const teamMember of teamMembers) {
    try {
      const user = await upsertUser({
        name: teamMember.name,
        email: teamMember.email,
        phone: teamMember.phone,
        role: 'team_member',
        password: PASSWORDS.team,
        accountType: 'individual',
        subscriptionTier: 'pro',
        forcePasswordReset: true,
      });
      usersByKey.set(teamMember.key, {
        id: Number(user.id),
        name: user.name,
        email: user.email,
        phone: teamMember.phone,
        accountType: user.account_type,
        subscriptionTier: user.subscription_tier,
      });
    } catch (error) {
      if (isRoleSeatLimitError(error)) {
        warnings.push(`Skipped team member seed (${teamMember.email}) because team seat cap is already full.`);
        continue;
      }
      throw error;
    }
  }

  for (const ownerSeed of companyOwners) {
    const ownerAccountType = ownerSeed.key === 'builder_owner' ? 'builder' : 'dealer';
    const ownerUser = await upsertUser({
      name: ownerSeed.name,
      email: ownerSeed.email,
      phone: ownerSeed.phone,
      role: 'user',
      password: PASSWORDS.owner,
      accountType: ownerAccountType,
      subscriptionTier: 'premium',
      forcePasswordReset: false,
    });
    usersByKey.set(ownerSeed.key, {
      id: Number(ownerUser.id),
      name: ownerUser.name,
      email: ownerUser.email,
      phone: ownerSeed.phone,
      accountType: ownerUser.account_type,
      subscriptionTier: ownerUser.subscription_tier,
    });
  }

  for (const seededUser of usersByKey.values()) {
    await upsertActiveSubscription({
      userId: seededUser.id,
      subscriptionTier: seededUser.subscriptionTier || 'free',
      createdByUserId: null,
    });
  }

  for (const companySeed of companies) {
    const owner = usersByKey.get(companySeed.ownerKey);
    if (!owner) {
      throw new Error(`Owner user missing for company seed: ${companySeed.key}`);
    }
    const companyId = await upsertCompanyWithOwner(companySeed, owner.id);
    companyIdsByKey.set(companySeed.key, companyId);
  }

  for (const projectSeed of projectSeeds) {
    const companyId = companyIdsByKey.get(projectSeed.companyKey);
    if (!companyId) {
      throw new Error(`Company missing for project seed: ${projectSeed.key}`);
    }
    const companySeed = companies.find((entry) => entry.key === projectSeed.companyKey);
    if (!companySeed) {
      throw new Error(`Company metadata missing for project seed: ${projectSeed.key}`);
    }
    const owner = usersByKey.get(companySeed.ownerKey);
    if (!owner) {
      throw new Error(`Owner missing for project seed: ${projectSeed.key}`);
    }
    const publicProjectId = await upsertProject(projectSeed, companyId, owner.id);
    await upsertBuilderProject(projectSeed, companyId, owner.id, publicProjectId);
  }

  for (const listingSeed of listingSeeds) {
    const requester = usersByKey.get(listingSeed.submittedBy);
    if (!requester) {
      throw new Error(`Requester missing for listing seed: ${listingSeed.referenceId}`);
    }
    await upsertPropertyRequest(listingSeed, requester);
  }

  const constructProjectCount = projectSeeds.filter((entry) => entry.isConstructProject).length;
  const summary = await fetchSummaryCounts();

  console.log('\nSeed completed successfully.');
  console.log(`- Seed users (emails starting with seed.): ${summary.seededUsers}`);
  console.log(`- Seed listings (SEED-LIST-*): ${summary.seededListings}`);
  console.log(`- Seed companies (COMP-SEED-*): ${summary.seededCompanies}`);
  console.log(`- Seed projects (project name starts with SEED): ${summary.seededProjects}`);
  console.log(`- Seed admin users: ${summary.seededAdmins}`);
  console.log(`- Seed team members: ${summary.seededTeamMembers}`);
  console.log(`- Seed active subscriptions: ${summary.seededSubscriptions}`);
  console.log(`- Construct-with-us projects seeded: ${constructProjectCount}`);

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log('\nLogin credentials for seeded accounts:');
  console.log(`- Seed customers: ${PASSWORDS.customer}`);
  console.log(`- Seed admin: ${PASSWORDS.admin}`);
  console.log(`- Seed team members: ${PASSWORDS.team}`);
  console.log(`- Seed company owners: ${PASSWORDS.owner}`);
}

main()
  .catch((error) => {
    console.error('\nSeeding failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
