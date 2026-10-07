import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { User } from '../database/entities';
import { CalendarEventDto } from './calendar.dto';
import { CalendarService } from './calendar.service';

/**
 * Personal calendar. Everyone sees their own; admins may pass `userId` to view
 * someone else's (read-only — custom events are only editable by their owner).
 */
@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  async get(
    @CurrentUser() user: User,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.calendar.getCalendar(user, { from, to, userId: parseUserId(userId) });
  }

  /** Admin person picker. */
  @Get('people')
  async people(@CurrentUser() user: User) {
    return this.calendar.listPeople(user);
  }

  /** Bids the person is on (for linking a custom event to a bid). */
  @Get('bids')
  async bids(@CurrentUser() user: User, @Query('userId') userId?: string) {
    return this.calendar.listMyBids(user, parseUserId(userId));
  }

  @Post('events')
  async create(@CurrentUser() user: User, @Body() dto: CalendarEventDto) {
    return this.calendar.createEvent(user, dto);
  }

  @Patch('events/:id')
  async update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() dto: CalendarEventDto) {
    return this.calendar.updateEvent(user, id, dto);
  }

  @Delete('events/:id')
  async remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number) {
    return this.calendar.deleteEvent(user, id);
  }
}

function parseUserId(raw?: string): number | undefined {
  const n = parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) ? n : undefined;
}
