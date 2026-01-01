import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { type RequestUser } from '../auth/decorators/current-user.decorator';

@Controller('reviews')
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post('agent/:agentId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a review for an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 201,
    description: 'Review created successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        agentId: '64a1f2e9c...',
        userId: '64a1f2e9c...',
        rating: 5,
        comment: 'Great agent, very professional and responsive!',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Agent not found' })
  @ApiResponse({ status: 409, description: 'Conflict - user has already reviewed this agent' })
  create(
    @Param('agentId') agentId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewsService.create(user.sub, agentId, dto);
  }

  @Get('agent/:agentId')
  @ApiOperation({ summary: 'Get all reviews for an agent' })
  @ApiParam({ name: 'agentId', description: 'Agent ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'List of reviews for the agent',
    schema: {
      example: {
        data: [
          {
            _id: '64a1f2e9c...',
            agentId: '64a1f2e9c...',
            userId: {
              _id: '64a1f2e9c...',
              name: 'John Doe',
            },
            rating: 5,
            comment: 'Great agent, very professional and responsive!',
            createdAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        averageRating: 4.5,
        totalReviews: 10,
      },
    },
  })
  findByAgent(@Param('agentId') agentId: string) {
    return this.reviewsService.findByAgent(agentId);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a review (reviewer only)' })
  @ApiParam({ name: 'id', description: 'Review ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Review updated successfully',
    schema: {
      example: {
        _id: '64a1f2e9c...',
        rating: 4,
        comment: 'Updated comment',
        updatedAt: '2025-01-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the reviewer' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: Partial<CreateReviewDto>,
  ) {
    return this.reviewsService.update(id, user.sub, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a review (reviewer only)' })
  @ApiParam({ name: 'id', description: 'Review ID', example: '64a1f2e9c...' })
  @ApiResponse({
    status: 200,
    description: 'Review deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Review deleted',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not the reviewer' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reviewsService.remove(id, user.sub);
  }
}

