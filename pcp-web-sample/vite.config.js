import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    port: parseInt(process.env.VITE_DEV_PORT) || 5173,
    open: true,
    headers: {
      // Required for MSAL popup authentication
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  // Vite's default target list includes safari14, which makes esbuild apply a
  // Safari-14 destructuring bug-workaround that fails on maplibre-gl's minified
  // bundle. Targeting es2022 (supported by all modern Edge/Chrome/Firefox/Safari)
  // avoids that lowering. Dev dep pre-bundle and prod build both use it.
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: { target: 'es2022' },
});
