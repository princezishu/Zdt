INSERT INTO infra_updates
  (
    state,
    district,
    cities,
    category,
    project_name,
    authority,
    project_type,
    status_text,
    impact_level,
    source_ref,
    last_updated
  )
VALUES
  -- APPROVED
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Hukkeri', 'Sankeshwar'],
    'APPROVED',
    'Hukkeri-Sankeshwar Connector Road Improvement',
    'Karnataka PWD',
    'Road Improvement',
    'Administrative approval noted; preparing work package and scheduling.',
    'MEDIUM',
    'PWD administrative note / tender reference (public)',
    CURRENT_DATE
  ),
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Chikodi'],
    'APPROVED',
    'Chikodi Town Approach Road Upgrade',
    'Karnataka PWD',
    'Approach Road Upgrade',
    'Approved for improvement; awaiting tender / contractor finalization.',
    'MEDIUM',
    'PWD tender notice (public)',
    CURRENT_DATE
  ),
  -- UNDER CONSTRUCTION
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Gokak'],
    'UNDER_CONSTRUCTION',
    'Gokak Drainage + Road Surface Restoration',
    'Municipal Council',
    'Civic Works',
    'Work in progress; traffic diversions may occur near work stretch.',
    'LOW',
    'Municipal work order update (public)',
    CURRENT_DATE
  ),
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Sankeshwar'],
    'UNDER_CONSTRUCTION',
    'Sankeshwar Main Road Junction Improvement',
    'Karnataka PWD',
    'Junction Improvement',
    'On-site work ongoing; junction redesign and safety markings planned.',
    'MEDIUM',
    'PWD site update / tender package (public)',
    CURRENT_DATE
  ),
  -- PROPOSED
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Hukkeri'],
    'PROPOSED',
    'Hukkeri Peripheral Traffic Decongestion Proposal',
    'District Administration',
    'Traffic Decongestion',
    'Proposal under review; awaiting administrative decision.',
    'MEDIUM',
    'District meeting notes summary (public)',
    CURRENT_DATE
  ),
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Chikodi', 'Hukkeri'],
    'PROPOSED',
    'Belagavi Region Inter-town Connectivity Proposal',
    'Karnataka PWD',
    'Connectivity Proposal',
    'Initial planning discussion stage; scope may change after surveys.',
    'HIGH',
    'Planning reference (public)',
    CURRENT_DATE
  ),
  -- COMPLETED
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Gokak'],
    'COMPLETED',
    'Gokak Internal Road Patchwork Completion',
    'Municipal Council',
    'Road Maintenance',
    'Patchwork and resurfacing completed on selected internal stretches.',
    'LOW',
    'Municipal completion note (public)',
    CURRENT_DATE
  ),
  (
    'Karnataka',
    'Belagavi',
    ARRAY['Sankeshwar'],
    'COMPLETED',
    'Sankeshwar Street Lighting Upgrade (Key Road)',
    'Municipal Council',
    'Street Lighting',
    'Lighting upgrade completed on key road stretch for safety.',
    'LOW',
    'Municipal update (public)',
    CURRENT_DATE
  );
