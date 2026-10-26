import { Controller, Get, Post, Query } from '@nestjs/common';
import { NewsParserService } from './news-parser.service';

@Controller('news')
export class NewsParserController {
  constructor(private service: NewsParserService) {}

  @Post('import')
  async importNews() {
    const saved = await this.service.fetchAndStore();
    return { saved: saved.length };
  }

  @Get('matchedArticles')
  async getAllMatches(@Query('companyId') companyId?: string) {
    return this.service.getAllMatchedNews(companyId);
  }
}
