import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyGuard } from './api-key.guard.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import type { Organization } from '../../generated/prisma/client.js';

const organizationFixture: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  apiKey: 'valid-api-key',
};

const createExecutionContext = (
  request: Partial<AuthenticatedRequest>,
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  }) as unknown as ExecutionContext;

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  const prismaMock = {
    organization: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('harus melempar UnauthorizedException ketika header x-api-key tidak ada', async () => {
    const context = createExecutionContext({ headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('harus melempar UnauthorizedException ketika header x-api-key hanya berisi spasi', async () => {
    const context = createExecutionContext({ headers: { 'x-api-key': '   ' } });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prismaMock.organization.findUnique).not.toHaveBeenCalled();
  });

  it('harus melempar UnauthorizedException ketika API Key tidak ditemukan di DB', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(null);
    const context = createExecutionContext({
      headers: { 'x-api-key': 'invalid-api-key' },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
      where: { apiKey: 'invalid-api-key' },
    });
  });

  it('harus mengembalikan true dan menempelkan organization ke request ketika API Key valid', async () => {
    prismaMock.organization.findUnique.mockResolvedValue(organizationFixture);
    const request: Partial<AuthenticatedRequest> = {
      headers: { 'x-api-key': 'valid-api-key' },
    };
    const context = createExecutionContext(request);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({
      where: { apiKey: 'valid-api-key' },
    });
    expect(request.organization).toEqual(organizationFixture);
  });
});
