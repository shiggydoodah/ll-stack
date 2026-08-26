'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar } from '@repo/ui/primitives';
import { cn } from '@repo/ui';
import { pageRoutes } from '@/lib/routes';

/**
 * Example navigation (LL-STACK Boilerplate design). Items without an `href` are
 * deliberately inert placeholders — replace them with real routes when building
 * on the stack. "Users" and "Account" are the two that exist.
 */
const NAV_ITEMS: ReadonlyArray<{ label: string; href?: string }> = [
  { label: 'Overview' },
  { label: 'Users', href: pageRoutes.members.dashboard },
  { label: 'Projects' },
  { label: 'Billing' },
  { label: 'Account', href: pageRoutes.members.account },
];

const initialsOf = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (part[0] ?? '').toUpperCase())
    .join('');

const itemClassName = (active: boolean): string =>
  cn(
    'text-2xs flex items-center gap-3 px-4 py-2.5 font-mono font-bold tracking-widest whitespace-nowrap uppercase md:border-l-2',
    active
      ? 'text-(--ui-foreground) md:border-(--ui-accent) md:bg-(--ui-background-subtle)'
      : 'text-(--ui-text-muted) md:border-transparent',
  );

interface MemberSidebarProps {
  name: string;
  email: string;
}

/**
 * The signed-in chrome, mounted once by the `(members)` layout so every member
 * route carries the same navigation.
 *
 * A client component for one reason: the active item comes from `usePathname`.
 * The layout cannot pass it down — it does not know which child route rendered.
 */
const MemberSidebar = ({ name, email }: MemberSidebarProps) => {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col border-b border-(--ui-border) md:min-h-dvh md:border-r md:border-b-0">
      <div className="flex h-13 items-center gap-3 border-b border-(--ui-border) px-4">
        <span
          aria-hidden="true"
          className="text-2xs grid size-6 place-items-center bg-(--ui-foreground) font-mono font-bold text-(--ui-background)"
        >
          L
        </span>
        <span className="font-mono text-xs font-bold tracking-widest uppercase">LL-STACK</span>
      </div>

      <nav aria-label="Example sections" className="flex overflow-x-auto py-2 md:flex-col md:py-3">
        <ul className="flex w-full md:flex-col">
          {NAV_ITEMS.map((item, index) => {
            const active = item.href !== undefined && pathname === item.href;
            const content = (
              <>
                <span aria-hidden="true" className="opacity-50">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {item.label}
              </>
            );

            return (
              <li key={item.label}>
                {item.href === undefined ? (
                  <span className={itemClassName(false)}>{content}</span>
                ) : (
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(itemClassName(active), 'hover:text-(--ui-foreground)')}
                  >
                    {content}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-center gap-2.5 border-t border-(--ui-border) px-4 py-3.5 md:mt-auto">
        <Avatar initials={initialsOf(name)} size="sm" />
        <div className="grid min-w-0 gap-0.5">
          <span className="truncate text-xs font-semibold text-(--ui-text-body)">{email}</span>
          {/* A plain anchor, never next/link: /logout is a GET route handler
              that revokes the session, and <Link> prefetches its href in a
              production build the moment it scrolls into view. */}
          <a
            href={pageRoutes.public.logout}
            className="text-2xs justify-self-start font-mono font-bold tracking-widest text-(--ui-text-muted) uppercase hover:text-(--ui-foreground)"
          >
            Sign out
          </a>
        </div>
      </div>
    </aside>
  );
};

export default MemberSidebar;
