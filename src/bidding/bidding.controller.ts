import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards';
import { BiddingService } from './bidding.service';
import { CalculateBidDto, CreateBidDto, PatchBidDto } from './dto/bidding.dto';

@Controller('bids')
@UseGuards(JwtAuthGuard)
export class BiddingController {
  constructor(private readonly bidding: BiddingService) {}

  @Get()
  async list(
    @Query('status') status?: string,
    @Query('entityId') entityId?: string,
    @Query('search') search?: string,
  ) {
    return this.bidding.list({
      status,
      entityId: entityId ? parseInt(entityId, 10) : undefined,
      search,
    });
  }

  @Post()
  async create(@Body() dto: CreateBidDto) {
    return this.bidding.create(dto);
  }

  @Get(':id')
  async getOne(@Param('id', ParseIntPipe) id: number) {
    return this.bidding.getDetail(id);
  }

  @Patch(':id')
  async patch(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchBidDto) {
    return this.bidding.patch(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.bidding.remove(id);
  }

  @Post(':id/calculate')
  async calculate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CalculateBidDto,
  ) {
    return this.bidding.calculate(id, dto);
  }
}
