import { Controller, Get, Post } from '@nestjs/common';
import { NewsParserService } from './news-parser.service';

@Controller('news')
export class NewsParserController {
  constructor(private service: NewsParserService) {}

  @Post('import')
  async importNews() {
    const saved = await this.service.fetchAndStore();
    return { saved: saved.length };
  }

  // тестовый временный роут для проверки работоспособности чата
  @Get('matchedArticles')
  async getAllMatches() {
    return this.service.getAllMatchedNews();
  }
}
