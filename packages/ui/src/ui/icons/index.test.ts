import { describe, expect, it } from 'vitest';

import * as barrel from './index';
import { Icon as LocalIcon } from '../primitives/icon';
import { Icon as LucideIcon } from 'lucide-react';

describe('icons barrel', () => {
  it("exports the local Icon primitive, not lucide-react's Icon", () => {
    expect(barrel.Icon).toBe(LocalIcon);
    expect(barrel.Icon).not.toBe(LucideIcon);
  });

  it('does not re-export the non-tree-shakeable lucide `icons` aggregate', () => {
    expect('icons' in barrel).toBe(false);
  });

  it('re-exports every lucide icon the repo uses, plus createLucideIcon', () => {
    // The curated allow-list — the union of lucide imports across
    // packages/ui/src and apps/ui-lab/src.
    const curated = [
      'AlertTriangle',
      'Ban',
      'Bell',
      'Check',
      'CheckCheck',
      'ChevronDown',
      'ChevronLeft',
      'ChevronRight',
      'ChevronUp',
      'ChevronsUpDown',
      'CircleAlert',
      'CircleCheck',
      'Clock',
      'Copy',
      'CreditCard',
      'Eye',
      'EyeOff',
      'Flag',
      'Info',
      'LogOut',
      'Menu',
      'Moon',
      'Pencil',
      'Search',
      'Settings',
      'ShieldAlert',
      'Sparkles',
      'Star',
      'Sun',
      'Trash2',
      'TriangleAlert',
      'Upload',
      'User',
      'X',
      'ZoomIn',
      'ZoomOut',
      'createLucideIcon',
    ] as const;

    for (const name of curated) {
      // Icon components may be plain functions or forwardRef exotic objects
      // depending on the lucide build — only their presence is asserted.
      expect(barrel[name], `expected barrel to export ${name}`).toBeDefined();
    }
  });
});
