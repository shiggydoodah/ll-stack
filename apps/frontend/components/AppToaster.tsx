'use client';

import { Toaster } from '@repo/ui/components';

/**
 * Client boundary for the shared toast outlet. The `@repo/ui/components`
 * barrel is not safe to import from a server component (it pulls client-only
 * modules via the fields/DropDown chain), so server layouts mount this wrapper
 * instead of `Toaster` directly.
 */
const AppToaster = () => <Toaster />;

export default AppToaster;
