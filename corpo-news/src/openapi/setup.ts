import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { responseSchemas } from './schemas';

export function setupOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Corpo News API')
    .setDescription(
      'Демо: профиль компании → персональная лента → чат по новости. ' +
        'POST запускают асинхронную обработку; результат получают через GET и SSE. ' +
        'Локально API не требует входа. На стенде доступ ограничивает внешний Basic Auth proxy; ' +
        'backend не реализует учётные записи и изоляцию владельцев компаний. ' +
        'Выберите сервер /api для web proxy или / для прямого backend. ' +
        'LLM_MODE=stub возвращает демонстрационные ответы; LLM/RAG включаются отдельно.',
    )
    .setVersion('1.0.0')
    .addServer('/api', 'Web proxy')
    .addServer('/', 'Backend напрямую')
    .addBasicAuth({
      type: 'http',
      scheme: 'basic',
      description: 'Только для стенда с внешним Basic Auth proxy.',
    })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  document.components = {
    ...document.components,
    schemas: { ...document.components?.schemas, ...responseSchemas },
  };
  for (const name of ['CreateCompanyDto', 'MessageDto']) {
    const schema = document.components.schemas?.[name];
    if (schema && !('$ref' in schema)) schema.additionalProperties = false;
  }
  SwaggerModule.setup('swagger', app, document, {
    jsonDocumentUrl: 'swagger-json',
    yamlDocumentUrl: 'swagger-yaml',
    swaggerOptions: {
      persistAuthorization: false,
      defaultModelsExpandDepth: 0,
    },
    customSiteTitle: 'Corpo News API',
  });
}
