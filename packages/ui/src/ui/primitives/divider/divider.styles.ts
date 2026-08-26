export type DividerTone = 'neutral' | 'subtle' | 'strong';
export type DividerThickness = 'thin' | 'medium' | 'thick';
export type DividerLabelAlign = 'start' | 'center' | 'end';

export const dividerBaseClass = 'flex w-full items-center gap-3';

export const dividerLineClass = 'flex-1 border-0 bg-current';

export const dividerToneClasses: Record<DividerTone, string> = {
  neutral: 'text-(--ui-foreground)/20',
  subtle: 'text-(--ui-foreground)/10',
  strong: 'text-(--ui-foreground)/40',
};

export const dividerThicknessClasses: Record<DividerThickness, string> = {
  thin: 'h-px',
  medium: 'h-0.5',
  // Deliberate hairline step between h-0.5 (2px) and h-1 (4px); no spacing token exists for 3px.
  thick: 'h-[3px]',
};
