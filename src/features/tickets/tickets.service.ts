import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LlmService } from '../llm/llm.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';
import { Status } from '../../generated/prisma/client.js';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LlmService,
  ) {}

  async create(organizationId: string, dto: CreateTicketDto) {
    // 1. Panggil LLM untuk klasifikasi kategori & draft balasan.
    //    Dibungkus try/catch agar tiket tetap tersimpan meski LLM gagal
    //    (timeout, rate limit, format tidak valid, dsb).
    let category: string | null = null;
    let suggestedReply: string | null = null;

    try {
      const llmResult = await this.llmService.analyzeAndDraftReply(
        dto.subject,
        dto.message,
      );
      category = llmResult.category;
      suggestedReply = llmResult.suggestedReply;
    } catch (err) {
      this.logger.warn(
        `LLM gagal diproses — tiket disimpan tanpa kategori dan suggested_reply. ` +
          `Error: ${(err as Error).message}`,
      );
    }

    // 2. Simpan tiket dengan scoping organizationId
    return this.prisma.ticket.create({
      data: {
        organizationId,
        customerEmail: dto.customerEmail,
        subject: dto.subject,
        message: dto.message,
        category,
        suggestedReply,
        status: Status.open,
      },
    });
  }

  async findAll(organizationId: string, query: GetTicketsQueryDto) {
    return this.prisma.ticket.findMany({
      where: {
        organizationId, // Tenant Isolation
        ...(query.status && { status: query.status }),
        ...(query.category && { category: query.category }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        id,
        organizationId, // Tenant Isolation
      },
    });

    if (!ticket) {
      throw new NotFoundException(`Tiket dengan ID "${id}" tidak ditemukan.`);
    }

    return ticket;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateTicketStatusDto,
  ) {
    const result = await this.prisma.ticket.updateMany({
      where: {
        id,
        organizationId,
      },
      data: { status: dto.status },
    });

    if (result.count === 0) {
      throw new NotFoundException(`Tiket dengan ID "${id}" tidak ditemukan.`);
    }

    return this.findOne(organizationId, id);
  }
}
