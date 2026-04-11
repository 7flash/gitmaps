import { describe, expect, test } from 'bun:test';
import Page from '../../../app/page';

type VNode = {
  type?: any;
  props?: Record<string, any>;
  key?: any;
};

function walk(node: any, visit: (node: VNode) => void): void {
  if (!node || typeof node === 'string' || typeof node === 'number') return;
  visit(node);
  const children = node.props?.children;
  if (!children) return;
  if (Array.isArray(children)) {
    for (const child of children) walk(child, visit);
  } else {
    walk(children, visit);
  }
}

function findById(tree: any, id: string): VNode | null {
  let found: VNode | null = null;
  walk(tree, (node) => {
    if (!found && node.props?.id === id) found = node;
  });
  return found;
}

function collectByType(tree: any, type: string): VNode[] {
  const nodes: VNode[] = [];
  walk(tree, (node) => {
    if (node.type === type) nodes.push(node);
  });
  return nodes;
}

function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  const children = node.props?.children;
  if (Array.isArray(children)) return children.map(extractText).join('');
  return extractText(children);
}

describe('landing shell smoke', () => {
  const tree = Page();

  test('renders the core landing shell ids used by the client bootstrap', () => {
    expect(findById(tree, 'canvasViewport')).toBeTruthy();
    expect(findById(tree, 'canvasContent')).toBeTruthy();
    expect(findById(tree, 'connectionsOverlay')).toBeTruthy();
    expect(findById(tree, 'landingOverlay')).toBeTruthy();
    expect(findById(tree, 'landingParticles')).toBeTruthy();
  });

  test('includes featured repo links for direct route navigation', () => {
    const anchors = collectByType(tree, 'a');
    const hrefs = anchors.map((node) => node.props?.href).filter(Boolean);

    expect(hrefs).toContain('/facebook/react');
    expect(hrefs).toContain('/denoland/deno');
    expect(hrefs).toContain('/oven-sh/bun');
  });

  test('keeps the primary landing guidance text visible', () => {
    const landing = findById(tree, 'landingOverlay');
    const text = extractText(landing);

    expect(text).toContain('GitMaps');
    expect(text).toContain('Explore popular repositories');
    expect(text).toContain('Select a repo from the sidebar, or click a card above');
    expect(text).toContain('Import any GitHub repo with the sidebar button');
  });
});
