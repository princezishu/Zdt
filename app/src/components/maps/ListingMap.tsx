import { useMemo, useState } from 'react';
import {
  GoogleMap,
  InfoWindowF,
  MarkerClustererF,
  MarkerF,
  useJsApiLoader,
} from '@react-google-maps/api';

export interface ListingMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  priceLabel?: string;
}

interface ListingMapProps {
  markers: ListingMapMarker[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  fallbackTitle?: string;
  fallbackDescription?: string;
}

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };
const CONTAINER_STYLE: React.CSSProperties = { width: '100%', height: '100%' };

export default function ListingMap({
  markers,
  selectedId,
  onSelect,
  fallbackTitle = 'Google Maps integration',
  fallbackDescription = 'Add VITE_GOOGLE_MAPS_API_KEY to enable live map markers.',
}: ListingMapProps) {
  const [infoMarkerId, setInfoMarkerId] = useState<string | null>(null);
  const apiKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

  const usableMarkers = useMemo(
    () =>
      markers.filter((item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Math.abs(item.latitude) <= 90 &&
        Math.abs(item.longitude) <= 180
      ),
    [markers]
  );

  const selectedMarker = useMemo(
    () => usableMarkers.find((item) => item.id === selectedId) || usableMarkers[0] || null,
    [selectedId, usableMarkers]
  );

  const center = selectedMarker
    ? { lat: selectedMarker.latitude, lng: selectedMarker.longitude }
    : INDIA_CENTER;

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'zdt-google-maps-script',
    googleMapsApiKey: apiKey,
  });

  if (!apiKey || loadError) {
    return (
      <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 px-6 text-center text-white/80">
        <p className="text-lg font-semibold text-white">{fallbackTitle}</p>
        <p className="max-w-md text-sm">{fallbackDescription}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center px-6 text-center text-sm text-white/80">
        Loading map...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      center={center}
      zoom={selectedMarker ? 14 : 5}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      <MarkerClustererF>
        {(clusterer) => (
          <>
            {usableMarkers.map((item) => (
              <MarkerF
                key={item.id}
                position={{ lat: item.latitude, lng: item.longitude }}
                clusterer={clusterer}
                onClick={() => {
                  setInfoMarkerId(item.id);
                  onSelect(item.id);
                }}
                icon={
                  selectedId === item.id
                    ? {
                        path: window.google.maps.SymbolPath.CIRCLE,
                        scale: 9,
                        fillColor: '#1d4ed8',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                      }
                    : undefined
                }
              />
            ))}
          </>
        )}
      </MarkerClustererF>

      {infoMarkerId
        ? (() => {
            const marker = usableMarkers.find((item) => item.id === infoMarkerId);
            if (!marker) return null;
            return (
              <InfoWindowF
                position={{ lat: marker.latitude, lng: marker.longitude }}
                onCloseClick={() => setInfoMarkerId(null)}
              >
                <div className="max-w-[220px] text-slate-900">
                  <p className="text-sm font-semibold">{marker.title}</p>
                  {marker.subtitle ? <p className="text-xs text-slate-600">{marker.subtitle}</p> : null}
                  {marker.priceLabel ? <p className="mt-1 text-xs font-semibold text-blue-800">{marker.priceLabel}</p> : null}
                </div>
              </InfoWindowF>
            );
          })()
        : null}
    </GoogleMap>
  );
}
