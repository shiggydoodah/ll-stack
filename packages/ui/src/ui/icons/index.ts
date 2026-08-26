// Icon barrel: the library's own icon primitives plus a curated named
// re-export of the lucide icons this repo (packages/ui + apps/ui-lab)
// actually uses.
//
// Deliberately NOT `export * from 'lucide-react'`: the star export dragged the
// entire icon universe into this barrel — including the non-tree-shakeable
// `icons` aggregate — and silently shadowed the local `Icon` primitive with
// lucide's own `Icon`. Need an icon that isn't listed here? Import it directly
// from 'lucide-react' in your app, or add it to the curated list below if it
// becomes part of this library's surface.
export { Icon } from '../primitives/icon';
export type { IconProps, IconSize } from '../primitives/icon';
export { LoadingDots } from '../primitives/loading-dots';
export type { LoadingDotsProps } from '../primitives/loading-dots';
export { Spinner } from '../primitives/spinner';
export type { SpinnerProps } from '../primitives/spinner';

export {
  AlertTriangle,
  Ban,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Flag,
  Info,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  X,
  ZoomIn,
  ZoomOut,
  createLucideIcon,
} from 'lucide-react';
export type { LucideIcon, LucideProps } from 'lucide-react';
