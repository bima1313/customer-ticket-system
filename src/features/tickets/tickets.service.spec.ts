import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { Status } from '../../generated/prisma/client.js';
import type { Ticket } from '../../generated/prisma/client.js';


const createTicketModel = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 'ticket-1',
  organizationId: 'org-1',
  customerEmail: 'customer@example.com',
  subject: 'Tidak bisa login',
  message: 'Saya lupa password.',
  category: 'Authentication',
  suggestedReply: 'Silakan reset password Anda.',
  status: Status.open,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('TicketsService', () => {
  let service: TicketsService;

  const prismaMock = {
    ticket: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const llmServiceMock = {
    analyzeAndDraftReply: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: LlmService, useValue: llmServiceMock },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const organizationId = 'org-1';
    const dto = {
      customerEmail: 'customer@example.com',
      subject: 'Tidak bisa login',
      message: 'Saya lupa password.',
    };

    it('harus memakai hasil LLM sebagai category & suggestedReply dan status open', async () => {
      llmServiceMock.analyzeAndDraftReply.mockResolvedValue({
        category: 'technical',
        suggestedReply: 'Silakan reset password Anda.',
      });
      prismaMock.ticket.create.mockResolvedValue(
        createTicketModel({ category: 'technical' }),
      );

      const result = await service.create(organizationId, dto);

      expect(llmServiceMock.analyzeAndDraftReply).toHaveBeenCalledWith(
        dto.subject,
        dto.message,
      );
      expect(prismaMock.ticket.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          customerEmail: dto.customerEmail,
          subject: dto.subject,
          message: dto.message,
          category: 'technical',
          suggestedReply: 'Silakan reset password Anda.',
          status: Status.open,
        },
      });
      expect(result).toEqual(createTicketModel({ category: 'technical' }));
    });

    it('harus tetap menyimpan tiket dengan category=null dan suggestedReply=null ketika LLM melempar error', async () => {
      llmServiceMock.analyzeAndDraftReply.mockRejectedValue(
        new Error('Gemini API rate limit'),
      );
      prismaMock.ticket.create.mockResolvedValue(
        createTicketModel({ category: null, suggestedReply: null }),
      );

      // Tidak boleh throw — tiket harus tetap tersimpan
      const result = await service.create(organizationId, dto);

      expect(prismaMock.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: null,
          suggestedReply: null,
          status: Status.open,
        }),
      });
      expect(result).toBeDefined();
    });

    it('harus tetap menyimpan tiket ketika LLM timeout', async () => {
      llmServiceMock.analyzeAndDraftReply.mockRejectedValue(
        new Error('Request timeout'),
      );
      prismaMock.ticket.create.mockResolvedValue(
        createTicketModel({ category: null, suggestedReply: null }),
      );

      await expect(service.create(organizationId, dto)).resolves.toBeDefined();
      expect(prismaMock.ticket.create).toHaveBeenCalledOnce();
    });

    it('harus tetap menyimpan tiket ketika LLM mengembalikan format tidak valid', async () => {
      const { InternalServerErrorException } = await import('@nestjs/common');
      llmServiceMock.analyzeAndDraftReply.mockRejectedValue(
        new InternalServerErrorException('Output LLM tidak memenuhi skema DTO'),
      );
      prismaMock.ticket.create.mockResolvedValue(
        createTicketModel({ category: null, suggestedReply: null }),
      );

      await expect(service.create(organizationId, dto)).resolves.toBeDefined();
      expect(prismaMock.ticket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: null,
          suggestedReply: null,
        }),
      });
    });
  });


  describe('findAll', () => {
    it('harus memfilter berdasarkan organizationId dan default orderBy createdAt desc', async () => {
      prismaMock.ticket.findMany.mockResolvedValue([createTicketModel()]);

      await service.findAll('org-1', {});

      expect(prismaMock.ticket.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('harus menyertakan filter status & category ketika diberikan', async () => {
      prismaMock.ticket.findMany.mockResolvedValue([]);

      await service.findAll('org-1', {
        status: Status.closed,
        category: 'Billing',
      });

      expect(prismaMock.ticket.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          status: Status.closed,
          category: 'Billing',
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('harus mengembalikan tiket ketika ditemukan dalam organisasi yang sesuai', async () => {
      const ticket = createTicketModel();
      prismaMock.ticket.findFirst.mockResolvedValue(ticket);

      const result = await service.findOne('org-1', ticket.id);

      expect(prismaMock.ticket.findFirst).toHaveBeenCalledWith({
        where: { id: ticket.id, organizationId: 'org-1' },
      });
      expect(result).toEqual(ticket);
    });

    it('harus melempar NotFoundException ketika tiket tidak ditemukan', async () => {
      prismaMock.ticket.findFirst.mockResolvedValue(null);

      await expect(service.findOne('org-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('harus mengubah status dengan scoping organizationId lalu mengembalikan tiket terbaru', async () => {
      prismaMock.ticket.updateMany.mockResolvedValue({ count: 1 });
      prismaMock.ticket.findFirst.mockResolvedValue(
        createTicketModel({ status: Status.in_progress }),
      );

      const result = await service.updateStatus('org-1', 'ticket-1', {
        status: Status.in_progress,
      });

      expect(prismaMock.ticket.updateMany).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organizationId: 'org-1' },
        data: { status: Status.in_progress },
      });
      expect(prismaMock.ticket.findFirst).toHaveBeenCalledWith({
        where: { id: 'ticket-1', organizationId: 'org-1' },
      });
      expect(result.status).toBe(Status.in_progress);
    });

    it('harus melempar NotFoundException ketika tidak ada baris yang ter-update (tenant isolation)', async () => {
      prismaMock.ticket.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateStatus('org-lain', 'ticket-1', { status: Status.closed }),
      ).rejects.toThrow(NotFoundException);

      expect(prismaMock.ticket.findFirst).not.toHaveBeenCalled();
    });
  });
});
