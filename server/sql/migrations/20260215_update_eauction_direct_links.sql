-- Update e-auction source links to direct auction pages.

UPDATE eauction_sources
SET
  portal_url = 'https://www.eauctionindia.com/property-auction',
  description = 'Direct property-auction listing page for SARFAESI and bank auctions.',
  badges = ARRAY['Official', 'Bank Auction', 'SARFAESI']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 10,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('e-Auction India (Indian Banks)');

UPDATE eauction_sources
SET
  portal_url = 'https://www.mstcecommerce.com/auctionhome/',
  description = 'Direct auction home for government, PSU and institutional e-auctions.',
  badges = ARRAY['Official', 'Govt PSU', 'e-Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 20,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('MSTC eCommerce (Govt PSU)');

UPDATE eauction_sources
SET
  portal_url = 'https://sbi.bank.in/web/sbi-in-the-news/auction-notices',
  description = 'Direct SBI auction notices page.',
  badges = ARRAY['Official', 'Bank Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 30,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('SBI Auctions');

UPDATE eauction_sources
SET
  portal_url = 'https://bankofbaroda.bank.in/e-auction',
  description = 'Direct Bank of Baroda e-auction page.',
  badges = ARRAY['Official', 'Bank Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 40,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('Bank of Baroda e-Auction');

UPDATE eauction_sources
SET
  portal_url = 'https://pnb.bank.in/eAuction.aspx/Tender.aspx',
  description = 'Direct PNB e-auction tender listings page.',
  badges = ARRAY['Official', 'Bank Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 50,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('PNB e-Auction');

UPDATE eauction_sources
SET
  portal_url = 'https://www.canarabank.bank.in/e-auction',
  description = 'Direct Canara Bank e-auction page.',
  badges = ARRAY['Official', 'Bank Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 60,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('Canara Bank e-Auction');

UPDATE eauction_sources
SET
  portal_url = 'https://www.icicihfc.com/property-auction',
  description = 'Direct ICICI Home Finance property auction page.',
  badges = ARRAY['Official', 'Bank Auction']::TEXT[],
  category = 'all',
  is_active = TRUE,
  sort_order = 70,
  updated_at = NOW()
WHERE LOWER(name) = LOWER('ICICI Bank Property Auctions');

