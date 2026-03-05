import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from '../database/entities';
import { TicketDetailDto } from '../common/dto/ticket-detail.dto';
import { mapTicketToDetail } from '../common/ticket-mapper';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
  ) {}

  async getDetail(ticketNumber: string): Promise<TicketDetailDto | null> {
    const t = await this.ticketRepo.findOne({
      where: { ticketNumber },
      relations: [
        'job',
        'hauler',
        'material',
        'externalSite',
        'truckType',
        'driver',
        'photos',
      ],
    });
    return t ? mapTicketToDetail(t) : null;
  }
}
