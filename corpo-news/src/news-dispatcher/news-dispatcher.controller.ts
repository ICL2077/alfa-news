import { Controller, Get } from '@nestjs/common';
import { NewsDispatcherService } from './news-dispatcher.service';

@Controller('news')
export class NewsDispatcherController {
  constructor(private newsDispatcherService: NewsDispatcherService) {}

  @Get()
  async getAndProcessNews() {
    await this.newsDispatcherService.processNews();
    return { ok: true };
  }
}
