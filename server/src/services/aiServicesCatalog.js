const SQM_TO_SQFT = 10.76391041671;
const ACRE_TO_SQFT = 43560;

export const AI_SERVICE_CATALOG = [
  {
    key: 'plot-polygon',
    title: 'AI Plot Polygon',
    category: 'land-intelligence',
    actions: ['analyze'],
    stage: 'foundation',
    summary: 'Extracts and validates plot boundaries, area, setbacks, access points, and map export data.',
    capabilities: [
      'layout upload interpretation',
      'boundary point review',
      'area calculation',
      'setback planning',
      'GeoJSON/KML export planning',
    ],
    inputHints: ['layoutFileUrl', 'boundaryPoints', 'plotAreaSqft', 'location', 'localCode'],
  },
  {
    key: 'home-design',
    title: 'Home Design AI',
    category: 'design',
    actions: ['generate'],
    stage: 'foundation',
    summary: 'Creates concept home plans from plot, budget, room, style, Vastu, and lifestyle inputs.',
    capabilities: [
      '2D concept plan brief',
      'room schedule',
      'Vastu-aware planning',
      'budget fit check',
      'future expansion notes',
    ],
    inputHints: ['plotAreaSqft', 'budgetInr', 'bedrooms', 'floors', 'style', 'vastu'],
  },
  {
    key: 'interior-design',
    title: 'Interior Design AI',
    category: 'design',
    actions: ['generate'],
    stage: 'foundation',
    summary: 'Generates room themes, layouts, furniture priorities, lighting, colors, and shopping-ready BOQ ideas.',
    capabilities: [
      'room layout concept',
      'theme and palette',
      'furniture zoning',
      'lighting plan',
      'budget prioritization',
    ],
    inputHints: ['roomType', 'roomSizeSqft', 'style', 'budgetTier', 'photoUrl', 'mood'],
  },
  {
    key: 'construction-planning',
    title: 'AI Construction Planning',
    category: 'construction',
    actions: ['plan'],
    stage: 'foundation',
    summary: 'Builds phase plans, timelines, BOQ estimates, risk flags, and cash-flow guidance.',
    capabilities: [
      'phase schedule',
      'cost bands',
      'labor forecast',
      'weather and delay risks',
      'quality checkpoints',
    ],
    inputHints: ['builtUpAreaSqft', 'floors', 'budgetInr', 'city', 'startDate', 'constructionType'],
  },
  {
    key: 'apartment-management',
    title: 'Apartment Management AI',
    category: 'operations',
    actions: ['analyze'],
    stage: 'foundation',
    summary: 'Analyzes occupancy, rent health, maintenance priorities, admin workflows, and society finance signals.',
    capabilities: [
      'occupancy health',
      'rent risk scoring',
      'maintenance prioritization',
      'admin workflow recommendations',
      'financial health snapshot',
    ],
    inputHints: ['totalUnits', 'occupiedUnits', 'unpaidRentCount', 'openComplaints', 'monthlyRevenueInr'],
  },
  {
    key: 'property-valuation',
    title: 'AI Property Valuation',
    category: 'investment',
    actions: ['estimate'],
    stage: 'foundation',
    summary: 'Estimates property value, comparable logic, rent yield, future value, and renovation ROI.',
    capabilities: [
      'instant value range',
      'rental yield',
      'future value scenarios',
      'renovation ROI',
      'investment fit notes',
    ],
    inputHints: ['areaSqft', 'pricePerSqft', 'locationScore', 'ageYears', 'monthlyRentInr'],
  },
  {
    key: 'document-assistant',
    title: 'AI Document Assistant',
    category: 'legal-workflow',
    actions: ['draft'],
    stage: 'foundation',
    summary: 'Drafts property document outlines, checklists, required clauses, and state-wise registration guidance.',
    capabilities: [
      'agreement outline',
      'clause checklist',
      'stamp duty inputs',
      'document verification checklist',
      'multi-language draft brief',
    ],
    inputHints: ['documentType', 'state', 'parties', 'propertyDetails', 'language'],
  },
  {
    key: 'structural-analysis',
    title: 'AI Structural Analysis',
    category: 'safety',
    actions: ['analyze'],
    stage: 'foundation',
    summary: 'Screens plans/photos for structural risk indicators, safety questions, and engineer review priorities.',
    capabilities: [
      'risk checklist',
      'crack/seepage triage',
      'seismic considerations',
      'renovation feasibility prompts',
      'fire safety checklist',
    ],
    inputHints: ['buildingAgeYears', 'floors', 'seismicZone', 'crackWidthMm', 'planFileUrl', 'photoUrls'],
  },
  {
    key: 'energy-optimizer',
    title: 'AI Energy Optimizer',
    category: 'sustainability',
    actions: ['analyze'],
    stage: 'foundation',
    summary: 'Recommends solar, HVAC, insulation, lighting, ROI, and green certification steps.',
    capabilities: [
      'solar sizing',
      'bill reduction plan',
      'HVAC optimization',
      'green upgrade ROI',
      'carbon reduction notes',
    ],
    inputHints: ['monthlyBillInr', 'roofAreaSqft', 'connectedLoadKw', 'sunHours', 'buildingType'],
  },
  {
    key: 'neighborhood-analyzer',
    title: 'AI Neighborhood Analyzer',
    category: 'location-intelligence',
    actions: ['analyze'],
    stage: 'foundation',
    summary: 'Scores nearby amenities, connectivity, liveability, rental demand, and investment potential.',
    capabilities: [
      'amenity scoring',
      'connectivity brief',
      'rental demand indicators',
      'future development prompts',
      'investment hotspot notes',
    ],
    inputHints: ['location', 'radiusKm', 'buyerProfile', 'budgetInr', 'propertyType'],
  },
];

const SERVICE_BY_KEY = new Map(AI_SERVICE_CATALOG.map((service) => [service.key, service]));

export function listAiServices() {
  return AI_SERVICE_CATALOG.map((service) => ({ ...service }));
}

export function getAiService(key) {
  return SERVICE_BY_KEY.get(String(key || '').trim()) || null;
}

export function buildServiceSystemPrompt(service) {
  const capabilities = service.capabilities.map((capability) => `- ${capability}`).join('\n');
  const serviceSpecificRules =
    service.key === 'interior-design'
      ? [
          '',
          'Interior Design AI output requirements:',
          '- Do not stop at color palette. Always include furniture, fixtures, interior finishes, and building-material selections.',
          '- Include shopping-ready recommendations that can map to the ZDT building materials catalog.',
          '- Prefer these catalog categories where relevant: Interior Fit-out, Paint and Coatings, Tiles, Wood, Electrical, Plumbing, Hardware.',
          '- Mention room-specific furniture such as sofa, TV console, bed, wardrobe, modular kitchen units, vanity, desk, loose seating, storage, curtains, lighting, ceiling, paint, tiles, and hardware as applicable.',
          '- In output, include keys: palette, zones, furnitureAndFixtures, buildingMaterialSelections, catalogMatches, lightingPlan, shoppingPlan.',
          '- catalogMatches must be an array of objects with itemName, category, useCase, priority, and quantityHint.',
        ].join('\n')
      : '';
  return [
    `You are ${service.title} for ZDT Realty, an India-first real estate and construction platform.`,
    'Return only valid JSON. Do not wrap the JSON in markdown.',
    'Use practical Indian real-estate, construction, Vastu, apartment, legal workflow, and sustainability context where relevant.',
    'Do not claim government verification, legal validity, engineering certification, or live market truth unless supplied in the input.',
    'For legal, structural, valuation, geospatial, and safety topics, include review checkpoints for qualified professionals.',
    'Keep the response actionable for a web app UI.',
    '',
    'Service capabilities:',
    capabilities,
    serviceSpecificRules,
    '',
    'Required JSON shape:',
    JSON.stringify(
      {
        summary: 'short service result summary',
        output: {},
        assumptions: ['input assumptions'],
        risks: ['risks, missing data, or professional review needs'],
        nextActions: ['actionable next steps'],
        confidence: 0.65,
      },
      null,
      2
    ),
  ].join('\n');
}

export function buildServiceUserPrompt(service, payload) {
  return JSON.stringify(
    {
      task: `Run ${service.title}`,
      serviceKey: service.key,
      inputHints: service.inputHints,
      input: payload,
    },
    null,
    2
  );
}

export function buildFallbackResult(serviceKey, payload = {}) {
  switch (serviceKey) {
    case 'plot-polygon':
      return buildPlotPolygonFallback(payload);
    case 'home-design':
      return buildHomeDesignFallback(payload);
    case 'interior-design':
      return buildInteriorDesignFallback(payload);
    case 'construction-planning':
      return buildConstructionPlanningFallback(payload);
    case 'apartment-management':
      return buildApartmentManagementFallback(payload);
    case 'property-valuation':
      return buildPropertyValuationFallback(payload);
    case 'document-assistant':
      return buildDocumentAssistantFallback(payload);
    case 'structural-analysis':
      return buildStructuralAnalysisFallback(payload);
    case 'energy-optimizer':
      return buildEnergyOptimizerFallback(payload);
    case 'neighborhood-analyzer':
      return buildNeighborhoodAnalyzerFallback(payload);
    default:
      return {
        summary: 'AI service foundation is ready, but this service key is not registered.',
        output: {},
        assumptions: ['No service-specific fallback was found.'],
        risks: ['Use a registered AI service key from the catalog.'],
        nextActions: ['Call GET /api/ai-services/catalog to inspect available services.'],
        confidence: 0.2,
      };
  }
}

function buildPlotPolygonFallback(payload) {
  const area = estimatePlotArea(payload);
  const hasBoundary = area.pointCount >= 3;
  return {
    summary: hasBoundary
      ? 'Boundary points were accepted and a map-ready plot analysis scaffold was generated.'
      : 'Plot polygon pipeline is ready for layout files or boundary points.',
    output: {
      boundary: {
        status: hasBoundary ? 'boundary_points_detected' : 'awaiting_layout_or_boundary_points',
        pointCount: area.pointCount,
        editable: true,
      },
      area: area.areaSqft
        ? {
            sqft: round(area.areaSqft, 2),
            sqm: round(area.areaSqft / SQM_TO_SQFT, 2),
            acres: round(area.areaSqft / ACRE_TO_SQFT, 4),
            hectares: round(area.areaSqft / 107639.1041671, 4),
            source: area.source,
          }
        : null,
      mapLayers: [
        'satellite_overlay',
        'road_access_review',
        'setback_lines',
        'north_orientation',
        'flood_zone_if_dataset_connected',
      ],
      exports: ['GeoJSON', 'KML', 'Shapefile'],
      advancedPipeline: [
        'OCR dimensions from scanned layout',
        'CRS transformation',
        'government record comparison',
        'topography and slope overlay',
      ],
    },
    assumptions: [
      'Boundary extraction needs a geo-referenced layout, coordinates, or a map-aligned image for high confidence.',
      'Government record and utility overlays require official datasets to be connected.',
    ],
    risks: [
      'AI polygon output must be checked against a licensed survey or official land record before legal use.',
      'Non-georeferenced PDF/JPG/DWG files can produce approximate boundaries only.',
    ],
    nextActions: [
      'Upload a layout file or provide boundaryPoints as lat/lng pairs.',
      'Attach local setback rules or municipal code source for automatic setback generation.',
      'Connect Mapbox or Google Maps keys for visual editing and export.',
    ],
    confidence: hasBoundary ? 0.72 : 0.38,
  };
}

function buildHomeDesignFallback(payload) {
  const plotAreaSqft = readNumber(payload, ['plotAreaSqft', 'plotSizeSqft', 'areaSqft'], 1500);
  const budgetInr = readNumber(payload, ['budgetInr', 'budget'], 5000000);
  const bedrooms = clamp(readInteger(payload, ['bedrooms', 'bhk', 'rooms'], 3), 1, 8);
  const floors = clamp(readInteger(payload, ['floors', 'floorCount'], 2), 1, 6);
  const style = readString(payload, ['style', 'architecturalStyle'], 'modern Indian');
  const buildableArea = Math.round(plotAreaSqft * Math.min(1.8, Math.max(0.7, floors * 0.7)));
  const estimatedCost = buildableArea * 2200;

  return {
    summary: `${bedrooms}BHK ${style} concept generated for a ${plotAreaSqft} sqft plot.`,
    output: {
      concept: {
        plotAreaSqft,
        suggestedBuiltUpAreaSqft: buildableArea,
        floors,
        bedrooms,
        style,
        budgetFit:
          budgetInr >= estimatedCost * 0.9
            ? 'healthy'
            : budgetInr >= estimatedCost * 0.7
              ? 'tight'
              : 'needs_scope_reduction',
      },
      roomSchedule: [
        { room: 'Living and dining', suggestedAreaSqft: Math.round(buildableArea * 0.16) },
        { room: 'Kitchen', suggestedAreaSqft: Math.round(buildableArea * 0.08) },
        { room: 'Bedrooms total', suggestedAreaSqft: Math.round(buildableArea * 0.34) },
        { room: 'Bathrooms and utilities', suggestedAreaSqft: Math.round(buildableArea * 0.12) },
        { room: 'Circulation and stairs', suggestedAreaSqft: Math.round(buildableArea * 0.14) },
      ],
      planningRules: [
        'Keep plumbing walls stacked across floors where possible.',
        'Place stairs near the center edge to preserve room flexibility.',
        'Reserve front setback for parking and light.',
        'Keep future column grid regular if an extra floor may be added.',
      ],
      costBand: {
        economyInr: Math.round(buildableArea * 1700),
        standardInr: Math.round(buildableArea * 2200),
        premiumInr: Math.round(buildableArea * 3200),
      },
    },
    assumptions: [
      'Cost bands use broad residential construction rates and must be replaced with regional vendor pricing.',
      'The concept does not replace architect drawings, structural design, or municipal approval drawings.',
    ],
    risks: [
      'Setbacks, FAR/FSI, road width, and height restrictions can change the feasible plan.',
      'Vastu preferences can conflict with ventilation, light, and structure unless balanced early.',
    ],
    nextActions: [
      'Collect plot dimensions, road side, north direction, setbacks, and local FAR/FSI.',
      'Generate two alternate plans: budget-maximized and comfort-maximized.',
      'Send the selected concept to architect and structural engineer review.',
    ],
    confidence: 0.58,
  };
}

function buildInteriorDesignFallback(payload) {
  const roomType = readString(payload, ['roomType', 'room'], 'living room');
  const style = readString(payload, ['style', 'theme'], 'modern Indian');
  const budgetTier = readString(payload, ['budgetTier', 'budgetLevel'], 'mid-range');
  const mood = readString(payload, ['mood', 'feel'], 'warm and calm');
  const roomSizeSqft = readNumber(payload, ['roomSizeSqft', 'areaSqft'], 160);
  const roomPlan = getInteriorRoomPlan(roomType);

  return {
    summary: `${capitalize(roomType)} design direction generated in ${style} style with a ${budgetTier} budget.`,
    output: {
      roomType,
      roomSizeSqft,
      style,
      mood,
      palette: ['warm white', 'teak wood', 'sage green', 'matte black accents'],
      zones: [
        'primary activity zone',
        'storage wall',
        'ambient lighting layer',
        'accent or display point',
      ],
      furnitureAndFixtures: roomPlan.furnitureAndFixtures,
      buildingMaterialSelections: [
        'washable interior paint with primer base',
        'floor or wall tiles matched to palette',
        'gypsum ceiling board with recessed lighting provision',
        'electrical points for task, accent, and appliance loads',
        'wood or laminate finish for modular storage',
        ...roomPlan.materialSelections,
      ],
      catalogMatches: roomPlan.catalogMatches,
      furniturePriorities: [
        'choose one anchor piece before buying decor',
        'keep clear walking path of at least 900 mm where possible',
        'use built-in storage on the longest uninterrupted wall',
        'prefer washable and repairable finishes for Indian dust and heat',
      ],
      lightingPlan: ['ceiling ambient', 'task light', 'warm accent light', 'daylight control'],
      shoppingPlan: {
        economy: ['paint refresh', 'curtains', 'loose furniture'],
        midRange: ['modular storage', 'layered lighting', 'feature wall'],
        premium: ['custom carpentry', 'designer fixtures', 'smart controls'],
      },
    },
    assumptions: [
      'Exact furniture dimensions require a measured room plan or photo calibration.',
      'Shopping links and vendor matching are not connected in this foundation response.',
    ],
    risks: [
      'Generated layouts should be checked against door swing, window sill height, and electrical points.',
      'Photo-to-redesign needs image model integration and user consent for room images.',
    ],
    nextActions: [
      'Upload room photos and wall measurements.',
      'Capture existing electrical, plumbing, and window positions.',
      'Pick one style reference image to lock the visual direction.',
      'Open the building materials catalog and shortlist the matching interior fit-out items.',
    ],
    confidence: 0.56,
  };
}

function getInteriorRoomPlan(roomType) {
  const normalized = String(roomType || '').toLowerCase();
  if (normalized.includes('kitchen')) {
    return {
      furnitureAndFixtures: [
        'modular kitchen base unit',
        'overhead wall cabinets',
        'tall pantry storage',
        'countertop, sink, hob, and backsplash',
        'under-cabinet task lighting',
      ],
      materialSelections: ['plumbing lines for sink', 'anti-skid floor tiles', 'backsplash wall tiles'],
      catalogMatches: [
        makeCatalogMatch('Modular Kitchen Base Unit', 'Interior Fit-out', 'base cabinet and counter storage', 'high', 'running feet as per kitchen wall length'),
        makeCatalogMatch('Gypsum Ceiling Board 12mm', 'Interior Fit-out', 'clean ceiling with service access', 'medium', 'sheets as per ceiling area'),
        makeCatalogMatch('Acrylic Wall Primer', 'Paint and Coatings', 'paint base for washable wall finish', 'medium', '20L drums based on wall area'),
        makeCatalogMatch('PVC Drainage Pipe', 'Plumbing', 'sink drain and wet-service routing', 'medium', 'lengths as per plumbing run'),
      ],
    };
  }
  if (normalized.includes('bed')) {
    return {
      furnitureAndFixtures: [
        'bed with upholstered or wood headboard',
        'modular wardrobe unit',
        'side tables with reading lights',
        'dresser or study ledge',
        'curtains or blackout blinds',
      ],
      materialSelections: ['laminate or veneer wardrobe finish', 'warm wall paint', 'wood hardware and handles'],
      catalogMatches: [
        makeCatalogMatch('Modular Wardrobe Unit', 'Interior Fit-out', 'primary bedroom storage wall', 'high', 'running feet by wardrobe width'),
        makeCatalogMatch('Acrylic Wall Primer', 'Paint and Coatings', 'paint base for calm bedroom finish', 'medium', '20L drums based on wall area'),
        makeCatalogMatch('Gypsum Ceiling Board 12mm', 'Interior Fit-out', 'cove or recessed ceiling light layer', 'medium', 'sheets as per ceiling area'),
        makeCatalogMatch('Electrical Conduit and Wiring', 'Electrical', 'bedside, study, and wardrobe lighting points', 'medium', 'length by electrical routing'),
      ],
    };
  }
  if (normalized.includes('bath')) {
    return {
      furnitureAndFixtures: [
        'bathroom vanity counter set',
        'mirror cabinet',
        'glass shower partition',
        'wall shelves or niche storage',
        'warm-white mirror lighting',
      ],
      materialSelections: ['anti-skid floor tiles', 'water-resistant wall tiles', 'plumbing fixtures and drainage lines'],
      catalogMatches: [
        makeCatalogMatch('Bathroom Vanity Counter Set', 'Interior Fit-out', 'basin, storage, and mirror zone', 'high', 'sets as per bathrooms'),
        makeCatalogMatch('PVC Drainage Pipe', 'Plumbing', 'basin and floor trap drainage', 'high', 'lengths as per plumbing layout'),
        makeCatalogMatch('Wall and Floor Tiles', 'Tiles', 'wet-area wall and floor finish', 'high', 'sqft as per bathroom surfaces'),
        makeCatalogMatch('Electrical Conduit and Wiring', 'Electrical', 'mirror light and exhaust points', 'medium', 'length by electrical routing'),
      ],
    };
  }
  if (normalized.includes('office')) {
    return {
      furnitureAndFixtures: [
        'work desk',
        'ergonomic chair',
        'storage credenza',
        'open shelves',
        'task light and acoustic curtain',
      ],
      materialSelections: ['scratch-resistant laminate', 'matte wall paint', 'extra electrical and data points'],
      catalogMatches: [
        makeCatalogMatch('Gypsum Ceiling Board 12mm', 'Interior Fit-out', 'acoustic ceiling and light placement', 'medium', 'sheets as per ceiling area'),
        makeCatalogMatch('Acrylic Wall Primer', 'Paint and Coatings', 'low-glare wall finish', 'medium', '20L drums based on wall area'),
        makeCatalogMatch('Electrical Conduit and Wiring', 'Electrical', 'desk, router, and task light points', 'high', 'length by electrical routing'),
        makeCatalogMatch('Plywood or Laminate Board', 'Wood', 'desk and shelf carpentry', 'medium', 'sheets by furniture design'),
      ],
    };
  }
  return {
    furnitureAndFixtures: [
      'sofa or sectional seating',
      'living room TV console unit',
      'coffee table',
      'accent chairs or poufs',
      'curtains, rug, and display shelves',
    ],
    materialSelections: ['feature wall paint or paneling', 'tv wall electrical points', 'wood or laminate console finish'],
    catalogMatches: [
      makeCatalogMatch('Living Room TV Console Unit', 'Interior Fit-out', 'media wall and storage anchor', 'high', 'running feet by TV wall width'),
      makeCatalogMatch('Gypsum Ceiling Board 12mm', 'Interior Fit-out', 'false ceiling and lighting layer', 'medium', 'sheets as per ceiling area'),
      makeCatalogMatch('Acrylic Wall Primer', 'Paint and Coatings', 'paint base for main walls and feature wall', 'medium', '20L drums based on wall area'),
      makeCatalogMatch('Electrical Conduit and Wiring', 'Electrical', 'TV, router, cove, and accent light points', 'high', 'length by electrical routing'),
    ],
  };
}

function makeCatalogMatch(itemName, category, useCase, priority, quantityHint) {
  return {
    itemName,
    category,
    useCase,
    priority,
    quantityHint,
  };
}

function buildConstructionPlanningFallback(payload) {
  const builtUpAreaSqft = readNumber(payload, ['builtUpAreaSqft', 'areaSqft'], 2000);
  const floors = clamp(readInteger(payload, ['floors', 'floorCount'], 2), 1, 20);
  const constructionType = readString(payload, ['constructionType', 'type'], 'residential RCC');
  const standardCost = Math.round(builtUpAreaSqft * 2200);
  const durationWeeks = Math.max(16, Math.round(10 + builtUpAreaSqft / 180 + floors * 4));

  return {
    summary: `${constructionType} plan generated for ${builtUpAreaSqft} sqft across ${floors} floor(s).`,
    output: {
      timeline: {
        totalWeeks: durationWeeks,
        phases: [
          { phase: 'Pre-construction and approvals', weeks: 3, checkpoint: 'drawings, BOQ, contractor scope' },
          { phase: 'Foundation', weeks: Math.max(3, floors), checkpoint: 'soil, footing, plinth quality' },
          { phase: 'RCC structure', weeks: Math.max(6, floors * 3), checkpoint: 'steel, shuttering, concrete curing' },
          { phase: 'Masonry and services', weeks: Math.max(4, Math.round(floors * 2.5)), checkpoint: 'MEP rough-ins' },
          { phase: 'Finishing', weeks: Math.max(6, Math.round(builtUpAreaSqft / 350)), checkpoint: 'tiles, paint, fixtures' },
          { phase: 'Handover', weeks: 2, checkpoint: 'snag list and final documents' },
        ],
      },
      costBand: {
        economyInr: Math.round(builtUpAreaSqft * 1700),
        standardInr: standardCost,
        premiumInr: Math.round(builtUpAreaSqft * 3200),
        contingencyPercent: 10,
      },
      resourceForecast: {
        peakLaborCount: Math.max(8, Math.round(builtUpAreaSqft / 180)),
        majorMaterials: ['cement', 'steel', 'sand', 'aggregate', 'bricks or blocks', 'plumbing', 'electrical'],
        criticalEquipment: ['mixer', 'vibrator', 'scaffolding', 'centering material'],
      },
      riskSignals: ['monsoon delays', 'steel/cement price movement', 'inspection delays', 'labor availability'],
    },
    assumptions: [
      'Timeline assumes normal residential construction and no major approval or design delays.',
      'Costs are broad estimates until regional material rates and contractor quotations are connected.',
    ],
    risks: [
      'Structural design, soil report, and local approval conditions can materially change schedule and cost.',
      'Weather and cash-flow interruptions are common delay drivers.',
    ],
    nextActions: [
      'Upload approved drawings and BOQ for quantity extraction.',
      'Connect local material prices and contractor labor rates.',
      'Generate a Gantt chart with dependencies and inspection milestones.',
    ],
    confidence: 0.6,
  };
}

function buildApartmentManagementFallback(payload) {
  const totalUnits = Math.max(1, readInteger(payload, ['totalUnits', 'units'], 100));
  const occupiedUnits = clamp(readInteger(payload, ['occupiedUnits', 'occupied'], 78), 0, totalUnits);
  const unpaidRentCount = clamp(readInteger(payload, ['unpaidRentCount', 'unpaid'], 0), 0, totalUnits);
  const openComplaints = Math.max(0, readInteger(payload, ['openComplaints', 'complaints'], 0));
  const occupancyRate = occupiedUnits / totalUnits;

  return {
    summary: `Apartment operations snapshot generated with ${Math.round(occupancyRate * 100)}% occupancy.`,
    output: {
      occupancy: {
        totalUnits,
        occupiedUnits,
        vacantUnits: totalUnits - occupiedUnits,
        occupancyRatePercent: Math.round(occupancyRate * 100),
        status: occupancyRate >= 0.9 ? 'strong' : occupancyRate >= 0.75 ? 'stable' : 'needs_leasing_push',
      },
      rentHealth: {
        unpaidRentCount,
        collectionRisk: unpaidRentCount / totalUnits > 0.08 ? 'high' : unpaidRentCount > 0 ? 'watch' : 'low',
        recommendedAutomation: ['rent reminders', 'late-fee rules', 'receipt generation', 'payment prediction'],
      },
      maintenance: {
        openComplaints,
        priorityQueue: ['water or electrical emergencies', 'lift and safety issues', 'leakage', 'common area repairs'],
        preventiveCadence: ['weekly common area inspection', 'monthly lift/generator check', 'quarterly plumbing audit'],
      },
      adminWorkflows: [
        'tenant onboarding and KYC',
        'move-in inspection',
        'visitor QR entry',
        'amenity booking',
        'notice broadcasting',
        'society accounting',
      ],
    },
    assumptions: [
      'Detailed tenant scoring needs payment history and consented tenant records.',
      'Predictive maintenance needs asset history or IoT sensor data.',
    ],
    risks: [
      'Automated KYC and tenant scoring must follow privacy, consent, and local housing rules.',
      'Financial reports should be reviewed by an accountant before audit or tax filing.',
    ],
    nextActions: [
      'Import units, tenants, rent cycle, and complaint history.',
      'Configure rent reminder channels such as SMS, WhatsApp, and email.',
      'Create vendor SLA rules for emergency, high, medium, and low priority tickets.',
    ],
    confidence: 0.62,
  };
}

function buildPropertyValuationFallback(payload) {
  const areaSqft = readNumber(payload, ['areaSqft', 'builtUpAreaSqft', 'carpetAreaSqft'], 1200);
  const pricePerSqft = readNumber(payload, ['pricePerSqft', 'marketRatePerSqft'], 6500);
  const ageYears = Math.max(0, readNumber(payload, ['ageYears', 'propertyAgeYears'], 5));
  const locationScore = clamp(readNumber(payload, ['locationScore'], 7), 1, 10);
  const monthlyRentInr = readNumber(payload, ['monthlyRentInr', 'rentInr'], 0);
  const ageAdjustment = Math.max(0.78, 1 - ageYears * 0.01);
  const locationAdjustment = 0.85 + locationScore * 0.03;
  const estimatedValue = Math.round(areaSqft * pricePerSqft * ageAdjustment * locationAdjustment);

  return {
    summary: `Property value estimate generated around ${formatInr(estimatedValue)}.`,
    output: {
      estimatedValueInr: estimatedValue,
      valueRangeInr: {
        low: Math.round(estimatedValue * 0.9),
        high: Math.round(estimatedValue * 1.1),
      },
      factors: {
        areaSqft,
        pricePerSqft,
        ageYears,
        locationScore,
        ageAdjustment: round(ageAdjustment, 2),
        locationAdjustment: round(locationAdjustment, 2),
      },
      rentalYieldPercent: monthlyRentInr > 0 ? round((monthlyRentInr * 12 * 100) / estimatedValue, 2) : null,
      futureValueScenarios: {
        oneYearInr: Math.round(estimatedValue * 1.05),
        threeYearInr: Math.round(estimatedValue * 1.16),
        fiveYearInr: Math.round(estimatedValue * 1.28),
      },
    },
    assumptions: [
      'The estimate uses provided or fallback market rate per sqft, not live comparable sales.',
      'Legal title, floor, view, amenities, parking, and builder reputation can change value materially.',
    ],
    risks: [
      'Do not use this as a bank valuation or final transaction price without professional appraisal.',
      'Comparable sale data and government guidance value should be connected for production accuracy.',
    ],
    nextActions: [
      'Add locality comparables, floor number, age, amenities, parking, and title status.',
      'Connect market transaction data and rent listings for a live valuation model.',
      'Run renovation ROI and rental yield scenarios.',
    ],
    confidence: 0.54,
  };
}

function buildDocumentAssistantFallback(payload) {
  const documentType = readString(payload, ['documentType', 'type'], 'rental agreement');
  const state = readString(payload, ['state', 'registrationState'], 'selected state');
  const language = readString(payload, ['language'], 'English');

  return {
    summary: `${capitalize(documentType)} assistant outline generated for ${state}.`,
    output: {
      documentType,
      state,
      language,
      draftOutline: [
        'party details and identity references',
        'property description and address',
        'consideration, rent, deposit, or sale amount',
        'term, possession, payment, and default clauses',
        'maintenance, utilities, taxes, and society charges',
        'representations, indemnity, dispute resolution, and jurisdiction',
        'signature, witnesses, annexures, and registration notes',
      ],
      requiredInputs: [
        'owner/seller details',
        'buyer/tenant details',
        'property survey or unit details',
        'payment terms',
        'state and city',
        'stamp duty and registration preference',
      ],
      verificationChecklist: [
        'title chain',
        'encumbrance certificate if applicable',
        'tax receipts',
        'building approvals',
        'society NOC if applicable',
        'ID and address proof',
      ],
    },
    assumptions: [
      'This produces a drafting checklist and outline, not legal advice.',
      'Stamp duty, registration, and clause language vary by state and transaction type.',
    ],
    risks: [
      'Generated documents must be reviewed by a qualified lawyer before signing or registration.',
      'Document verification needs original records or trusted government integrations.',
    ],
    nextActions: [
      'Collect party details, property identifiers, payment terms, and state.',
      'Add a state-wise stamp duty calculator source.',
      'Generate a lawyer-review draft once all required inputs are present.',
    ],
    confidence: 0.5,
  };
}

function buildStructuralAnalysisFallback(payload) {
  const buildingAgeYears = Math.max(0, readNumber(payload, ['buildingAgeYears', 'ageYears'], 10));
  const floors = Math.max(1, readInteger(payload, ['floors', 'floorCount'], 3));
  const crackWidthMm = Math.max(0, readNumber(payload, ['crackWidthMm'], 0));
  const seismicZone = readString(payload, ['seismicZone'], 'not specified');
  const riskScore =
    Math.min(100, Math.round(20 + buildingAgeYears * 1.2 + floors * 3 + (crackWidthMm >= 3 ? 25 : crackWidthMm * 4)));

  return {
    summary: `Structural screening generated with ${riskScore}/100 preliminary risk.`,
    output: {
      preliminaryRiskScore: riskScore,
      riskLevel: riskScore >= 70 ? 'high' : riskScore >= 45 ? 'medium' : 'low_to_watch',
      observedInputs: {
        buildingAgeYears,
        floors,
        crackWidthMm,
        seismicZone,
      },
      reviewPriorities: [
        'load path and column-beam alignment',
        'foundation settlement signs',
        'crack pattern direction and width',
        'water seepage near structural members',
        'fire escape and service shaft compliance',
      ],
      renovationChecks: [
        'identify load-bearing walls before demolition',
        'verify slab cutting restrictions',
        'check additional load from water tanks, solar, or extra floors',
      ],
    },
    assumptions: [
      'This is a triage screen based on supplied inputs, not a structural certificate.',
      'Photo and plan analysis require clear files and calibration references.',
    ],
    risks: [
      'Any structural crack, settlement, or renovation should be reviewed by a licensed structural engineer.',
      'Earthquake resistance needs design drawings, material specs, and site inspection.',
    ],
    nextActions: [
      'Upload structural drawings, photos, and crack measurements.',
      'Capture building age, soil/foundation information, and modification history.',
      'Schedule engineer review for medium or high risk results.',
    ],
    confidence: 0.46,
  };
}

function buildEnergyOptimizerFallback(payload) {
  const monthlyBillInr = readNumber(payload, ['monthlyBillInr', 'electricityBillInr'], 6000);
  const roofAreaSqft = readNumber(payload, ['roofAreaSqft'], 500);
  const connectedLoadKw = readNumber(payload, ['connectedLoadKw', 'loadKw'], 5);
  const solarKw = Math.max(1, Math.min(Math.floor(roofAreaSqft / 100), Math.ceil(connectedLoadKw * 0.8)));
  const estimatedSolarCost = Math.round(solarKw * 65000);
  const monthlySavings = Math.round(monthlyBillInr * Math.min(0.75, solarKw / Math.max(connectedLoadKw, 1)));

  return {
    summary: `Energy optimization generated with a ${solarKw} kW starter solar recommendation.`,
    output: {
      solar: {
        recommendedSystemKw: solarKw,
        estimatedCostInr: estimatedSolarCost,
        estimatedMonthlySavingsInr: monthlySavings,
        simplePaybackMonths: monthlySavings > 0 ? Math.round(estimatedSolarCost / monthlySavings) : null,
      },
      efficiencyActions: [
        'replace high-use lights with efficient LEDs',
        'shade west-facing windows',
        'service AC units before summer',
        'seal gaps around doors and windows',
        'use smart timers for pumps and common-area lights',
      ],
      greenCertificationPath: ['energy audit', 'water efficiency', 'waste plan', 'materials documentation'],
      carbonReductionNotes: ['solar offsets grid electricity', 'efficient HVAC lowers peak load'],
    },
    assumptions: [
      'Solar sizing uses broad roof area and load rules until site shadow analysis is connected.',
      'Tariff, net metering policy, and DISCOM rules vary by state.',
    ],
    risks: [
      'Roof structure and waterproofing should be checked before solar installation.',
      'ROI changes with subsidy, tariff, export rate, and maintenance.',
    ],
    nextActions: [
      'Add 12 months of electricity bills and roof shadow photos.',
      'Connect solar irradiation and DISCOM net metering data.',
      'Generate an HVAC and insulation upgrade ROI plan.',
    ],
    confidence: 0.57,
  };
}

function buildNeighborhoodAnalyzerFallback(payload) {
  const location = readString(payload, ['location', 'locality', 'city'], 'selected location');
  const radiusKm = readNumber(payload, ['radiusKm'], 3);
  return {
    summary: `Neighborhood intelligence scaffold generated for ${location}.`,
    output: {
      location,
      radiusKm,
      scorecard: [
        { factor: 'schools and hospitals', score: null, dataNeeded: 'places API or verified POI dataset' },
        { factor: 'markets and daily needs', score: null, dataNeeded: 'places API or local directory' },
        { factor: 'traffic and commute', score: null, dataNeeded: 'maps traffic data' },
        { factor: 'air and noise quality', score: null, dataNeeded: 'AQI and noise datasets' },
        { factor: 'public transport', score: null, dataNeeded: 'metro, bus, railway, and road data' },
        { factor: 'future development', score: null, dataNeeded: 'infra update and government plan feeds' },
      ],
      investmentSignals: [
        'connectivity improvement',
        'job corridor proximity',
        'rental demand',
        'supply pipeline',
        'civic infrastructure quality',
      ],
      recommendedIntegrations: ['Google Places or Mapbox Search', 'AQI provider', 'traffic data', 'infra updates module'],
    },
    assumptions: [
      'No live neighborhood dataset was supplied in this request.',
      'Scores are intentionally left null until trusted data sources are connected.',
    ],
    risks: [
      'Crime, demographic, and investment scores must be sourced carefully and presented without discrimination.',
      'Future development claims should cite official plans or verified news sources.',
    ],
    nextActions: [
      'Provide coordinates or a locality name.',
      'Connect maps, POI, AQI, traffic, and infrastructure feeds.',
      'Generate buyer-profile-specific scores for family, rental investor, or senior living.',
    ],
    confidence: 0.42,
  };
}

function estimatePlotArea(payload) {
  const points = readPoints(payload);
  if (points.length >= 3) {
    const geoPoints = points.filter((point) => isFiniteNumber(point.lat) && isFiniteNumber(point.lng));
    if (geoPoints.length === points.length) {
      return {
        areaSqft: polygonGeoAreaSqm(geoPoints) * SQM_TO_SQFT,
        pointCount: points.length,
        source: 'boundary_points_geo',
      };
    }

    const xyPoints = points.filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y));
    if (xyPoints.length === points.length) {
      return {
        areaSqft: Math.abs(shoelaceArea(xyPoints)),
        pointCount: points.length,
        source: 'boundary_points_xy_assumed_sqft',
      };
    }
  }

  const areaSqft = readNumber(payload, ['plotAreaSqft', 'areaSqft', 'plotSizeSqft'], 0);
  return {
    areaSqft: areaSqft > 0 ? areaSqft : null,
    pointCount: points.length,
    source: areaSqft > 0 ? 'provided_area' : 'not_available',
  };
}

function readPoints(payload) {
  const candidates = [
    readValue(payload, ['boundaryPoints']),
    readValue(payload, ['coordinates']),
    readValue(payload, ['polygon']),
    readValue(payload, ['plot', 'boundaryPoints']),
    readValue(payload, ['inputs', 'boundaryPoints']),
  ];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }
    const points = candidate.map(normalizePoint).filter(Boolean);
    if (points.length > 0) {
      return points;
    }
  }

  return [];
}

function normalizePoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    if (isFiniteNumber(first) && isFiniteNumber(second)) {
      return { lng: first, lat: second };
    }
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.lon ?? value.longitude);
  if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
    return { lat, lng };
  }

  const x = Number(value.x);
  const y = Number(value.y);
  if (isFiniteNumber(x) && isFiniteNumber(y)) {
    return { x, y };
  }

  return null;
}

function polygonGeoAreaSqm(points) {
  const earthRadius = 6378137;
  const avgLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const latScale = Math.PI * earthRadius / 180;
  const lngScale = latScale * Math.cos((avgLat * Math.PI) / 180);
  const xyPoints = points.map((point) => ({
    x: point.lng * lngScale,
    y: point.lat * latScale,
  }));
  return Math.abs(shoelaceArea(xyPoints));
}

function shoelaceArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function readValue(payload, path) {
  let current = payload;
  for (const key of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

function readFromPayload(payload, names) {
  for (const name of names) {
    const direct = readValue(payload, [name]);
    if (direct !== undefined && direct !== null && direct !== '') {
      return direct;
    }
    const nested = readValue(payload, ['inputs', name]);
    if (nested !== undefined && nested !== null && nested !== '') {
      return nested;
    }
    const context = readValue(payload, ['context', name]);
    if (context !== undefined && context !== null && context !== '') {
      return context;
    }
  }
  return undefined;
}

function readNumber(payload, names, fallback) {
  const value = Number(readFromPayload(payload, names));
  return isFiniteNumber(value) ? value : fallback;
}

function readInteger(payload, names, fallback) {
  const value = Number.parseInt(String(readFromPayload(payload, names)), 10);
  return Number.isInteger(value) ? value : fallback;
}

function readString(payload, names, fallback) {
  const value = readFromPayload(payload, names);
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 160);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, precision) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function capitalize(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return 'INR 0';
  }
  return `INR ${Math.round(amount).toLocaleString('en-IN')}`;
}
