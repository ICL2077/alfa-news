import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCompanyDto } from './dto/createCompany.dto';
import { CompanyEnrichEvent } from 'contract/company.contract';
import { OutboxService } from 'src/outbox/outbox.service';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma';

@Injectable()
export class CompanyService {
  private logger = new Logger(CompanyService.name);

  constructor(
    private prisma: PrismaService,
    private outbox: OutboxService,
  ) {}

  async createCompany(dto: CreateCompanyDto) {
    try {
      return await this.prisma.$transaction(async (trans) => {
        const company = await trans.company.create({
          data: {
            name: dto.name,
            ...(dto.description && { description: dto.description }),
            ...(dto.inn && { inn: dto.inn }),
            bankClientId: dto.bankClientId ?? null,
          },
        });

        const enrichEvent: CompanyEnrichEvent = {
          companyId: company.id,
          name: company.name,
          description: company.description,
          inn: company.inn,
          region: company.region,
          bankClientId: company.bankClientId ?? null,
        };

        await this.outbox.enqueue(trans, 'company.enrich', enrichEvent);
        return company;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Компания с таким ИНН или ID клиента банка уже существует');
      }
      throw error;
    }
  }

  async getCompany(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }
}
