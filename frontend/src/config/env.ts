export const env = {
  VITE_API_URL: (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8000',
  VITE_CARTO_API_KEY: import.meta.env.VITE_CARTO_API_KEY as string | undefined,
};
