import { SetMetadata } from '@nestjs/common';
import { SKIP_API_SECRET_KEY } from '../constants/security.constants';

export const SkipApiSecret = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_API_SECRET_KEY, true);
