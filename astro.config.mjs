import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const owner = process.env.GITHUB_REPOSITORY_OWNER ?? 'harshaxnim';
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'lerpit-wasm-blog';
const hasCustomDomainFile = fs.existsSync(new URL('./public/CNAME', import.meta.url));
const customDomain = process.env.CUSTOM_DOMAIN === 'true' || hasCustomDomainFile;
const site = process.env.SITE ?? (customDomain ? 'https://lerpit.com' : `https://${owner}.github.io`);

export default defineConfig({
  site,
  base: customDomain ? '/' : process.env.GITHUB_ACTIONS === 'true' ? `/${repo}/` : '/',
  integrations: [mdx()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    }
  }
});
