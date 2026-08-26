import type { ReactNode } from 'react';
import Link from 'next/link';
import { Eyebrow, Heading, Text } from '@repo/ui/primitives';
import ModeToggle from '@/components/ModeToggle';
import { pageRoutes } from '@/lib/routes';

interface AuthShellProps {
  /** Numbered mono kicker, e.g. `01 — Create account`. */
  kicker: string;
  title: string;
  subtitle: string;
  /** Prompt + link for switching between signup and login. */
  switchPrompt: string;
  switchHref: string;
  switchLabel: string;
  children: ReactNode;
}

/**
 * Shared frame for the signup and login pages (LL-STACK Boilerplate design):
 * brand header with mode toggle, a centred single-column form panel with a
 * kicker/title/subtitle stack, a switch row, and the slim theme footer.
 */
const AuthShell = ({
  kicker,
  title,
  subtitle,
  switchPrompt,
  switchHref,
  switchLabel,
  children,
}: AuthShellProps) => (
  <div className="grid min-h-dvh grid-rows-[auto_1fr_auto]">
    <header className="flex h-13 items-center justify-between border-b border-(--ui-border) px-5">
      <Link href={pageRoutes.home} className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="text-2xs grid size-6 place-items-center bg-(--ui-foreground) font-mono font-bold text-(--ui-background)"
        >
          L
        </span>
        <span className="font-mono text-xs font-bold tracking-widest uppercase">LL-STACK</span>
      </Link>
      <ModeToggle />
    </header>

    <main className="grid place-items-center px-5 py-12">
      <div className="animate-in fade-in slide-in-from-bottom-2 w-full max-w-sm duration-300">
        <Eyebrow size="small" className="mb-4">
          {kicker}
        </Eyebrow>
        <Heading.H1 size="large" leading="tight" className="mb-2">
          {title}
        </Heading.H1>
        <Text.P size="small" tone="subtle" className="mb-7 text-pretty">
          {subtitle}
        </Text.P>

        {children}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-(--ui-border) pt-4">
          <Text.Span size="small" tone="muted">
            {switchPrompt}
          </Text.Span>
          <Link
            href={switchHref}
            className="text-2xs font-mono font-bold tracking-widest text-(--ui-accent) uppercase hover:text-(--ui-accent-hover) hover:underline"
          >
            {switchLabel}
          </Link>
        </div>
      </div>
    </main>

    <footer className="flex h-11 items-center justify-between border-t border-(--ui-border) px-5">
      <span className="text-2xs font-mono tracking-widest text-(--ui-text-muted) uppercase">
        LL-STACK · theme default
      </span>
      <span className="text-2xs font-mono tracking-widest text-(--ui-text-muted) uppercase">
        {kicker}
      </span>
    </footer>
  </div>
);

export default AuthShell;
