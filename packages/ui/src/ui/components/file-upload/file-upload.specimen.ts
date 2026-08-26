import { defineSpecimen } from '../../../specimens/define';
import { FileUpload } from '../index';
import type { FileUploadProps } from '../index';

export const fileUploadSpecimen = defineSpecimen<FileUploadProps>({
  title: 'FileUpload',
  description:
    'Accessible, controllable file uploader: button or drag-and-drop trigger, single/multi-select, accept and size validation.',
  component: FileUpload,
  argTypes: {
    label: { control: 'text', defaultValue: 'Attachments' },
    hint: { control: 'text', defaultValue: 'PNG, JPG or PDF up to 5 MB' },
    accept: { control: 'text', defaultValue: 'image/*,.pdf' },
    multiple: { control: 'boolean', defaultValue: false },
    dropzone: { control: 'boolean', defaultValue: false },
    tone: {
      control: 'select',
      options: ['neutral', 'red', 'green', 'amber', 'blue', 'purple', 'magenta'] as const,
      defaultValue: 'red',
    },
    variant: {
      control: 'select',
      options: ['solid', 'surface', 'outline', 'ghost'] as const,
      defaultValue: 'solid',
    },
    size: {
      control: 'select',
      options: ['xsmall', 'small', 'medium', 'large', 'xlarge'] as const,
      defaultValue: 'medium',
    },
    fullWidth: { control: 'boolean', defaultValue: false },
    required: { control: 'boolean', defaultValue: false },
    disabled: { control: 'boolean', defaultValue: false },
  },
  variants: [
    { name: 'Button (single)', props: { label: 'Avatar', accept: 'image/*' } },
    { name: 'Button (multiple)', props: { label: 'Gallery', accept: 'image/*', multiple: true } },
    { name: 'Dropzone', props: { label: 'Attachments', dropzone: true, multiple: true } },
    {
      name: 'Dropzone (PDF)',
      props: { label: 'Documents', dropzone: true, accept: '.pdf', tone: 'blue' },
    },
    { name: 'Disabled', props: { label: 'Avatar', disabled: true } },
    { name: 'Invalid', props: { label: 'Avatar', error: 'Please select a file', required: true } },
  ],
});
