import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { FieldVerifiersService } from './field-verifiers.service';

@Controller('field-verifiers')
@ApiTags('Field Verifiers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('field_verifier')
@ApiBearerAuth('access-token')
export class FieldVerifiersController {
  constructor(private readonly fieldVerifiersService: FieldVerifiersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Own profile + stats' })
  @ApiResponse({ status: 200, description: 'Field verifier profile returned' })
  profile(@CurrentUser() user: RequestUser) {
    return this.fieldVerifiersService.getProfile(user.sub);
  }

  @Get('assignments')
  @ApiOperation({ summary: 'Assigned verifications queue' })
  @ApiResponse({ status: 200, description: 'Assignments queue returned' })
  assignments(@CurrentUser() user: RequestUser) {
    return this.fieldVerifiersService.getAssignments(user.sub);
  }

  @Get('assignments/:id')
  @ApiOperation({ summary: 'Single assignment detail' })
  @ApiResponse({ status: 200, description: 'Assignment detail returned' })
  assignment(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.fieldVerifiersService.getAssignment(user.sub, id);
  }

  @Post('assignments/:id/check-in')
  @ApiOperation({ summary: 'GPS check-in near property' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        lat: { type: 'number', example: 6.5244 },
        lng: { type: 'number', example: 3.3792 },
      },
      required: ['lat', 'lng'],
    },
  })
  @ApiResponse({ status: 200, description: 'Check-in recorded successfully' })
  checkIn(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { lat: number; lng: number },
  ) {
    return this.fieldVerifiersService.checkIn(user.sub, id, body);
  }

  @Post('assignments/:id/submit')
  @ApiOperation({ summary: 'Submit condition report + photos' })
  @ApiResponse({ status: 200, description: 'Assignment submitted successfully' })
  submit(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() body: { photos?: string[]; verifierNotes?: string; conditionReport?: Record<string, unknown> },
  ) {
    return this.fieldVerifiersService.submit(user.sub, id, body);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Earnings history' })
  @ApiResponse({ status: 200, description: 'Earnings history returned' })
  earnings(@CurrentUser() user: RequestUser) {
    return this.fieldVerifiersService.getEarnings(user.sub);
  }

  @Patch('availability')
  @ApiOperation({ summary: 'Toggle availability' })
  @ApiResponse({ status: 200, description: 'Availability updated' })
  availability(@CurrentUser() user: RequestUser, @Body() body: { isAvailable: boolean }) {
    return { success: true, isAvailable: body.isAvailable };
  }

  @Patch('location')
  @ApiOperation({ summary: 'Update current GPS location' })
  @ApiResponse({ status: 200, description: 'Location updated' })
  location(@CurrentUser() user: RequestUser, @Body() body: { lat: number; lng: number }) {
    return { success: true, location: body };
  }
}
