import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { House, HouseSchema } from '../houses/schemas/house.schema';
import { LegalReviewService } from './legal-review.service';
import { LegalReviewController } from './legal-review.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: House.name, schema: HouseSchema }]),
    forwardRef(() => AuthModule),
  ],
  controllers: [LegalReviewController],
  providers: [LegalReviewService],
  exports: [LegalReviewService],
})
export class LegalReviewModule {}
