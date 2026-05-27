import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { CommsServiceAppModule } from './comms-service.app.module';

async function bootstrap() {
  const logger = new Logger('CommsServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    CommsServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.COMMS_SERVICE_HOST || '0.0.0.0',
        port: process.env.COMMS_SERVICE_PORT ? Number(process.env.COMMS_SERVICE_PORT) : 4004,
      },
    },
  );

  await app.listen();
  logger.log('Comms service microservice is running');
}

bootstrap();
