export type PortalCategory =
  | 'buy'
  | 'rent'
  | 'new-launch'
  | 'commercial'
  | 'plots-land'
  | 'projects';

export interface PortalHeroSlide {
  id: string;
  image: string;
  projectName: string;
  headline: string;
  details: string;
  ctaLabel: string;
}

export interface PortalProperty {
  id: string;
  referenceId: string;
  title: string;
  location: string;
  city: string;
  priceLabel: string;
  priceValue: number;
  areaSqft: number;
  areaLabel: string;
  bhk: string;
  bath: string;
  parking: string;
  status: string;
  verified: boolean;
  featured: boolean;
  isNew: boolean;
  readyToMove: boolean;
  image: string;
  category: PortalCategory;
  projectName: string;
  facing: string;
  floor: string;
  description: string;
  amenities: string[];
  constructionStatus?: string;
  constructionCompletionPercent?: number | null;
  constructionLastUpdatedAt?: string | null;
}

export type PortalContactRole = 'Owner' | 'Dealer' | 'Builder';

export interface PortalPropertyContact {
  role: PortalContactRole;
  phone: string;
}

export const portalHeroSlides: PortalHeroSlide[] = [
  {
    id: 'hero-1',
    image: '/images/hero-bg.jpg',
    projectName: 'Skyline Crest Residences',
    headline: 'Limited Period Offer: Free Club Membership',
    details: '2, 3 & 4 BHK luxury homes | Whitefield | From Rs 1.45 Cr',
    ctaLabel: 'Explore Now',
  },
  {
    id: 'hero-2',
    image: '/images/property-2.jpg',
    projectName: 'Green Arc Villas',
    headline: 'Ready-To-Move Inventory Launch',
    details: 'Premium villa community | Sarjapur | Possession in 30 days',
    ctaLabel: 'Explore Now',
  },
  {
    id: 'hero-3',
    image: '/images/property-4.jpg',
    projectName: 'Urban Square Commerce',
    headline: 'Assured Rental Plan For First 24 Months',
    details: 'Grade-A commercial spaces | Electronic City | From Rs 92 Lakh',
    ctaLabel: 'Explore Now',
  },
];

export const continueBrowsingPills = [
  'Buy in Bangalore East',
  'Buy in Belgaum',
  'Explore New City',
];

export interface PortalTrendLocality {
  id: string;
  locality: string;
  city: string;
  demandLabel: string;
  averageTicket: string;
  momentum: string;
  trustNote: string;
  filters: {
    city: string;
    locality: string;
  };
}

export const portalTrendLocalities: PortalTrendLocality[] = [
  {
    id: 'trend-whitefield',
    locality: 'Whitefield',
    city: 'Bangalore',
    demandLabel: 'High buyer demand',
    averageTicket: 'INR 1.25 Cr - 1.9 Cr',
    momentum: 'Metro-led upgrade demand and ready inventory movement remain strong.',
    trustNote: 'Verified apartments and township stock are concentrated here.',
    filters: {
      city: 'Bangalore',
      locality: 'Whitefield',
    },
  },
  {
    id: 'trend-sarjapur',
    locality: 'Sarjapur Road',
    city: 'Bangalore',
    demandLabel: 'Fast moving family zone',
    averageTicket: 'INR 92 Lakh - 2.4 Cr',
    momentum: 'Villa and large-format home searches are consistently rising.',
    trustNote: 'Strong mix of ready-to-move and under-construction communities.',
    filters: {
      city: 'Bangalore',
      locality: 'Sarjapur Road',
    },
  },
  {
    id: 'trend-hebbal',
    locality: 'Hebbal',
    city: 'Bangalore',
    demandLabel: 'Premium corridor',
    averageTicket: 'INR 1.4 Cr - 2.2 Cr',
    momentum: 'Lake-view inventory and airport connectivity keep premium demand healthy.',
    trustNote: 'Higher share of verified premium towers and investor interest.',
    filters: {
      city: 'Bangalore',
      locality: 'Hebbal',
    },
  },
  {
    id: 'trend-devanahalli',
    locality: 'Devanahalli',
    city: 'Bangalore',
    demandLabel: 'Growth-corridor watch',
    averageTicket: 'INR 98 Lakh - 2.8 Cr',
    momentum: 'New launch and plotted development momentum remains one of the strongest.',
    trustNote: 'Project-led supply is expanding fastest in this micro-market.',
    filters: {
      city: 'Bangalore',
      locality: 'Devanahalli',
    },
  },
];

export const portalProperties: PortalProperty[] = [
  {
    id: 'p-101',
    referenceId: 'ZDT-BUY-101',
    title: 'Modern 3 BHK Apartment',
    location: 'Whitefield Main Road',
    city: 'Bangalore',
    priceLabel: 'Rs 1.32 Cr',
    priceValue: 13200000,
    areaSqft: 1820,
    areaLabel: '1820 sq.ft',
    bhk: '3 BHK',
    bath: '3 Bath',
    parking: '2 Parking',
    status: 'Ready to Move',
    verified: true,
    featured: true,
    isNew: true,
    readyToMove: true,
    image: '/images/property-1.jpg',
    category: 'buy',
    projectName: 'Crest One',
    facing: 'East',
    floor: '12 / 24',
    description: 'Premium apartment with clubhouse, landscaped deck and high rental demand zone.',
    amenities: ['Clubhouse', 'Gym', 'Swimming Pool', 'Power Backup', '24x7 Security'],
  },
  {
    id: 'p-102',
    referenceId: 'ZDT-REN-102',
    title: 'Fully Furnished 2 BHK',
    location: 'HSR Layout Sector 2',
    city: 'Bangalore',
    priceLabel: 'Rs 52,000 / month',
    priceValue: 52000,
    areaSqft: 1280,
    areaLabel: '1280 sq.ft',
    bhk: '2 BHK',
    bath: '2 Bath',
    parking: '1 Parking',
    status: 'Available Now',
    verified: true,
    featured: false,
    isNew: false,
    readyToMove: true,
    image: '/images/property-2.jpg',
    category: 'rent',
    projectName: 'Lakepoint Habitat',
    facing: 'North',
    floor: '7 / 15',
    description: 'Tastefully furnished unit near metro and tech parks.',
    amenities: ['Furnished', 'Lift', 'CCTV', 'Maintenance Staff'],
  },
  {
    id: 'p-103',
    referenceId: 'ZDT-NL-103',
    title: 'Signature 4 BHK Sky Villa',
    location: 'Devanahalli Growth Corridor',
    city: 'Bangalore',
    priceLabel: 'Rs 2.78 Cr',
    priceValue: 27800000,
    areaSqft: 2960,
    areaLabel: '2960 sq.ft',
    bhk: '4 BHK',
    bath: '4 Bath',
    parking: '3 Parking',
    status: 'New Launch',
    verified: true,
    featured: true,
    isNew: true,
    readyToMove: false,
    image: '/images/property-3.jpg',
    category: 'new-launch',
    projectName: 'Aero Heights',
    facing: 'North-East',
    floor: '18 / 28',
    description: 'Ultra-luxury inventory with private deck and skyline views.',
    amenities: ['Sky Lounge', 'Concierge', 'Infinity Pool', 'Business Lounge'],
  },
  {
    id: 'p-104',
    referenceId: 'ZDT-COM-104',
    title: 'High Street Retail Space',
    location: 'Indiranagar 100 Ft Road',
    city: 'Bangalore',
    priceLabel: 'Rs 1.85 Cr',
    priceValue: 18500000,
    areaSqft: 1425,
    areaLabel: '1425 sq.ft',
    bhk: 'Retail',
    bath: '2 Washrooms',
    parking: 'Visitor Parking',
    status: 'Commercial',
    verified: true,
    featured: true,
    isNew: false,
    readyToMove: true,
    image: '/images/property-4.jpg',
    category: 'commercial',
    projectName: 'Urban Axis',
    facing: 'West',
    floor: 'Ground',
    description: 'Prime frontage commercial unit with high walk-in potential.',
    amenities: ['Power Backup', 'Fire NOC', 'CCTV', 'Dedicated Signage'],
  },
  {
    id: 'p-105',
    referenceId: 'ZDT-PLT-105',
    title: 'Corner Plot In Gated Layout',
    location: 'Mysore Road Extension',
    city: 'Bangalore',
    priceLabel: 'Rs 74 Lakh',
    priceValue: 7400000,
    areaSqft: 2400,
    areaLabel: '2400 sq.ft',
    bhk: 'Plot',
    bath: 'NA',
    parking: 'NA',
    status: 'Plots / Land',
    verified: true,
    featured: false,
    isNew: true,
    readyToMove: false,
    image: '/images/property-5.jpg',
    category: 'plots-land',
    projectName: 'Green Grid Layout',
    facing: 'South-East',
    floor: 'NA',
    description: 'DC converted site in approved gated layout near ring road expansion.',
    amenities: ['Gated Entry', 'Asphalt Roads', 'Drainage', 'Street Lighting'],
  },
  {
    id: 'p-106',
    referenceId: 'ZDT-PRO-106',
    title: 'Integrated Township Residences',
    location: 'Yelahanka New Town',
    city: 'Bangalore',
    priceLabel: 'From Rs 98 Lakh',
    priceValue: 9800000,
    areaSqft: 1560,
    areaLabel: '1560 sq.ft',
    bhk: '2 & 3 BHK',
    bath: '2 Bath',
    parking: '1 Parking',
    status: 'Projects',
    verified: true,
    featured: true,
    isNew: true,
    readyToMove: false,
    image: '/images/property-1.jpg',
    category: 'projects',
    projectName: 'Nova Township',
    facing: 'East',
    floor: 'Multiple',
    description: 'Master-planned township with school, retail and sports district.',
    amenities: ['School', 'Retail Promenade', 'Sports Arena', 'Shuttle Service'],
  },
  {
    id: 'p-107',
    referenceId: 'ZDT-BUY-107',
    title: 'Lake View 3 BHK Residence',
    location: 'Hebbal Ring Road',
    city: 'Bangalore',
    priceLabel: 'Rs 1.68 Cr',
    priceValue: 16800000,
    areaSqft: 2015,
    areaLabel: '2015 sq.ft',
    bhk: '3 BHK',
    bath: '3 Bath',
    parking: '2 Parking',
    status: 'Ready to Move',
    verified: true,
    featured: false,
    isNew: false,
    readyToMove: true,
    image: '/images/property-2.jpg',
    category: 'buy',
    projectName: 'Lakefront Tower',
    facing: 'North',
    floor: '14 / 26',
    description: 'Premium corner unit with panoramic lake views.',
    amenities: ['Sky Deck', 'EV Charging', 'Jogging Track'],
  },
  {
    id: 'p-108',
    referenceId: 'ZDT-REN-108',
    title: 'Designer Studio Apartment',
    location: 'Koramangala 5th Block',
    city: 'Bangalore',
    priceLabel: 'Rs 31,000 / month',
    priceValue: 31000,
    areaSqft: 690,
    areaLabel: '690 sq.ft',
    bhk: 'Studio',
    bath: '1 Bath',
    parking: '1 Parking',
    status: 'Available Soon',
    verified: true,
    featured: false,
    isNew: true,
    readyToMove: false,
    image: '/images/property-3.jpg',
    category: 'rent',
    projectName: 'Urban Nest',
    facing: 'West',
    floor: '6 / 12',
    description: 'Compact premium studio for professionals in central location.',
    amenities: ['Furnished', 'Housekeeping', 'High-Speed Internet'],
  },
];

export function getPropertiesForCategory(category: PortalCategory): PortalProperty[] {
  if (category === 'projects') {
    return portalProperties.filter(
      (item) => item.category === 'projects' || item.category === 'new-launch'
    );
  }
  if (category === 'buy') {
    return portalProperties.filter(
      (item) => item.category === 'buy' || item.category === 'new-launch' || item.category === 'projects'
    );
  }
  return portalProperties.filter((item) => item.category === category);
}

export function findPropertyByReference(referenceId: string): PortalProperty | null {
  const key = referenceId.trim();
  if (!key) {
    return null;
  }
  return (
    portalProperties.find((item) => item.referenceId.toLowerCase() === key.toLowerCase()) || null
  );
}

function resolvePortalContactRole(category?: PortalCategory): PortalContactRole {
  if (category === 'commercial') {
    return 'Dealer';
  }
  if (category === 'projects' || category === 'new-launch') {
    return 'Builder';
  }
  return 'Owner';
}

export function getPortalPropertyContact(
  propertyOrReference?: PortalProperty | string | null
): PortalPropertyContact {
  const property =
    typeof propertyOrReference === 'string'
      ? findPropertyByReference(propertyOrReference)
      : propertyOrReference || null;
  const role = resolvePortalContactRole(property?.category);

  if (role === 'Dealer') {
    return { role, phone: '+91 90000 20002' };
  }
  if (role === 'Builder') {
    return { role, phone: '+91 90000 30003' };
  }
  return { role, phone: '+91 90000 10001' };
}
