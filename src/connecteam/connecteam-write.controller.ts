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
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../database/entities';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { ConnecteamWriteService } from './connecteam-write.service';
import {
  ClockInDto,
  ClockOutDto,
  CreateConversationDto,
  CreateScheduledShiftDto,
  CreateTaskDto,
  CreateTimeActivityDto,
  CreateTimeOffDto,
  LinkConnecteamUserDto,
  PatchScheduledShiftDto,
  PatchTaskDto,
  PatchTimeActivityDto,
  PatchTimeOffStatusDto,
  SendMessageDto,
  SubmitFormDto,
} from './dto/connecteam-write.dto';

type AuthedRequest = { user: RequestUser };

@UseGuards(JwtAuthGuard)
@Controller('connecteam')
export class ConnecteamWriteController {
  constructor(private readonly write: ConnecteamWriteService) {}

  @Get('users/me')
  getMe(@Req() req: AuthedRequest) {
    return this.write.getMe(req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Patch('users/:userId/link-app-user')
  linkAppUser(@Param('userId', ParseIntPipe) userId: number, @Body() dto: LinkConnecteamUserDto) {
    return this.write.linkAppUser(userId, dto.appUserId);
  }

  @Get('time-clocks/:timeClockId/open-shift')
  getOpenShift(
    @Param('timeClockId', ParseIntPipe) timeClockId: number,
    @Query('userId', ParseIntPipe) userId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.write.getOpenShift(timeClockId, userId, req.user);
  }

  @Post('time-clocks/:timeClockId/clock-in')
  clockIn(
    @Param('timeClockId', ParseIntPipe) timeClockId: number,
    @Body() dto: ClockInDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.clockIn(timeClockId, dto, req.user);
  }

  @Post('time-clocks/:timeClockId/clock-out')
  clockOut(
    @Param('timeClockId', ParseIntPipe) timeClockId: number,
    @Body() dto: ClockOutDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.clockOut(timeClockId, dto, req.user);
  }

  @Post('time-clocks/:timeClockId/time-activities')
  createTimeActivity(
    @Param('timeClockId', ParseIntPipe) timeClockId: number,
    @Body() dto: CreateTimeActivityDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.createTimeActivity(timeClockId, dto, req.user);
  }

  @Patch('time-clocks/:timeClockId/time-activities/:shiftId')
  patchTimeActivity(
    @Param('timeClockId', ParseIntPipe) timeClockId: number,
    @Param('shiftId') shiftId: string,
    @Body() dto: PatchTimeActivityDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.patchTimeActivity(timeClockId, shiftId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Post('schedulers/:schedulerId/shifts')
  createScheduledShift(
    @Param('schedulerId', ParseIntPipe) schedulerId: number,
    @Body() dto: CreateScheduledShiftDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.createScheduledShift(schedulerId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Patch('schedulers/:schedulerId/shifts/:shiftId')
  patchScheduledShift(
    @Param('schedulerId', ParseIntPipe) schedulerId: number,
    @Param('shiftId') shiftId: string,
    @Body() dto: PatchScheduledShiftDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.patchScheduledShift(schedulerId, shiftId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Delete('schedulers/:schedulerId/shifts/:shiftId')
  deleteScheduledShift(
    @Param('schedulerId', ParseIntPipe) schedulerId: number,
    @Param('shiftId') shiftId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.write.deleteScheduledShift(schedulerId, shiftId, req.user);
  }

  @Post('time-off')
  createTimeOff(@Body() dto: CreateTimeOffDto, @Req() req: AuthedRequest) {
    return this.write.createTimeOff(dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Patch('time-off/:requestId/status')
  patchTimeOffStatus(
    @Param('requestId') requestId: string,
    @Body() dto: PatchTimeOffStatusDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.patchTimeOffStatus(requestId, dto, req.user);
  }

  @Post('forms/:formId/submissions')
  submitForm(
    @Param('formId') formId: string,
    @Body() dto: SubmitFormDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.submitForm(formId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Post('task-boards/:taskBoardId/tasks')
  createTask(
    @Param('taskBoardId', ParseIntPipe) taskBoardId: number,
    @Body() dto: CreateTaskDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.createTask(taskBoardId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Patch('task-boards/:taskBoardId/tasks/:taskId')
  patchTask(
    @Param('taskBoardId', ParseIntPipe) taskBoardId: number,
    @Param('taskId') taskId: string,
    @Body() dto: PatchTaskDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.patchTask(taskBoardId, taskId, dto, req.user);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.Admin)
  @Delete('task-boards/:taskBoardId/tasks/:taskId')
  deleteTask(
    @Param('taskBoardId', ParseIntPipe) taskBoardId: number,
    @Param('taskId') taskId: string,
    @Req() req: AuthedRequest,
  ) {
    return this.write.deleteTask(taskBoardId, taskId, req.user);
  }

  @Post('conversations')
  createConversation(@Body() dto: CreateConversationDto, @Req() req: AuthedRequest) {
    return this.write.createConversation(dto, req.user);
  }

  @Get('conversations/:conversationId/messages')
  listMessages(
    @Param('conversationId') conversationId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.write.listMessages(
      conversationId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }

  @Post('conversations/:conversationId/messages')
  sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() dto: SendMessageDto,
    @Req() req: AuthedRequest,
  ) {
    return this.write.sendMessage(conversationId, dto, req.user);
  }
}
