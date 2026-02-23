-- Seed: Official e-auction portal sources (bank/government).

INSERT INTO eauction_sources (
  name,
  portal_url,
  category,
  description,
  badges,
  is_active,
  sort_order
)
VALUES
  (
    'e-Auction India (Indian Banks)',
    'https://www.eauctionindia.com/property-auction',
    'all',
    'Direct property-auction listing page for SARFAESI and bank auctions.',
    ARRAY['Official', 'Bank Auction', 'SARFAESI']::TEXT[],
    TRUE,
    10
  ),
  (
    'MSTC eCommerce (Govt PSU)',
    'https://www.mstcecommerce.com/auctionhome/',
    'all',
    'Direct auction home for government, PSU and institutional e-auctions.',
    ARRAY['Official', 'Govt PSU', 'e-Auction']::TEXT[],
    TRUE,
    20
  ),
  (
    'SBI Auctions',
    'https://sbi.bank.in/web/sbi-in-the-news/auction-notices',
    'all',
    'Direct SBI auction notices page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    30
  ),
  (
    'Bank of Baroda e-Auction',
    'https://bankofbaroda.bank.in/e-auction',
    'all',
    'Direct Bank of Baroda e-auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    40
  ),
  (
    'PNB e-Auction',
    'https://pnb.bank.in/eAuction.aspx/Tender.aspx',
    'all',
    'Direct PNB e-auction tender listings page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    50
  ),
  (
    'Canara Bank e-Auction',
    'https://www.canarabank.bank.in/e-auction',
    'all',
    'Direct Canara Bank e-auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    60
  ),
  (
    'ICICI Bank Property Auctions',
    'https://www.icicihfc.com/property-auction',
    'all',
    'Direct ICICI Home Finance property auction page.',
    ARRAY['Official', 'Bank Auction']::TEXT[],
    TRUE,
    70
  )
ON CONFLICT (portal_url)
DO UPDATE
  SET name = EXCLUDED.name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      badges = EXCLUDED.badges,
      is_active = TRUE,
      sort_order = EXCLUDED.sort_order;
