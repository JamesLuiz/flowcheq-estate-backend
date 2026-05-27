import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { FinancialServiceAppModule } from './financial-service.app.module';

async function bootstrap() {
  const logger = new Logger('FinancialServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    FinancialServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.FINANCIAL_SERVICE_HOST || '0.0.0.0',
        port: process.env.FINANCIAL_SERVICE_PORT ? Number(process.env.FINANCIAL_SERVICE_PORT) : 4003,
      },
    },
  );

  await app.listen();
  logger.log('Financial service microservice is running');
}

bootstrap();
