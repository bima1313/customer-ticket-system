import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthenticatedRequest } from './authenticated-request.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const apiKey = request.headers['x-api-key'];

    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new UnauthorizedException('Header "x-api-key" wajib disertakan.');
    }

    const org = await this.prisma.organization.findUnique({
      where: { apiKey },
    });

    if (!org) {
      throw new UnauthorizedException('API Key tidak valid.');
    }

    request.organization = org;
    return true;
  }
}
