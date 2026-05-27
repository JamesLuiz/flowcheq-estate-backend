import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthServiceAppModule } from './auth-service.app.module';

async function bootstrap() {
  const logger = new Logger('AuthServiceBootstrap');
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthServiceAppModule,
    {
      transport: Transport.TCP,
      options: {
        host: process.env.AUTH_SERVICE_HOST || '0.0.0.0',
        port: process.env.AUTH_SERVICE_PORT ? Number(process.env.AUTH_SERVICE_PORT) : 4001,
      },
    },
  );

  await app.listen();
  logger.log('Auth service microservice is running');
}

bootstrap();
