import { NatsJetStreamService } from '@app/nats-jet-stream';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto } from './dto/createCompany.dto';
import {
  CompanyEnrichEvent,
  subjectForEnrich,
} from 'contract/company.contract';

@Injectable()
export class CompanyService {
  private logger = new Logger(CompanyService.name);

  constructor(
    private prisma: PrismaService,
    private JSService: NatsJetStreamService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        ...(dto.description && { description: dto.description }),
        ...(dto.inn && { inn: dto.inn }),
      },
    });

    const enrichEvent: CompanyEnrichEvent = {
      companyId: company.id,
      name: company.name,
      description: company.description,
      inn: company.inn,
      region: company.region,
    };

    try {
      await this.JSService.publishMessage(
        subjectForEnrich(company.id),
        enrichEvent,
        `${company.id}:enrich:${Date.now()}`,
      );
    } catch (e: any) {
      this.logger.error(
        `Enrich publish failed for ${company.id}: ${e.message}`,
      );
    }

    return company;
  }
}
