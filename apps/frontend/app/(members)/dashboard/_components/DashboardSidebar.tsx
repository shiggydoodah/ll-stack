import Link from 'next/link';
import { Avatar } from '@repo/ui/primitives';
import { pageRoutes } from '@/lib/routes';

// Example-only navigation (LL-STACK Boilerplate design). The items are
// deliberately inert placeholders — only "Users" (this page) exists; replace
// them with real routes when building on the stack.
const NAV_ITEMS = [
  { label: 'Overview', active: false },
  { label: 'Users', active: true },
  { label: 'Projects', active: false },
  { label: 'Billing', active: false },
  { label: 'Settings', active: false },
];

const initialsOf = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (part[0] ?? '').toUpperCase())
    .join('');

interface DashboardSidebarProps {
  name: string;
  email: string;
}

const DashboardSidebar = ({ name, email }: DashboardSidebarProps) => (
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
        {NAV_ITEMS.map((item, index) => (
          <li key={item.label}>
            {/* Plain string join, not cn(): this is a server component and cn
                only ships via the client-only @repo/ui barrel. */}
            <span
              className={`text-2xs flex items-center gap-3 px-4 py-2.5 font-mono font-bold tracking-widest whitespace-nowrap uppercase md:border-l-2 ${
                item.active
                  ? 'text-(--ui-foreground) md:border-(--ui-accent) md:bg-(--ui-background-subtle)'
                  : 'text-(--ui-text-muted) md:border-transparent'
              }`}
            >
              <span aria-hidden="true" className="opacity-50">
                {String(index + 1).padStart(2, '0')}
              </span>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </nav>

    <div className="flex items-center gap-2.5 border-t border-(--ui-border) px-4 py-3.5 md:mt-auto">
      <Avatar initials={initialsOf(name)} size="sm" />
      <div className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-semibold text-(--ui-text-body)">{email}</span>
        <Link
          href={pageRoutes.public.logout}
          className="text-2xs justify-self-start font-mono font-bold tracking-widest text-(--ui-text-muted) uppercase hover:text-(--ui-foreground)"
        >
          Sign out
        </Link>
      </div>
    </div>
  </aside>
);

export default DashboardSidebar;
