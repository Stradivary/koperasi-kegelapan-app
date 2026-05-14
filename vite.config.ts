import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import basicSsl from '@vitejs/plugin-basic-ssl';

const config = defineConfig({
  resolve: { tsconfigPaths: true, dedupe: ['react', 'react-dom'] },
  plugins: [
    devtools(),
    basicSsl(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      remoteBindings: process.env.CF_REMOTE_BINDINGS === '1' || process.env.CF_REMOTE_BINDINGS === 'true',
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  server: {
    host: true, // This enables LAN access
  },
})

export default config
