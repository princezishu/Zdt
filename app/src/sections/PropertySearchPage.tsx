import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LgdLocationAccuracyNote, LgdLocationInput } from '@/components/realty/LgdLocationInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PropertyMode = 'buy' | 'sell' | 'rent';

interface PropertySearchPageProps {
  mode: PropertyMode;
}

interface Listing {
  id: number;
  mode: PropertyMode;
  title: string;
  city: string;
  locality: string;
  landmark: string;
  pinCode: string;
  propertyType: 'Apartment' | 'Villa' | 'Independent House' | 'Plot' | 'Commercial';
  bhk: '1 BHK' | '2 BHK' | '3 BHK' | '4+ BHK' | 'Studio' | 'N/A';
  postedBy: 'Owner' | 'Agent' | 'Builder';
  priceLakh: number;
  areaSqFt: number;
  carpetAreaSqFt: number;
  plotSizeSqFt: number;
  furnishing: 'Furnished' | 'Semi-Furnished' | 'Unfurnished';
  possession: 'Ready to Move' | 'Under Construction';
  facing: 'North' | 'East' | 'South' | 'West' | 'North-East' | 'North-West' | 'South-East' | 'South-West';
  gatedCommunity: boolean;
  cornerPlot: boolean;
  roadFacing: boolean;
  reraApproved: boolean;
  pricePerSqFt: number;
  age: 'New Launch' | 'Ready to Move' | '1-5 Years' | '5-10 Years';
  image: string;
  listedDaysAgo: number;
  monthlyRent?: number;
  securityDeposit?: number;
  maintenanceIncluded?: boolean;
  brokerageSource?: 'Owner' | 'Agent';
  parkingType?: 'None' | 'Open' | 'Covered';
  floorNumber?: number;
  hasLift?: boolean;
  availableFrom?: string;
  leaseTerm?: 'Short-term' | 'Long-term';
  bachelorAllowed?: boolean;
  familyPreferred?: boolean;
  petsAllowed?: boolean;
  latitude?: number;
  longitude?: number;
  nearbyTransport?: string[];
}

const listings: Listing[] = [
  {
    id: 1,
    mode: 'buy',
    title: 'Premium 3 BHK in Sector 63',
    city: 'Noida',
    locality: 'Sector 63',
    landmark: 'Near Electronic City Metro',
    pinCode: '201301',
    propertyType: 'Apartment',
    bhk: '3 BHK',
    postedBy: 'Builder',
    priceLakh: 135,
    areaSqFt: 1680,
    carpetAreaSqFt: 1380,
    plotSizeSqFt: 0,
    furnishing: 'Semi-Furnished',
    possession: 'Ready to Move',
    facing: 'East',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: true,
    reraApproved: true,
    pricePerSqFt: 8036,
    age: 'Ready to Move',
    image: '/images/property-1.jpg',
    listedDaysAgo: 1,
  },
  {
    id: 2,
    mode: 'buy',
    title: 'Independent Villa Near IT Hub',
    city: 'Bengaluru',
    locality: 'Whitefield',
    landmark: 'Near ITPL Main Gate',
    pinCode: '560066',
    propertyType: 'Villa',
    bhk: '4+ BHK',
    postedBy: 'Owner',
    priceLakh: 245,
    areaSqFt: 2900,
    carpetAreaSqFt: 2350,
    plotSizeSqFt: 2400,
    furnishing: 'Furnished',
    possession: 'Ready to Move',
    facing: 'North',
    gatedCommunity: true,
    cornerPlot: true,
    roadFacing: true,
    reraApproved: true,
    pricePerSqFt: 8448,
    age: '1-5 Years',
    image: '/images/property-2.jpg',
    listedDaysAgo: 5,
  },
  {
    id: 3,
    mode: 'sell',
    title: 'Urgent Sale: 2 BHK with Balcony',
    city: 'Pune',
    locality: 'Wakad',
    landmark: 'Near Wakad Bridge',
    pinCode: '411057',
    propertyType: 'Apartment',
    bhk: '2 BHK',
    postedBy: 'Owner',
    priceLakh: 78,
    areaSqFt: 1120,
    carpetAreaSqFt: 910,
    plotSizeSqFt: 0,
    furnishing: 'Semi-Furnished',
    possession: 'Ready to Move',
    facing: 'West',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: false,
    reraApproved: true,
    pricePerSqFt: 6964,
    age: '1-5 Years',
    image: '/images/property-3.jpg',
    listedDaysAgo: 2,
  },
  {
    id: 4,
    mode: 'sell',
    title: 'Commercial Office in Prime Market',
    city: 'Mumbai',
    locality: 'Andheri East',
    landmark: 'Near Metro Line 1',
    pinCode: '400069',
    propertyType: 'Commercial',
    bhk: 'N/A',
    postedBy: 'Agent',
    priceLakh: 190,
    areaSqFt: 1450,
    carpetAreaSqFt: 1180,
    plotSizeSqFt: 0,
    furnishing: 'Unfurnished',
    possession: 'Ready to Move',
    facing: 'South',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: true,
    reraApproved: true,
    pricePerSqFt: 13103,
    age: '5-10 Years',
    image: '/images/property-4.jpg',
    listedDaysAgo: 3,
  },
  {
    id: 5,
    mode: 'rent',
    title: 'Fully Furnished 1 BHK for Family',
    city: 'Hyderabad',
    locality: 'Kondapur',
    landmark: 'Near Botanical Garden',
    pinCode: '500084',
    propertyType: 'Apartment',
    bhk: '1 BHK',
    postedBy: 'Owner',
    priceLakh: 0.22,
    areaSqFt: 650,
    carpetAreaSqFt: 520,
    plotSizeSqFt: 0,
    furnishing: 'Furnished',
    possession: 'Ready to Move',
    facing: 'East',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: false,
    reraApproved: true,
    pricePerSqFt: 3385,
    age: 'Ready to Move',
    image: '/images/property-5.jpg',
    listedDaysAgo: 1,
    monthlyRent: 22000,
    securityDeposit: 45000,
    maintenanceIncluded: true,
    brokerageSource: 'Owner',
    parkingType: 'Open',
    floorNumber: 4,
    hasLift: true,
    availableFrom: '2026-03-01',
    leaseTerm: 'Long-term',
    bachelorAllowed: false,
    familyPreferred: true,
    petsAllowed: true,
    latitude: 17.4713,
    longitude: 78.3649,
    nearbyTransport: ['HITEC City Metro', 'Raidurg Metro', 'Kondapur Bus Stop'],
  },
  {
    id: 6,
    mode: 'rent',
    title: 'Spacious 3 BHK in Gated Society',
    city: 'Gurugram',
    locality: 'Sector 57',
    landmark: 'Near Golf Course Extension Road',
    pinCode: '122003',
    propertyType: 'Apartment',
    bhk: '3 BHK',
    postedBy: 'Agent',
    priceLakh: 0.45,
    areaSqFt: 1830,
    carpetAreaSqFt: 1520,
    plotSizeSqFt: 0,
    furnishing: 'Semi-Furnished',
    possession: 'Ready to Move',
    facing: 'North-East',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: true,
    reraApproved: true,
    pricePerSqFt: 2459,
    age: '1-5 Years',
    image: '/images/property-1.jpg',
    listedDaysAgo: 4,
    monthlyRent: 45000,
    securityDeposit: 90000,
    maintenanceIncluded: false,
    brokerageSource: 'Agent',
    parkingType: 'Covered',
    floorNumber: 9,
    hasLift: true,
    availableFrom: '2026-02-18',
    leaseTerm: 'Long-term',
    bachelorAllowed: true,
    familyPreferred: true,
    petsAllowed: false,
    latitude: 28.4208,
    longitude: 77.0867,
    nearbyTransport: ['Sector 55-56 Rapid Metro', 'Golf Course Extn Bus Corridor'],
  },
  {
    id: 7,
    mode: 'rent',
    title: 'Modern 2 BHK Near IT Park',
    city: 'Hyderabad',
    locality: 'Gachibowli',
    landmark: 'Near Wipro Circle',
    pinCode: '500032',
    propertyType: 'Apartment',
    bhk: '2 BHK',
    postedBy: 'Agent',
    priceLakh: 0.35,
    areaSqFt: 1240,
    carpetAreaSqFt: 990,
    plotSizeSqFt: 0,
    furnishing: 'Semi-Furnished',
    possession: 'Ready to Move',
    facing: 'North',
    gatedCommunity: true,
    cornerPlot: false,
    roadFacing: true,
    reraApproved: true,
    pricePerSqFt: 2823,
    age: '1-5 Years',
    image: '/images/property-2.jpg',
    listedDaysAgo: 2,
    monthlyRent: 35000,
    securityDeposit: 70000,
    maintenanceIncluded: true,
    brokerageSource: 'Agent',
    parkingType: 'Covered',
    floorNumber: 6,
    hasLift: true,
    availableFrom: '2026-02-20',
    leaseTerm: 'Long-term',
    bachelorAllowed: true,
    familyPreferred: true,
    petsAllowed: true,
    latitude: 17.4435,
    longitude: 78.3484,
    nearbyTransport: ['Raidurg Metro', 'Gachibowli ORR Exit', 'Wipro Circle Bus Stop'],
  },
  {
    id: 8,
    mode: 'rent',
    title: 'Compact Studio for Working Professionals',
    city: 'Hyderabad',
    locality: 'Madhapur',
    landmark: 'Near Cyber Towers',
    pinCode: '500081',
    propertyType: 'Apartment',
    bhk: 'Studio',
    postedBy: 'Owner',
    priceLakh: 0.18,
    areaSqFt: 460,
    carpetAreaSqFt: 390,
    plotSizeSqFt: 0,
    furnishing: 'Furnished',
    possession: 'Ready to Move',
    facing: 'East',
    gatedCommunity: false,
    cornerPlot: false,
    roadFacing: false,
    reraApproved: true,
    pricePerSqFt: 3913,
    age: 'Ready to Move',
    image: '/images/property-3.jpg',
    listedDaysAgo: 6,
    monthlyRent: 18000,
    securityDeposit: 36000,
    maintenanceIncluded: true,
    brokerageSource: 'Owner',
    parkingType: 'None',
    floorNumber: 2,
    hasLift: true,
    availableFrom: '2026-02-16',
    leaseTerm: 'Short-term',
    bachelorAllowed: true,
    familyPreferred: false,
    petsAllowed: false,
    latitude: 17.4488,
    longitude: 78.3915,
    nearbyTransport: ['HITEC City Metro', 'Cyber Towers Bus Stop'],
  },
];

const budgetRanges = [
  { value: '0', label: 'No Min' },
  { value: '20', label: '20 L' },
  { value: '50', label: '50 L' },
  { value: '100', label: '1 Cr' },
  { value: '150', label: '1.5 Cr' },
  { value: '250', label: '2.5 Cr' },
];

const maxBudgetRanges = [
  { value: '10000', label: 'No Max' },
  { value: '50', label: '50 L' },
  { value: '100', label: '1 Cr' },
  { value: '150', label: '1.5 Cr' },
  { value: '250', label: '2.5 Cr' },
  { value: '500', label: '5 Cr' },
];

const rentBudgetRanges = [
  { value: '0', label: 'No Min' },
  { value: '0.1', label: 'Rs 10k' },
  { value: '0.2', label: 'Rs 20k' },
  { value: '0.3', label: 'Rs 30k' },
  { value: '0.5', label: 'Rs 50k' },
  { value: '0.8', label: 'Rs 80k' },
];

const rentMaxBudgetRanges = [
  { value: '10000', label: 'No Max' },
  { value: '0.3', label: 'Rs 30k' },
  { value: '0.5', label: 'Rs 50k' },
  { value: '0.8', label: 'Rs 80k' },
  { value: '1.2', label: 'Rs 1.2L' },
  { value: '2', label: 'Rs 2L' },
];

type YesNoFilter = 'Any' | 'Yes' | 'No';
type RentViewMode = 'list' | 'map' | 'split';

function getMonthlyRent(item: Listing): number {
  if (typeof item.monthlyRent === 'number') {
    return item.monthlyRent;
  }
  return Math.round(item.priceLakh * 100000);
}

function getSecurityDeposit(item: Listing): number {
  if (typeof item.securityDeposit === 'number') {
    return item.securityDeposit;
  }
  return getMonthlyRent(item) * 2;
}

function matchesYesNoFilter(filter: YesNoFilter, value: boolean): boolean {
  if (filter === 'Any') return true;
  return filter === 'Yes' ? value : !value;
}

function calculateDistanceKm(
  sourceLat: number,
  sourceLon: number,
  targetLat: number,
  targetLon: number
): number {
  const radians = Math.PI / 180;
  const dLat = (targetLat - sourceLat) * radians;
  const dLon = (targetLon - sourceLon) * radians;
  const lat1 = sourceLat * radians;
  const lat2 = targetLat * radians;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function hasCoordinates(
  item: Listing
): item is Listing & { latitude: number; longitude: number } {
  return typeof item.latitude === 'number' && typeof item.longitude === 'number';
}

function formatPrice(mode: PropertyMode, valueInLakh: number): string {
  if (mode === 'rent') {
    const monthly = Math.round(valueInLakh * 100000);
    return `Rs ${monthly.toLocaleString('en-IN')}/month`;
  }
  if (valueInLakh >= 100) {
    return `Rs ${(valueInLakh / 100).toFixed(2)} Cr`;
  }
  return `Rs ${valueInLakh.toFixed(0)} L`;
}

export default function PropertySearchPage({ mode }: PropertySearchPageProps) {
  const [keyword, setKeyword] = useState('');
  const [propertyType, setPropertyType] = useState('Any');
  const [bhk, setBhk] = useState('Any');
  const [postedBy, setPostedBy] = useState('Any');
  const [minBudget, setMinBudget] = useState('0');
  const [maxBudget, setMaxBudget] = useState('10000');
  const [sortBy, setSortBy] = useState('relevance');
  const [buyCity, setBuyCity] = useState('');
  const [buyLocality, setBuyLocality] = useState('');
  const [buyLandmark, setBuyLandmark] = useState('');
  const [buyPinCode, setBuyPinCode] = useState('');
  const [buyRadiusKm, setBuyRadiusKm] = useState('Any');
  const [buyBudgetMin, setBuyBudgetMin] = useState(20);
  const [buyBudgetMax, setBuyBudgetMax] = useState(250);
  const [buyPricePerSqFtMin, setBuyPricePerSqFtMin] = useState('');
  const [buyPricePerSqFtMax, setBuyPricePerSqFtMax] = useState('');
  const [buyPlotSizeMin, setBuyPlotSizeMin] = useState('');
  const [buyCarpetAreaMin, setBuyCarpetAreaMin] = useState('');
  const [buyFurnishing, setBuyFurnishing] = useState('Any');
  const [buyPossession, setBuyPossession] = useState('Any');
  const [buyFacing, setBuyFacing] = useState('Any');
  const [buyGatedCommunity, setBuyGatedCommunity] = useState(false);
  const [buyCornerPlot, setBuyCornerPlot] = useState(false);
  const [buyRoadFacing, setBuyRoadFacing] = useState(false);
  const [buyReraApproved, setBuyReraApproved] = useState(false);
  const [rentMonthlyMin, setRentMonthlyMin] = useState('');
  const [rentMonthlyMax, setRentMonthlyMax] = useState('');
  const [rentSecurityMin, setRentSecurityMin] = useState('');
  const [rentSecurityMax, setRentSecurityMax] = useState('');
  const [rentMaintenanceIncluded, setRentMaintenanceIncluded] = useState<YesNoFilter>('Any');
  const [rentBrokerage, setRentBrokerage] = useState('Any');
  const [rentAreaMin, setRentAreaMin] = useState('');
  const [rentAreaMax, setRentAreaMax] = useState('');
  const [rentFurnishing, setRentFurnishing] = useState('Any');
  const [rentParking, setRentParking] = useState('Any');
  const [rentFloorMin, setRentFloorMin] = useState('');
  const [rentLift, setRentLift] = useState<YesNoFilter>('Any');
  const [rentAvailableFrom, setRentAvailableFrom] = useState('');
  const [rentTerm, setRentTerm] = useState('Any');
  const [rentBachelorAllowed, setRentBachelorAllowed] = useState<YesNoFilter>('Any');
  const [rentFamilyPreferred, setRentFamilyPreferred] = useState<YesNoFilter>('Any');
  const [rentPetsAllowed, setRentPetsAllowed] = useState<YesNoFilter>('Any');
  const [rentViewMode, setRentViewMode] = useState<RentViewMode>('split');
  const [rentCenterId, setRentCenterId] = useState('Any');
  const [rentRadiusKm, setRentRadiusKm] = useState('Any');
  const [selectedListingId, setSelectedListingId] = useState<number | null>(null);

  const budgetOptions = mode === 'rent' ? rentBudgetRanges : budgetRanges;
  const maxBudgetOptions = mode === 'rent' ? rentMaxBudgetRanges : maxBudgetRanges;
  const rentCenterOptions = useMemo(
    () => listings.filter((entry) => entry.mode === 'rent' && entry.latitude && entry.longitude),
    []
  );

  const filteredListings = useMemo(() => {
    const min = Number(minBudget);
    const max = Number(maxBudget);
    const selectedCenterCandidate =
      mode === 'rent' && rentCenterId !== 'Any'
        ? listings.find((entry) => entry.id === Number(rentCenterId))
        : undefined;
    const selectedCenter =
      selectedCenterCandidate && hasCoordinates(selectedCenterCandidate)
        ? selectedCenterCandidate
        : undefined;
    const numericRadius = Number(rentRadiusKm);

    const base = listings.filter((item) => {
      if (item.mode !== mode) return false;
      if (keyword.trim()) {
        const query = keyword.toLowerCase();
        const haystack = `${item.city} ${item.locality} ${item.title}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (propertyType !== 'Any' && item.propertyType !== propertyType) return false;
      if (bhk !== 'Any' && item.bhk !== bhk) return false;
      if (postedBy !== 'Any' && item.postedBy !== postedBy) return false;
      if (item.priceLakh < min || item.priceLakh > max) return false;

      if (mode === 'buy') {
        if (buyCity.trim() && !item.city.toLowerCase().includes(buyCity.trim().toLowerCase())) {
          return false;
        }
        if (
          buyLocality.trim() &&
          !item.locality.toLowerCase().includes(buyLocality.trim().toLowerCase())
        ) {
          return false;
        }
        if (
          buyLandmark.trim() &&
          !item.landmark.toLowerCase().includes(buyLandmark.trim().toLowerCase())
        ) {
          return false;
        }
        if (buyPinCode.trim() && !item.pinCode.startsWith(buyPinCode.trim())) {
          return false;
        }

        if (item.priceLakh < buyBudgetMin || item.priceLakh > buyBudgetMax) return false;

        const minPpsf = Number(buyPricePerSqFtMin);
        const maxPpsf = Number(buyPricePerSqFtMax);
        if (!Number.isNaN(minPpsf) && buyPricePerSqFtMin.trim() && item.pricePerSqFt < minPpsf) {
          return false;
        }
        if (!Number.isNaN(maxPpsf) && buyPricePerSqFtMax.trim() && item.pricePerSqFt > maxPpsf) {
          return false;
        }

        const minPlotSize = Number(buyPlotSizeMin);
        if (!Number.isNaN(minPlotSize) && buyPlotSizeMin.trim() && item.plotSizeSqFt < minPlotSize) {
          return false;
        }

        const minCarpet = Number(buyCarpetAreaMin);
        if (!Number.isNaN(minCarpet) && buyCarpetAreaMin.trim() && item.carpetAreaSqFt < minCarpet) {
          return false;
        }

        if (buyFurnishing !== 'Any' && item.furnishing !== buyFurnishing) return false;
        if (buyPossession !== 'Any' && item.possession !== buyPossession) return false;
        if (buyFacing !== 'Any' && item.facing !== buyFacing) return false;

        if (buyGatedCommunity && !item.gatedCommunity) return false;
        if (buyCornerPlot && !item.cornerPlot) return false;
        if (buyRoadFacing && !item.roadFacing) return false;
        if (buyReraApproved && !item.reraApproved) return false;
      }

      if (mode === 'rent') {
        const monthlyRent = getMonthlyRent(item);
        const securityDeposit = getSecurityDeposit(item);

        const minMonthly = Number(rentMonthlyMin);
        const maxMonthly = Number(rentMonthlyMax);
        if (!Number.isNaN(minMonthly) && rentMonthlyMin.trim() && monthlyRent < minMonthly) {
          return false;
        }
        if (!Number.isNaN(maxMonthly) && rentMonthlyMax.trim() && monthlyRent > maxMonthly) {
          return false;
        }

        const minSecurity = Number(rentSecurityMin);
        const maxSecurity = Number(rentSecurityMax);
        if (!Number.isNaN(minSecurity) && rentSecurityMin.trim() && securityDeposit < minSecurity) {
          return false;
        }
        if (!Number.isNaN(maxSecurity) && rentSecurityMax.trim() && securityDeposit > maxSecurity) {
          return false;
        }

        if (!matchesYesNoFilter(rentMaintenanceIncluded, Boolean(item.maintenanceIncluded))) {
          return false;
        }
        if (rentBrokerage !== 'Any' && (item.brokerageSource ?? item.postedBy) !== rentBrokerage) {
          return false;
        }

        const minArea = Number(rentAreaMin);
        const maxArea = Number(rentAreaMax);
        if (!Number.isNaN(minArea) && rentAreaMin.trim() && item.areaSqFt < minArea) {
          return false;
        }
        if (!Number.isNaN(maxArea) && rentAreaMax.trim() && item.areaSqFt > maxArea) {
          return false;
        }

        if (rentFurnishing !== 'Any' && item.furnishing !== rentFurnishing) return false;
        if (rentParking !== 'Any' && (item.parkingType ?? 'None') !== rentParking) return false;

        const floorMin = Number(rentFloorMin);
        if (!Number.isNaN(floorMin) && rentFloorMin.trim() && (item.floorNumber ?? 0) < floorMin) {
          return false;
        }
        if (!matchesYesNoFilter(rentLift, Boolean(item.hasLift))) return false;

        if (rentAvailableFrom.trim() && item.availableFrom && item.availableFrom > rentAvailableFrom) {
          return false;
        }
        if (rentTerm !== 'Any' && (item.leaseTerm ?? 'Long-term') !== rentTerm) return false;
        if (!matchesYesNoFilter(rentBachelorAllowed, Boolean(item.bachelorAllowed))) return false;
        if (!matchesYesNoFilter(rentFamilyPreferred, Boolean(item.familyPreferred))) return false;
        if (!matchesYesNoFilter(rentPetsAllowed, Boolean(item.petsAllowed))) return false;

        if (
          rentRadiusKm !== 'Any' &&
          selectedCenter &&
          hasCoordinates(item) &&
          !Number.isNaN(numericRadius)
        ) {
          const distanceKm = calculateDistanceKm(
            selectedCenter.latitude,
            selectedCenter.longitude,
            item.latitude,
            item.longitude
          );
          if (distanceKm > numericRadius) return false;
        }
      }

      return true;
    });

    return base.sort((a, b) => {
      if (sortBy === 'price-low') return a.priceLakh - b.priceLakh;
      if (sortBy === 'price-high') return b.priceLakh - a.priceLakh;
      if (sortBy === 'newest') return a.listedDaysAgo - b.listedDaysAgo;
      return 0;
    });
  }, [
    bhk,
    keyword,
    maxBudget,
    minBudget,
    mode,
    postedBy,
    propertyType,
    sortBy,
    buyCity,
    buyLocality,
    buyLandmark,
    buyPinCode,
    buyBudgetMin,
    buyBudgetMax,
    buyPricePerSqFtMin,
    buyPricePerSqFtMax,
    buyPlotSizeMin,
    buyCarpetAreaMin,
    buyFurnishing,
    buyPossession,
    buyFacing,
    buyGatedCommunity,
    buyCornerPlot,
    buyRoadFacing,
    buyReraApproved,
    rentMonthlyMin,
    rentMonthlyMax,
    rentSecurityMin,
    rentSecurityMax,
    rentMaintenanceIncluded,
    rentBrokerage,
    rentAreaMin,
    rentAreaMax,
    rentFurnishing,
    rentParking,
    rentFloorMin,
    rentLift,
    rentAvailableFrom,
    rentTerm,
    rentBachelorAllowed,
    rentFamilyPreferred,
    rentPetsAllowed,
    rentCenterId,
    rentRadiusKm,
  ]);

  useEffect(() => {
    if (mode !== 'rent') return;
    if (filteredListings.length === 0) {
      if (selectedListingId !== null) {
        setSelectedListingId(null);
      }
      return;
    }
    if (!filteredListings.some((item) => item.id === selectedListingId)) {
      setSelectedListingId(filteredListings[0].id);
    }
  }, [filteredListings, mode, selectedListingId]);

  const selectedRentListing =
    mode === 'rent'
      ? (filteredListings.find((entry) => entry.id === selectedListingId) ?? filteredListings[0] ?? null)
      : null;

  const rentMapMarkers = useMemo(() => {
    if (mode !== 'rent') return [];
    const withCoordinates = filteredListings.filter(hasCoordinates);
    if (withCoordinates.length === 0) return [];

    const latitudes = withCoordinates.map((entry) => entry.latitude);
    const longitudes = withCoordinates.map((entry) => entry.longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLon = Math.min(...longitudes);
    const maxLon = Math.max(...longitudes);
    const latSpan = Math.max(maxLat - minLat, 0.005);
    const lonSpan = Math.max(maxLon - minLon, 0.005);

    return withCoordinates.map((entry) => {
      const normalizedX = ((entry.longitude - minLon) / lonSpan) * 76 + 12;
      const normalizedY = ((maxLat - entry.latitude) / latSpan) * 74 + 13;
      return {
        ...entry,
        x: normalizedX,
        y: normalizedY,
        monthlyRent: getMonthlyRent(entry),
      };
    });
  }, [filteredListings, mode]);

  const heading = mode === 'buy' ? 'Buy Properties' : mode === 'sell' ? 'Sell Properties' : 'Rent Properties';
  const headingDescription =
    mode === 'rent'
      ? 'Apply practical rent filters and switch between premium map/list views.'
      : 'Refine listings with locality, property type, budget, BHK and posting source.';
  const mapGridStyle = {
    backgroundImage:
      'linear-gradient(to right, rgba(30,41,59,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,41,59,0.08) 1px, transparent 1px)',
    backgroundSize: '32px 32px',
  };

  const renderListingCard = (item: Listing) => {
    const isRent = mode === 'rent';
    const isSelected = isRent && selectedListingId === item.id;

    return (
      <article
        key={item.id}
        onClick={isRent ? () => setSelectedListingId(item.id) : undefined}
        className={`zdt-panel h-full overflow-hidden rounded-2xl border bg-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl ${
          isSelected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-white/20'
        } ${isRent ? 'cursor-pointer' : ''}`}
      >
        <img src={item.image} alt={item.title} className="h-48 w-full object-cover" />
        <div className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
              <p className="text-sm text-slate-600">
                {item.locality}, {item.city}
              </p>
            </div>
            <Badge variant="outline" className="border-slate-300 text-xs text-slate-700">
              {item.postedBy}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">{item.propertyType}</Badge>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">{item.bhk}</Badge>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">{item.areaSqFt} sq.ft.</Badge>
            <Badge variant="secondary" className="bg-slate-100 text-slate-700">{item.age}</Badge>
          </div>

          {isRent && (
            <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
              <p>Deposit: Rs {getSecurityDeposit(item).toLocaleString('en-IN')}</p>
              <p>Maintenance: {item.maintenanceIncluded ? 'Included' : 'Extra'}</p>
              <p>Floor: {item.floorNumber ?? 'NA'}</p>
              <p>Parking: {item.parkingType ?? 'None'}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-2xl font-bold text-blue-700">{formatPrice(mode, item.priceLakh)}</p>
            <p className="text-xs text-slate-500">Listed {item.listedDaysAgo}d ago</p>
          </div>
        </div>
      </article>
    );
  };

  return (
    <section className="min-h-screen pt-28 pb-16 text-slate-900">
      <div className="page-container zdt-page-stack">
        <div className="zdt-panel rounded-2xl border border-white/20 bg-white/95 p-6 shadow-xl">
          <p className="text-sm font-medium text-blue-700">99acres-style smart search</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{heading}</h1>
          <p className="mt-2 text-slate-600">{headingDescription}</p>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Search city, locality, landmark"
              className="h-11 text-sm"
            />

            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                <SelectValue placeholder="Property Type" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">Property Type: Any</SelectItem>
                <SelectItem value="Apartment">Apartment</SelectItem>
                <SelectItem value="Villa">Villa</SelectItem>
                <SelectItem value="Independent House">Independent House</SelectItem>
                <SelectItem value="Plot">Plot</SelectItem>
                <SelectItem value="Commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-2">
              <Select value={minBudget} onValueChange={setMinBudget}>
                <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                  <SelectValue placeholder="Min Budget" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  {budgetOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={maxBudget} onValueChange={setMaxBudget}>
                <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                  <SelectValue placeholder="Max Budget" />
                </SelectTrigger>
                <SelectContent className="bg-white text-slate-900">
                  {maxBudgetOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Select value={postedBy} onValueChange={setPostedBy}>
              <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                <SelectValue placeholder="Posted By" />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="Any">Posted By: Anyone</SelectItem>
                <SelectItem value="Owner">Owner</SelectItem>
                <SelectItem value="Agent">Agent</SelectItem>
                <SelectItem value="Builder">Builder</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {mode === 'buy' && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-base font-semibold text-slate-900">Location Filters</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <LgdLocationInput
                  value={buyCity}
                  onChange={setBuyCity}
                  placeholder="City"
                  className="h-11 text-sm bg-white"
                  suggestKind="india"
                  indiaValueField="village"
                />
                <LgdLocationInput
                  value={buyLocality}
                  onChange={setBuyLocality}
                  placeholder="Locality"
                  className="h-11 text-sm bg-white"
                  suggestKind="india"
                  indiaValueField="subdistrict"
                />
                <Input
                  value={buyLandmark}
                  onChange={(event) => setBuyLandmark(event.target.value)}
                  placeholder="Near Landmark"
                  className="h-11 text-sm bg-white"
                />
                <Input
                  value={buyPinCode}
                  onChange={(event) => setBuyPinCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Pin Code"
                  className="h-11 text-sm bg-white"
                />
                <Select value={buyRadiusKm} onValueChange={setBuyRadiusKm}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Radius Search" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Radius: Any</SelectItem>
                    <SelectItem value="5">5 km</SelectItem>
                    <SelectItem value="10">10 km</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <LgdLocationAccuracyNote className="mt-2" />

              <h2 className="mt-5 text-base font-semibold text-slate-900">Budget Filters</h2>
              <div className="mt-3 grid gap-4 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Price Range Slider</p>
                  <p className="mt-1 text-sm text-slate-700">
                    Rs {buyBudgetMin}L - Rs {buyBudgetMax}L
                  </p>
                  <div className="mt-3 space-y-2">
                    <input
                      type="range"
                      min={20}
                      max={300}
                      value={buyBudgetMin}
                      onChange={(event) =>
                        setBuyBudgetMin(Math.min(Number(event.target.value), buyBudgetMax))
                      }
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={20}
                      max={300}
                      value={buyBudgetMax}
                      onChange={(event) =>
                        setBuyBudgetMax(Math.max(Number(event.target.value), buyBudgetMin))
                      }
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Price per sq.ft</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Input
                      value={buyPricePerSqFtMin}
                      onChange={(event) =>
                        setBuyPricePerSqFtMin(event.target.value.replace(/\D/g, ''))
                      }
                      placeholder="Min"
                      className="h-10 text-sm"
                    />
                    <Input
                      value={buyPricePerSqFtMax}
                      onChange={(event) =>
                        setBuyPricePerSqFtMax(event.target.value.replace(/\D/g, ''))
                      }
                      placeholder="Max"
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">EMI Calculator</p>
                  <a
                    href="https://emicalculator.net/"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                  >
                    Open EMI Calculator
                  </a>
                </div>
              </div>

              <h2 className="mt-5 text-base font-semibold text-slate-900">Property Details</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Select value={bhk} onValueChange={setBhk}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="BHK" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">BHK: Any</SelectItem>
                    <SelectItem value="1 BHK">1 BHK</SelectItem>
                    <SelectItem value="2 BHK">2 BHK</SelectItem>
                    <SelectItem value="3 BHK">3 BHK</SelectItem>
                    <SelectItem value="4+ BHK">4+ BHK</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={buyPlotSizeMin}
                  onChange={(event) => setBuyPlotSizeMin(event.target.value.replace(/\D/g, ''))}
                  placeholder="Plot Size (min sq.ft)"
                  className="h-11 text-sm bg-white"
                />
                <Input
                  value={buyCarpetAreaMin}
                  onChange={(event) =>
                    setBuyCarpetAreaMin(event.target.value.replace(/\D/g, ''))
                  }
                  placeholder="Carpet Area (min sq.ft)"
                  className="h-11 text-sm bg-white"
                />
                <Select value={buyFurnishing} onValueChange={setBuyFurnishing}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Furnishing" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Furnishing: Any</SelectItem>
                    <SelectItem value="Furnished">Furnished</SelectItem>
                    <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                    <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={buyPossession} onValueChange={setBuyPossession}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Possession" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Possession: Any</SelectItem>
                    <SelectItem value="Ready to Move">Ready to Move</SelectItem>
                    <SelectItem value="Under Construction">Under Construction</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <h2 className="mt-5 text-base font-semibold text-slate-900">Extra Filters</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Select value={buyFacing} onValueChange={setBuyFacing}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Facing Direction" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Facing: Any</SelectItem>
                    <SelectItem value="North">North</SelectItem>
                    <SelectItem value="East">East</SelectItem>
                    <SelectItem value="South">South</SelectItem>
                    <SelectItem value="West">West</SelectItem>
                    <SelectItem value="North-East">North-East</SelectItem>
                    <SelectItem value="North-West">North-West</SelectItem>
                    <SelectItem value="South-East">South-East</SelectItem>
                    <SelectItem value="South-West">South-West</SelectItem>
                  </SelectContent>
                </Select>

                <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={buyGatedCommunity}
                    onChange={(event) => setBuyGatedCommunity(event.target.checked)}
                  />
                  Gated Community
                </label>
                <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={buyCornerPlot}
                    onChange={(event) => setBuyCornerPlot(event.target.checked)}
                  />
                  Corner Plot
                </label>
                <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={buyRoadFacing}
                    onChange={(event) => setBuyRoadFacing(event.target.checked)}
                  />
                  Road Facing
                </label>
                <label className="flex h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={buyReraApproved}
                    onChange={(event) => setBuyReraApproved(event.target.checked)}
                  />
                  RERA Approved
                </label>
              </div>
            </div>
          )}

          {mode === 'rent' && (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <h2 className="text-base font-semibold text-slate-900">Financial Filters</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Monthly Rent</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Input
                      value={rentMonthlyMin}
                      onChange={(event) => setRentMonthlyMin(event.target.value.replace(/\D/g, ''))}
                      placeholder="Min Rs"
                      className="h-10 text-sm"
                    />
                    <Input
                      value={rentMonthlyMax}
                      onChange={(event) => setRentMonthlyMax(event.target.value.replace(/\D/g, ''))}
                      placeholder="Max Rs"
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Security Deposit</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Input
                      value={rentSecurityMin}
                      onChange={(event) => setRentSecurityMin(event.target.value.replace(/\D/g, ''))}
                      placeholder="Min Rs"
                      className="h-10 text-sm"
                    />
                    <Input
                      value={rentSecurityMax}
                      onChange={(event) => setRentSecurityMax(event.target.value.replace(/\D/g, ''))}
                      placeholder="Max Rs"
                      className="h-10 text-sm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Maintenance Included?</p>
                  <Select
                    value={rentMaintenanceIncluded}
                    onValueChange={(value) => setRentMaintenanceIncluded(value as YesNoFilter)}
                  >
                    <SelectTrigger className="mt-3 h-10 w-full border-slate-300 bg-white text-sm text-slate-900">
                      <SelectValue placeholder="Maintenance" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={rentBrokerage} onValueChange={setRentBrokerage}>
                    <SelectTrigger className="mt-2 h-10 w-full border-slate-300 bg-white text-sm text-slate-900">
                      <SelectValue placeholder="Brokerage" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Brokerage: Any</SelectItem>
                      <SelectItem value="Owner">Owner</SelectItem>
                      <SelectItem value="Agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <h2 className="mt-5 text-base font-semibold text-slate-900">Property Filters</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                <Select value={bhk} onValueChange={setBhk}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="BHK" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">BHK: Any</SelectItem>
                    <SelectItem value="1 BHK">1 BHK</SelectItem>
                    <SelectItem value="2 BHK">2 BHK</SelectItem>
                    <SelectItem value="3 BHK">3 BHK</SelectItem>
                    <SelectItem value="4+ BHK">4+ BHK</SelectItem>
                    <SelectItem value="Studio">Studio</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={rentAreaMin}
                  onChange={(event) => setRentAreaMin(event.target.value.replace(/\D/g, ''))}
                  placeholder="Area Min (sq.ft)"
                  className="h-11 text-sm bg-white"
                />
                <Input
                  value={rentAreaMax}
                  onChange={(event) => setRentAreaMax(event.target.value.replace(/\D/g, ''))}
                  placeholder="Area Max (sq.ft)"
                  className="h-11 text-sm bg-white"
                />
                <Select value={rentFurnishing} onValueChange={setRentFurnishing}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Furnishing" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Furnishing: Any</SelectItem>
                    <SelectItem value="Furnished">Furnished</SelectItem>
                    <SelectItem value="Semi-Furnished">Semi-Furnished</SelectItem>
                    <SelectItem value="Unfurnished">Unfurnished</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={rentParking} onValueChange={setRentParking}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Parking" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Parking: Any</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Open">Open</SelectItem>
                    <SelectItem value="Covered">Covered</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={rentFloorMin}
                    onChange={(event) => setRentFloorMin(event.target.value.replace(/\D/g, ''))}
                    placeholder="Floor >="
                    className="h-11 text-sm bg-white"
                  />
                  <Select value={rentLift} onValueChange={(value) => setRentLift(value as YesNoFilter)}>
                    <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                      <SelectValue placeholder="Lift" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Lift: Any</SelectItem>
                      <SelectItem value="Yes">Yes</SelectItem>
                      <SelectItem value="No">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <h2 className="mt-5 text-base font-semibold text-slate-900">Availability Filters</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Input
                  type="date"
                  value={rentAvailableFrom}
                  onChange={(event) => setRentAvailableFrom(event.target.value)}
                  className="h-11 text-sm bg-white"
                />
                <Select value={rentTerm} onValueChange={setRentTerm}>
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Rental Term" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Term: Any</SelectItem>
                    <SelectItem value="Short-term">Short-term</SelectItem>
                    <SelectItem value="Long-term">Long-term</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={rentBachelorAllowed}
                  onValueChange={(value) => setRentBachelorAllowed(value as YesNoFilter)}
                >
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Bachelor Allowed?" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Bachelor: Any</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={rentFamilyPreferred}
                  onValueChange={(value) => setRentFamilyPreferred(value as YesNoFilter)}
                >
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Family Preferred?" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Family: Any</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={rentPetsAllowed}
                  onValueChange={(value) => setRentPetsAllowed(value as YesNoFilter)}
                >
                  <SelectTrigger className="h-11 w-full border-slate-300 bg-white text-sm text-slate-900">
                    <SelectValue placeholder="Pets Allowed?" />
                  </SelectTrigger>
                  <SelectContent className="bg-white text-slate-900">
                    <SelectItem value="Any">Pets: Any</SelectItem>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <h2 className="mt-5 text-base font-semibold text-slate-900">Map + List View</h2>
              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'List', value: 'list' },
                      { label: 'Split', value: 'split' },
                      { label: 'Map', value: 'map' },
                    ].map((view) => (
                      <Button
                        key={view.value}
                        type="button"
                        size="sm"
                        variant={rentViewMode === view.value ? 'default' : 'outline'}
                        className={
                          rentViewMode === view.value
                            ? 'h-9 bg-blue-700 text-white hover:bg-blue-800'
                            : 'h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                        }
                        onClick={() => setRentViewMode(view.value as RentViewMode)}
                      >
                        {view.label}
                      </Button>
                    ))}
                  </div>

                  <Select value={rentCenterId} onValueChange={setRentCenterId}>
                    <SelectTrigger className="h-10 w-full border-slate-300 bg-white text-sm text-slate-900">
                      <SelectValue placeholder="Center for radius" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Radius Center: Any</SelectItem>
                      {rentCenterOptions.map((option) => (
                        <SelectItem key={option.id} value={String(option.id)}>
                          {option.locality}, {option.city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={rentRadiusKm} onValueChange={setRentRadiusKm}>
                    <SelectTrigger className="h-10 w-full border-slate-300 bg-white text-sm text-slate-900">
                      <SelectValue placeholder="Radius Search" />
                    </SelectTrigger>
                    <SelectContent className="bg-white text-slate-900">
                      <SelectItem value="Any">Radius: Any</SelectItem>
                      <SelectItem value="2">2 km</SelectItem>
                      <SelectItem value="5">5 km</SelectItem>
                      <SelectItem value="10">10 km</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Toggle map/list view, compare price markers, and use radius search around a selected center.
                </p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {['Any', '1 BHK', '2 BHK', '3 BHK', '4+ BHK', 'Studio', 'N/A'].map((value) => (
              <Button
                key={value}
                variant={bhk === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setBhk(value)}
                className={
                  bhk === value
                    ? 'h-9 bg-blue-700 text-white hover:bg-blue-800'
                    : 'h-9 border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }
              >
                {value}
              </Button>
            ))}
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="ml-auto h-10 w-[170px] border-slate-300 bg-white text-sm text-slate-900">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-white text-slate-900">
                <SelectItem value="relevance">Sort: Relevance</SelectItem>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-200">
          <p>{filteredListings.length} listings found</p>
          <p>Mode: {mode.toUpperCase()}</p>
        </div>

        {mode === 'rent' ? (
          <div className={rentViewMode === 'split' ? 'grid gap-4 xl:grid-cols-[1.05fr_1.35fr]' : 'space-y-4'}>
            {(rentViewMode === 'map' || rentViewMode === 'split') && (
              <div className="rounded-2xl border border-white/20 bg-white/95 p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Map View</h3>
                  <p className="text-xs text-slate-600">{rentMapMarkers.length} price markers</p>
                </div>
                <div className="relative mt-4 h-[410px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" style={mapGridStyle}>
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-100/50 via-blue-100/35 to-emerald-100/40" />
                  {rentMapMarkers.map((marker) => (
                    <button
                      key={marker.id}
                      type="button"
                      onClick={() => setSelectedListingId(marker.id)}
                      className={`absolute rounded-full px-2.5 py-1 text-xs font-semibold shadow transition ${
                        selectedListingId === marker.id
                          ? 'bg-blue-700 text-white ring-2 ring-blue-300'
                          : 'bg-white text-blue-700 hover:bg-blue-50'
                      }`}
                      style={{ left: `${marker.x}%`, top: `${marker.y}%`, transform: 'translate(-50%, -50%)' }}
                    >
                      Rs {Math.round(marker.monthlyRent / 1000)}k
                    </button>
                  ))}
                  <div className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[11px] font-medium text-slate-700 shadow">
                    Nearby transport stations shown below
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">Selected: {selectedRentListing?.title ?? 'None'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(selectedRentListing?.nearbyTransport ?? []).length > 0 ? (
                      (selectedRentListing?.nearbyTransport ?? []).map((station) => (
                        <Badge key={station} variant="secondary" className="bg-white text-slate-700">
                          {station}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-xs text-slate-600">No nearby transport data for this property.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {(rentViewMode === 'list' || rentViewMode === 'split') && (
              <div className={rentViewMode === 'list' ? 'grid gap-4 lg:grid-cols-2' : 'grid gap-4'}>
                {filteredListings.map((item) => renderListingCard(item))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredListings.map((item) => renderListingCard(item))}
          </div>
        )}

        {filteredListings.length === 0 && (
          <div className="rounded-2xl border border-dashed border-white/40 bg-white/90 p-10 text-center">
            <p className="text-lg font-semibold text-slate-900">No matching properties</p>
            <p className="mt-2 text-sm text-slate-600">Try widening your budget range or choosing "Any" in filters.</p>
          </div>
        )}
      </div>
    </section>
  );
}
