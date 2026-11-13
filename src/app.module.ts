import {
  type MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';

import { configuration } from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';

import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { LocaleMiddleware } from './common/middleware/locale.middleware';
import { DeviceIdMiddleware } from './common/middleware/device-id.middleware';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

import { PlatformModule } from './modules/platform/platform.module';

/**
 * AppModule — the modular monolith root (architecture §3). Global modules
 * (Prisma, Redis, Queues) are @Global so every feature module gets them without
 * explicit imports. Cross-cutting pipes/filters/interceptors/guards are wired via
 * APP_* tokens; the request lifecycle is: request-id → rate-limit → validation →
 * controller → service → envelope.
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: configuration.LOG_LEVEL,
        // Don't auto-log every request (app logs are structured via pino instead).
        autoLogging: false,
        // Keep redaction minimal; secrets never enter request bodies by design.
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    QueuesModule,
    PlatformModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, LocaleMiddleware, DeviceIdMiddleware).forRoutes('*');
  }
}
