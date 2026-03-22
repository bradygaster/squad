import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/docs' }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    order: z.number().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
    status: z.string().optional(),
  }),
});

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    date: z.coerce.string().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
    status: z.string().optional(),
  }),
});

export const collections = { docs, blog };
