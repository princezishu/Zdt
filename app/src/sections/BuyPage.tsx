import BuyMarketplacePage from './buy/BuyMarketplacePage';

interface BuyPageProps {
  onViewDetails?: (referenceId?: string) => void;
  onOpenFavorites?: () => void;
  onOpenMessages?: (propertyReference?: string) => void;
  onOpenCompare?: () => void;
  onOpenSavedSearches?: () => void;
}

const GROUP_DEAL_ENABLED = String(import.meta.env.VITE_ENABLE_GROUP_DEALS || 'true').toLowerCase() !== 'false';

export default function BuyPage({
  onViewDetails,
  onOpenFavorites,
  onOpenMessages,
  onOpenCompare,
  onOpenSavedSearches,
}: BuyPageProps) {
  return (
    <BuyMarketplacePage
      onOpenDetails={(propertyId) => onViewDetails?.(propertyId)}
      onOpenSaved={() => onOpenFavorites?.()}
      onOpenMessages={(propertyReference) => onOpenMessages?.(propertyReference)}
      onOpenCompare={onOpenCompare}
      onOpenSavedSearches={onOpenSavedSearches}
      groupDealEnabled={GROUP_DEAL_ENABLED}
    />
  );
}
