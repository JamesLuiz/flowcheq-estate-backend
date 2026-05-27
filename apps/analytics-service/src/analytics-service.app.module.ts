import { Module } from '@nestjs/common';
import { AdminModule } from '../../../src/admin/admin.module';
import { AreaRentIndexModule } from '../../../src/area-rent-index/area-rent-index.module';

@Module({
  imports: [AdminModule, AreaRentIndexModule],
})
export class AnalyticsServiceAppModule {}
