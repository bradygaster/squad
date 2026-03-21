import { visit } from 'unist-util-visit';

/**
 * Rehype plugin that adds Pagefind attributes to rendered markdown HTML.
 * - Adds data-pagefind-weight="2" to h2 and h3 for search ranking boost
 * - Adds data-pagefind-ignore to pre elements to exclude code blocks
 */
export function rehypePagefindAttrs() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'h2' || node.tagName === 'h3') {
        node.properties = node.properties || {};
        node.properties.dataPagefindWeight = '2';
      }
      if (node.tagName === 'pre') {
        node.properties = node.properties || {};
        node.properties.dataPagefindIgnore = '';
      }
    });
  };
}
