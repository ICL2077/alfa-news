import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { ref } from '../openapi/schemas';
import { Controller, Get, Post, Query } from '@nestjs/common';
import { NewsParserService } from './news-parser.service';

@ApiTags('News')
@Controller('news')
export class NewsParserController {
  constructor(private service: NewsParserService) {}

  @ApiOperation({
    summary: 'Импортировать RSS',
    description:
      'Обращается к внешнему RSS и публикует новые статьи для обработки. При включённом LLM может расходовать токены. saved — число новых записей, не число совпадений.',
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['saved'],
      properties: { saved: { type: 'integer', minimum: 0 } },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'Сбой внешнего RSS или БД',
    schema: ref('ApiError'),
  })
  @Post('import')
  async importNews() {
    const saved = await this.service.fetchAndStore();
    return { saved: saved.length };
  }

  @ApiOperation({
    summary: 'Получить персональные совпадения',
    description:
      'Без companyId возвращаются совпадения всех компаний. Авторизация владельца в демо отсутствует. alfaView содержит найденные фрагменты банка, actions и explanation — выводы модели.',
  })
  @ApiQuery({
    name: 'companyId',
    required: false,
    type: String,
    description: 'ID созданного профиля компании',
  })
  @ApiOkResponse({ schema: { type: 'array', items: ref('ArticleMatch') } })
  @Get('matchedArticles')
  async getAllMatches(@Query('companyId') companyId?: string) {
    return this.service.getAllMatchedNews(companyId);
  }
}
