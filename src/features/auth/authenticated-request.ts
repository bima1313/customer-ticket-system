import { Request } from 'express';
import { Organization } from '../../generated/prisma/client.js';

export interface AuthenticatedRequest extends Request {
  organization: Organization;
}
