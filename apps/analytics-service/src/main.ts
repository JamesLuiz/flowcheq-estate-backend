import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AnalyticsServiceAppModule } from './analytics-service.app.module';

async function bootstrap() {
  const logger = new Logger('AnalyticsServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AnalyticsServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.ANALYTICS_SERVICE_HOST || '0.0.0.0',
        port: process.env.ANALYTICS_SERVICE_PORT ? Number(process.env.ANALYTICS_SERVICE_PORT) : 4005,
      },
    },
  );

  await app.listen();
  logger.log('Analytics service microservice is running');
}

bootstrap();
