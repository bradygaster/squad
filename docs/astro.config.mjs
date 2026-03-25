import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';
import { remarkRewriteLinks } from './src/plugins/remark-rewrite-links.mjs';
import { rehypePagefindAttrs } from './src/plugins/rehype-pagefind-attrs.mjs';

export default defineConfig({
  site: 'https://bradygaster.github.io',
  base: '/squad/',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkRewriteLinks],
    rehypePlugins: [rehypePagefindAttrs],
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    },
  },
});
