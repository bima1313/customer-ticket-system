import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto.js';
import { GetTicketsQueryDto } from './dto/get-tickets-query.dto.js';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { CurrentOrg } from '../auth/current-org.decorator.js';
import type { Organization } from '../../generated/prisma/client.js';

@Controller('tickets')
@UseGuards(ApiKeyGuard)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  async create(
    @CurrentOrg() org: Organization,
    @Body() createTicketDto: CreateTicketDto,
  ) {
    return this.ticketsService.create(org.id, createTicketDto);
  }

  @Get()
  async findAll(
    @CurrentOrg() org: Organization,
    @Query() query: GetTicketsQueryDto,
  ) {
    return this.ticketsService.findAll(org.id, query);
  }

  @Get(':id')
  async findOne(@CurrentOrg() org: Organization, @Param('id') id: string) {
    return this.ticketsService.findOne(org.id, id);
  }

  @Patch(':id/status')
  async updateStatus(
    @CurrentOrg() org: Organization,
    @Param('id') id: string,
    @Body() updateTicketStatusDto: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateStatus(org.id, id, updateTicketStatusDto);
  }
}
