// Specimen registry — the package's component-preview contract.
//
// Each component folder colocates a `<name>.specimen.ts(x)` describing its
// public prop surface (`argTypes`) and showcase `variants`. This barrel is the
// single enumeration point: ui-lab (and any future theme-builder) imports from
// `@repo/ui/specimens`, and `specimens.render.test.tsx` renders everything
// in `allSpecimens`. It is intentionally NOT re-exported from the main barrel —
// demo code must never reach app bundles.
//
// Adding a component? Create its specimen next to the component, then register
// it here (named export + `allSpecimens`). `verify-component-catalog.mjs`
// enforces both.
export { defineSpecimen } from './define';
export type { ArgDef, ArgTypes, ControlType, SpecimenConfig, Variant } from './define';

import type { SpecimenConfig } from './define';

import { accordionSpecimen } from '../ui/components/accordion/accordion.specimen';
import { actionModalSpecimen } from '../ui/components/action-modal/action-modal.specimen';
import { badgeSpecimen } from '../ui/primitives/badge/badge.specimen';
import { bannerSpecimen } from '../ui/components/banner/banner.specimen';
import { barsSpecimen } from '../ui/primitives/bars/bars.specimen';
import { boxSpecimen } from '../ui/primitives/box/box.specimen';
import { buttonSpecimen } from '../ui/primitives/button/button.specimen';
import { calloutSpecimen } from '../ui/components/callout/callout.specimen';
import { checkboxSpecimen } from '../ui/primitives/checkbox/checkbox.specimen';
import { countBadgeSpecimen } from '../ui/primitives/count-badge/count-badge.specimen';
import { dataTableSpecimen } from '../ui/integrations/data-table/data-table.specimen';
import { dialogSpecimen } from '../ui/components/dialog/dialog.specimen';
import { displaySpecimen } from '../ui/primitives/typography/display.specimen';
import { dividerSpecimen } from '../ui/primitives/divider/divider.specimen';
import { drawerSpecimen } from '../ui/components/drawer/drawer.specimen';
import { dropDownSpecimen } from '../ui/components/dropdown/dropdown.specimen';
import { fileUploadSpecimen } from '../ui/components/file-upload/file-upload.specimen';
import { gridSpecimen } from '../ui/primitives/grid/grid.specimen';
import { headingSpecimen } from '../ui/primitives/typography/heading.specimen';
import { hoverCardSpecimen } from '../ui/components/hover-card/hover-card.specimen';
import { inputSpecimen } from '../ui/primitives/input/input.specimen';
import { listSpecimen } from '../ui/primitives/list/list.specimen';
import { messageBubbleSpecimen } from '../ui/components/message-bubble/message-bubble.specimen';
import { metricInputSpecimen } from '../ui/components/metric-input/metric-input.specimen';
import { passwordStrengthMeterSpecimen } from '../ui/components/password-strength-meter/password-strength-meter.specimen';
import { progressBarSpecimen } from '../ui/primitives/progress-bar/progress-bar.specimen';
import { radioSpecimen } from '../ui/primitives/radio/radio.specimen';
import { rowSpecimen } from '../ui/primitives/flex/row.specimen';
import { scrollAreaSpecimen } from '../ui/components/scroll-area/scroll-area.specimen';
import { selectSpecimen } from '../ui/primitives/select/select.specimen';
import { sliderSpecimen } from '../ui/primitives/slider/slider.specimen';
import { stackSpecimen } from '../ui/primitives/flex/stack.specimen';
import { statusDotSpecimen } from '../ui/primitives/status-dot/status-dot.specimen';
import { switchSpecimen } from '../ui/primitives/switch/switch.specimen';
import { tableSpecimen } from '../ui/primitives/table/table.specimen';
import { tabsSpecimen } from '../ui/components/tabs/tabs.specimen';
import { textSpecimen } from '../ui/primitives/typography/text.specimen';
import { textareaSpecimen } from '../ui/primitives/textarea/textarea.specimen';
import { tooltipSpecimen } from '../ui/components/tooltip/tooltip.specimen';
import { verifiedBadgeSpecimen } from '../ui/primitives/verified-badge/verified-badge.specimen';

export {
  accordionSpecimen,
  actionModalSpecimen,
  badgeSpecimen,
  bannerSpecimen,
  barsSpecimen,
  boxSpecimen,
  buttonSpecimen,
  calloutSpecimen,
  checkboxSpecimen,
  countBadgeSpecimen,
  dataTableSpecimen,
  dialogSpecimen,
  displaySpecimen,
  dividerSpecimen,
  drawerSpecimen,
  dropDownSpecimen,
  fileUploadSpecimen,
  gridSpecimen,
  headingSpecimen,
  hoverCardSpecimen,
  inputSpecimen,
  listSpecimen,
  messageBubbleSpecimen,
  metricInputSpecimen,
  passwordStrengthMeterSpecimen,
  progressBarSpecimen,
  radioSpecimen,
  rowSpecimen,
  scrollAreaSpecimen,
  selectSpecimen,
  sliderSpecimen,
  stackSpecimen,
  statusDotSpecimen,
  switchSpecimen,
  tableSpecimen,
  tabsSpecimen,
  textSpecimen,
  textareaSpecimen,
  tooltipSpecimen,
  verifiedBadgeSpecimen,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allSpecimens: SpecimenConfig<any>[] = [
  accordionSpecimen,
  actionModalSpecimen,
  badgeSpecimen,
  bannerSpecimen,
  barsSpecimen,
  boxSpecimen,
  buttonSpecimen,
  calloutSpecimen,
  checkboxSpecimen,
  countBadgeSpecimen,
  dataTableSpecimen,
  dialogSpecimen,
  displaySpecimen,
  dividerSpecimen,
  drawerSpecimen,
  dropDownSpecimen,
  fileUploadSpecimen,
  gridSpecimen,
  headingSpecimen,
  hoverCardSpecimen,
  inputSpecimen,
  listSpecimen,
  messageBubbleSpecimen,
  metricInputSpecimen,
  passwordStrengthMeterSpecimen,
  progressBarSpecimen,
  radioSpecimen,
  rowSpecimen,
  scrollAreaSpecimen,
  selectSpecimen,
  sliderSpecimen,
  stackSpecimen,
  statusDotSpecimen,
  switchSpecimen,
  tableSpecimen,
  tabsSpecimen,
  textSpecimen,
  textareaSpecimen,
  tooltipSpecimen,
  verifiedBadgeSpecimen,
];
