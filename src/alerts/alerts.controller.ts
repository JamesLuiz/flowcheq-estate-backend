import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  createAlert(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAlertDto,
  ) {
    return this.alertsService.createAlert(user.sub, dto);
  }

  @Get()
  findMyAlerts(@CurrentUser() user: RequestUser) {
    return this.alertsService.findByUser(user.sub);
  }

  @Delete(':id')
  async deleteAlert(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.alertsService.deleteAlert(user.sub, id);
    return { success: true };
  }
}
