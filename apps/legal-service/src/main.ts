import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { LegalServiceAppModule } from './legal-service.app.module';

async function bootstrap() {
  const logger = new Logger('LegalServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    LegalServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.LEGAL_SERVICE_HOST || '0.0.0.0',
        port: process.env.LEGAL_SERVICE_PORT ? Number(process.env.LEGAL_SERVICE_PORT) : 4006,
      },
    },
  );

  await app.listen();
  logger.log('Legal service microservice is running');
}

bootstrap();
