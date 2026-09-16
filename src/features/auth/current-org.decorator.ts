import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Organization } from '../../generated/prisma/client.js';
import { AuthenticatedRequest } from './authenticated-request.js';

export const CurrentOrg = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): Organization => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.organization;
  },
);
