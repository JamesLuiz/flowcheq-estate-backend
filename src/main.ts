import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enhanced CORS configuration
  app.enableCors({
    origin: ['https://house-me.vercel.app', 'http://localhost:8080'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger / OpenAPI setup
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Flowcheq Estate API')
    .setDescription('API documentation for the Flowcheq Estate backend')
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
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig, {
    deepScanRoutes: true,
  });
  const docsPath = 'api/docs';
  SwaggerModule.setup(docsPath, app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port, '0.0.0.0');

  const appUrl = await app.getUrl();
  logger.log(`Application is running on: ${appUrl}`);
  logger.log(`API documentation available at: ${appUrl}/${docsPath}`);
}
bootstrap();