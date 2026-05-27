import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { PropertyServiceAppModule } from './property-service.app.module';

async function bootstrap() {
  const logger = new Logger('PropertyServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PropertyServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.PROPERTY_SERVICE_HOST || '0.0.0.0',
        port: process.env.PROPERTY_SERVICE_PORT ? Number(process.env.PROPERTY_SERVICE_PORT) : 4002,
      },
    },
  );

  await app.listen();
  logger.log('Property service microservice is running');
}

bootstrap();
