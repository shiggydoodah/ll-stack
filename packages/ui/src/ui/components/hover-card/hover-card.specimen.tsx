import { useState } from 'react';
import { defineSpecimen } from '../../../specimens/define';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../index';
import type { HoverCardAlign, HoverCardSide } from '../index';
import { Avatar, Badge, Button, Skeleton } from '../../primitives';

type DemoContent = 'profile' | 'plain';

type HoverCardDemoProps = {
  content: DemoContent;
  side: HoverCardSide;
  align: HoverCardAlign;
  openDelay: number;
  closeDelay: number;
  disableOnMobile: boolean;
  showArrow: boolean;
};

// ── Custom profile preview (ui-lab only, composed from @ll-ui/react primitives) ───────

type Profile = {
  name: string;
  handle: string;
  initials: string;
  bio: string;
  followers: number;
};

const SAMPLE_PROFILE: Profile = {
  name: 'Ada Lovelace',
  handle: 'ada',
  initials: 'AL',
  bio: 'Mathematician & writer — wrote the first algorithm intended for a machine.',
  followers: 1842,
};

/** Simulates fetching the preview data when the card first opens. */
const fetchProfile = (): Promise<Profile> =>
  new Promise((resolve) => setTimeout(() => resolve(SAMPLE_PROFILE), 700));

const ProfileSkeleton = () => (
  <div className="flex flex-col gap-3" aria-busy="true">
    <div className="flex items-center gap-3">
      <Skeleton className="size-16 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton preset="heading" className="w-2/3" />
        <Skeleton preset="text" className="w-1/3" />
      </div>
    </div>
    <Skeleton preset="text" />
    <Skeleton preset="text" className="w-4/5" />
  </div>
);

const ProfileBody = ({ profile }: { profile: Profile }) => (
  <div className="flex flex-col gap-3">
    <div className="flex items-center gap-3">
      <Avatar initials={profile.initials} size="lg" />
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <span className="font-display text-base font-bold text-(--ui-foreground)">
            {profile.name}
          </span>
          <Badge tone="blue" variant="soft">
            Pro
          </Badge>
        </div>
        <span className="text-sm text-(--ui-text-subtle)">@{profile.handle}</span>
      </div>
    </div>
    <p className="text-sm text-(--ui-text-body)">{profile.bio}</p>
    <div className="flex items-center justify-between">
      <span className="text-sm text-(--ui-text-subtle)">
        <span className="font-bold text-(--ui-foreground)">
          {profile.followers.toLocaleString()}
        </span>{' '}
        followers
      </span>
      <Button tone="neutral" variant="outline" size="xsmall">
        Follow
      </Button>
    </div>
  </div>
);

// ── Demo wrapper driven by the lab's prop editor ─────────────────────────────────

/**
 * Flat-prop wrapper so the compound `HoverCard` can be driven by the lab's prop editor and
 * rendered (closed) by the specimen render test. The `profile` content demonstrates the
 * fetch-on-open pattern: the preview data is loaded lazily the first time the card opens
 * (gated behind `openDelay`), showing a `Skeleton` until it resolves.
 */
const HoverCardDemo = ({
  content = 'profile',
  side = 'top',
  align = 'center',
  openDelay = 200,
  closeDelay = 150,
  disableOnMobile = true,
  showArrow = false,
}: Partial<HoverCardDemoProps>) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (content !== 'profile' || !open || profile !== null || loading) return;
    setLoading(true);
    void fetchProfile().then((data) => {
      setProfile(data);
      setLoading(false);
    });
  };

  return (
    <div className="flex min-h-72 items-center justify-center p-8">
      <HoverCard
        openDelay={openDelay}
        closeDelay={closeDelay}
        disableOnMobile={disableOnMobile}
        onOpenChange={handleOpenChange}
      >
        <HoverCardTrigger asChild>
          <a
            href="#preview"
            className="rounded-(--ui-radius-sm) font-bold text-(--ui-foreground) underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-(--ui-focus-ring)"
          >
            {content === 'profile' ? `@${SAMPLE_PROFILE.handle}` : 'Hover or focus me'}
          </a>
        </HoverCardTrigger>
        <HoverCardContent
          side={side}
          align={align}
          showArrow={showArrow}
          className={content === 'profile' ? 'w-72' : undefined}
        >
          {content === 'profile' ? (
            profile ? (
              <ProfileBody profile={profile} />
            ) : (
              <ProfileSkeleton />
            )
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="font-display text-sm font-bold text-(--ui-foreground)">
                Generic preview
              </p>
              <p className="text-sm text-(--ui-text-body)">
                Any ReactNode can live in a hover card — text, media, stats or actions. This panel
                is just plain content.
              </p>
            </div>
          )}
        </HoverCardContent>
      </HoverCard>
    </div>
  );
};

export const hoverCardSpecimen = defineSpecimen<HoverCardDemoProps>({
  title: 'HoverCard',
  description:
    'Preview surface shown when a sighted user hovers or focuses a link, built on ' +
    '@radix-ui/react-hover-card. Opens on hover and keyboard focus, dismisses on leave / blur / ' +
    'Escape, never traps focus, and flips/shifts to stay in view. disableOnMobile (default true) ' +
    'suppresses the preview on touch devices so the trigger stays a normal link. The "profile" ' +
    'demo fetches its data on open and shows a Skeleton until it resolves.',
  component: HoverCardDemo,
  argTypes: {
    content: {
      control: 'select',
      options: ['profile', 'plain'] as const,
      defaultValue: 'profile',
    },
    side: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'] as const,
      defaultValue: 'top',
    },
    align: {
      control: 'select',
      options: ['start', 'center', 'end'] as const,
      defaultValue: 'center',
    },
    openDelay: { control: 'number', defaultValue: 200 },
    closeDelay: { control: 'number', defaultValue: 150 },
    disableOnMobile: { control: 'boolean', defaultValue: true },
    showArrow: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Profile preview (async)', props: { content: 'profile', side: 'top' } },
    { name: 'Plain content', props: { content: 'plain', side: 'bottom' } },
    { name: 'Right + arrow', props: { content: 'profile', side: 'right', showArrow: true } },
    { name: 'Left placement', props: { content: 'profile', side: 'left' } },
  ],
});
