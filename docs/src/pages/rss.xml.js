import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog');
  const sorted = posts
    .filter((p) => p.data.date)
    .sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

  return rss({
    title: 'Squad Docs - Blog',
    description: 'Updates, releases, and stories from the Squad team.',
    site: context.site ?? 'https://bradygaster.github.io/squad/',
    items: sorted.map((post) => ({
      title: post.data.title ?? post.id,
      pubDate: new Date(post.data.date),
      description: post.data.description ?? '',
      link: '/squad/blog/' + post.id + '/',
    })),
    customData: '<language>en-us</language>',
  });
}
