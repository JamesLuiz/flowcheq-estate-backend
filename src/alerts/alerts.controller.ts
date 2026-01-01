import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
@ApiTags('Alerts')
@ApiBearerAuth('access-token')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new property alert' })
  @ApiResponse({
    status: 201,
    description: 'Alert created successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        userId: '64a1f2e9c...',
        minPrice: 5000000,
        maxPrice: 20000000,
        location: 'Lekki, Lagos',
        type: 'Apartment',
        coordinates: { lat: 6.5244, lng: 3.3792 },
        radius: 10,
        matches: [],
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createAlert(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAlertDto,
  ) {
    return this.alertsService.createAlert(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all alerts for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of user alerts',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            userId: '64a1f2e9c...',
            minPrice: 5000000,
            maxPrice: 20000000,
            location: 'Lekki, Lagos',
            type: 'Apartment',
            coordinates: { lat: 6.5244, lng: 3.3792 },
            radius: 10,
            matches: [
              {
                houseId: '64a1f2e9c...',
                matchedAt: '2025-01-01T10:00:00.000Z',
              },
            ],
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findMyAlerts(@CurrentUser() user: RequestUser) {
    return this.alertsService.findByUser(user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an alert' })
  @ApiParam({ name: 'id', description: 'Alert ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Alert deleted successfully',
    schema: {
      example: {
        success: true,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  async deleteAlert(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    await this.alertsService.deleteAlert(user.sub, id);
    return { success: true };
  }
}
