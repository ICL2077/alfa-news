import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto } from './dto/createCompany.dto';
import { CompanyEnrichEvent } from 'contract/company.contract';
import { OutboxService } from 'src/outbox/outbox.service';

@Injectable()
export class CompanyService {
  private logger = new Logger(CompanyService.name);

  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    await this.prisma.$transaction(async (trans) => {
      const company = await trans.company.create({
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

      await this.outbox.enqueue(trans, 'company.enrich', enrichEvent);
      return company;
    });
  }
}
