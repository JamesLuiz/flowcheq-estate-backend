import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { MarketplaceServiceAppModule } from './marketplace-service.app.module';

async function bootstrap() {
  const logger = new Logger('MarketplaceServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    MarketplaceServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.MARKETPLACE_SERVICE_HOST || '0.0.0.0',
        port: process.env.MARKETPLACE_SERVICE_PORT ? Number(process.env.MARKETPLACE_SERVICE_PORT) : 4007,
      },
    },
  );

  await app.listen();
  logger.log('Marketplace service microservice is running');
}

bootstrap();
