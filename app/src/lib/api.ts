const runtimeHost =
  typeof window !== 'undefined' && window.location?.hostname
    ? window.location.hostname
    : 'localhost';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || `http://${runtimeHost}:5000`;
