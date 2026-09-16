import { Test, TestingModule } from '@nestjs/testing';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { Status } from '../../generated/prisma/client.js';
import type { Organization } from '../../generated/prisma/client.js';

/** Organisasi tiruan yang akan di-inject lewat decorator @CurrentOrg(). */
const organizationFixture: Organization = {
  id: 'org-1',
  name: 'Acme Corp',
  apiKey: 'test-api-key',
};

describe('TicketsController', () => {
  let controller: TicketsController;

  const ticketsServiceMock = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    updateStatus: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [{ provide: TicketsService, useValue: ticketsServiceMock }],
    })
      // Guard di-override agar test tidak butuh PrismaService / DB asli.
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TicketsController>(TicketsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('harus meneruskan org.id dan DTO ke TicketsService.create', async () => {
      const dto: CreateTicketDto = {
        customerEmail: 'customer@example.com',
        subject: 'Tidak bisa login',
        message: 'Saya lupa password.',
      };
      const created = { id: 'ticket-1' };
      ticketsServiceMock.create.mockResolvedValue(created);

      const result = await controller.create(organizationFixture, dto);

      expect(ticketsServiceMock.create).toHaveBeenCalledWith('org-1', dto);
      expect(result).toBe(created);
    });
  });

  describe('findAll', () => {
    it('harus meneruskan org.id dan query ke TicketsService.findAll', async () => {
      const query = { status: Status.open };
      ticketsServiceMock.findAll.mockResolvedValue([]);

      await controller.findAll(organizationFixture, query);

      expect(ticketsServiceMock.findAll).toHaveBeenCalledWith('org-1', query);
    });
  });

  describe('findOne', () => {
    it('harus meneruskan org.id dan id tiket ke TicketsService.findOne', async () => {
      ticketsServiceMock.findOne.mockResolvedValue({ id: 'ticket-1' });

      await controller.findOne(organizationFixture, 'ticket-1');

      expect(ticketsServiceMock.findOne).toHaveBeenCalledWith(
        'org-1',
        'ticket-1',
      );
    });
  });

  describe('updateStatus', () => {
    it('harus meneruskan org.id, id tiket, dan DTO status ke TicketsService.updateStatus', async () => {
      const dto = { status: Status.closed };
      ticketsServiceMock.updateStatus.mockResolvedValue({ id: 'ticket-1' });

      await controller.updateStatus(organizationFixture, 'ticket-1', dto);

      expect(ticketsServiceMock.updateStatus).toHaveBeenCalledWith(
        'org-1',
        'ticket-1',
        dto,
      );
    });
  });
});
