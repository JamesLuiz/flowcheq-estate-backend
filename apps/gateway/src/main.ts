import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { GatewayAppModule } from './gateway.app.module';

async function bootstrap() {
  const logger = new Logger('GatewayBootstrap');
  const app = await NestFactory.create(GatewayAppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('House Me Gateway API')
    .setDescription('Gateway documentation for House Me microservices')
    .setVersion('1.0')
    .addTag('Health', 'Service health and readiness')
    .addTag('Auth', 'Authentication and account security')
    .addTag('Users', 'Tenant profile and saved properties')
    .addTag('Landlords', 'Landlord profile, KYC, and listings')
    .addTag('Properties', 'Property listing lifecycle and enquiries')
    .addTag(
      'Houses',
      'Property listings: filters (including amenities and radius), stats, and duplicate coordinate checks',
    )
    .addTag('Field Verifiers', 'Field verification workforce and assignments')
    .addTag('Verification', 'Verification orchestration and approvals')
    .addTag('Alerts', 'Saved search alerts')
    .addTag('Messages', 'Messaging and conversation threads')
    .addTag('Viewings', 'Viewing scheduling and status updates')
    .addTag('Promotions', 'Paid promotion campaigns')
    .addTag('Reviews', 'Review and ratings')
    .addTag('Admin', 'Administrative operations')
    .addTag('Webhooks', 'Payment and provider webhooks')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });
  const docsPath = 'api/docs';
  SwaggerModule.setup(docsPath, app, document);

  const port = process.env.GATEWAY_PORT ? Number(process.env.GATEWAY_PORT) : 3000;
  await app.listen(port, '0.0.0.0');

  const appUrl = await app.getUrl();
  logger.log(`Gateway is running on: ${appUrl}`);
  logger.log(`API documentation available at: ${appUrl}/${docsPath}`);
}

bootstrap();
