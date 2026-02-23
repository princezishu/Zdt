WITH seed_rows AS (
  SELECT *
  FROM (
    VALUES
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Hukkeri', 'Sankeshwar']::text[],
        'APPROVED',
        'Hukkeri-Sankeshwar Connector Road Improvement',
        'Karnataka PWD',
        'Road Improvement',
        'Administrative approval noted; preparing work package and scheduling.',
        'MEDIUM',
        'PWD administrative note / tender reference (public)',
        NULL,
        'TENDER',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Chikodi']::text[],
        'APPROVED',
        'Chikodi Town Approach Road Upgrade',
        'Karnataka PWD',
        'Approach Road Upgrade',
        'Approved for improvement; awaiting tender / contractor finalization.',
        'MEDIUM',
        'PWD tender notice (public)',
        NULL,
        'TENDER',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Hukkeri']::text[],
        'APPROVED',
        'Hukkeri Bypass Link Road Widening',
        'NHAI',
        'Road Widening',
        'Tender floated for high-impact widening and junction redesign.',
        'HIGH',
        'NHAI tender notice (public)',
        'https://example.com/nhai-tender',
        'TENDER',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Gokak']::text[],
        'UNDER_CONSTRUCTION',
        'Gokak Drainage + Road Surface Restoration',
        'Municipal Council',
        'Drainage / Civic Works',
        'Work in progress; traffic diversions may occur near work stretch.',
        'LOW',
        'Municipal work order update (public)',
        NULL,
        'PUBLIC_NOTICE',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Sankeshwar']::text[],
        'UNDER_CONSTRUCTION',
        'Sankeshwar Main Road Junction Improvement',
        'Karnataka PWD',
        'Junction Improvement',
        'On-site work ongoing; junction redesign and safety markings planned.',
        'MEDIUM',
        'PWD site update / tender package (public)',
        NULL,
        'OFFICE_CONFIRMED',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Hukkeri']::text[],
        'PROPOSED',
        'Hukkeri Peripheral Traffic Decongestion Proposal',
        'District Administration',
        'Connectivity Proposal',
        'Proposal under review; awaiting administrative decision.',
        'MEDIUM',
        'District meeting notes summary (public)',
        NULL,
        'LOCAL_REPORT',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Chikodi', 'Hukkeri']::text[],
        'PROPOSED',
        'Belagavi Region Inter-town Connectivity Proposal',
        'Karnataka PWD',
        'Bypass / Ring Road',
        'Initial planning discussion stage; scope may change after surveys.',
        'HIGH',
        'Planning reference (public)',
        NULL,
        'UNKNOWN',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Gokak']::text[],
        'COMPLETED',
        'Gokak Internal Road Patchwork Completion',
        'Municipal Council',
        'Road Maintenance',
        'Patchwork and resurfacing completed on selected internal stretches.',
        'LOW',
        'Municipal completion note (public)',
        NULL,
        'PUBLIC_NOTICE',
        CURRENT_DATE
      ),
      (
        'Karnataka',
        'Belagavi',
        ARRAY['Sankeshwar']::text[],
        'COMPLETED',
        'Sankeshwar Street Lighting Upgrade (Key Road)',
        'Municipal Council',
        'Street Lighting',
        'Lighting upgrade completed on key road stretch for safety.',
        'LOW',
        'Municipal update (public)',
        NULL,
        'PUBLIC_NOTICE',
        CURRENT_DATE
      )
  ) AS t (
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
    source_url,
    verification_level,
    last_updated
  )
)
INSERT INTO infra_updates (
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
  source_url,
  verification_level,
  last_updated
)
SELECT
  s.state,
  s.district,
  s.cities,
  s.category,
  s.project_name,
  s.authority,
  s.project_type,
  s.status_text,
  s.impact_level,
  s.source_ref,
  s.source_url,
  s.verification_level,
  s.last_updated
FROM seed_rows s
WHERE NOT EXISTS (
  SELECT 1
  FROM infra_updates i
  WHERE LOWER(i.state) = LOWER(s.state)
    AND LOWER(i.district) = LOWER(s.district)
    AND LOWER(i.project_name) = LOWER(s.project_name)
);
