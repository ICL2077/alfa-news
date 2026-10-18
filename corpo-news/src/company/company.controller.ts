import { Body, Controller, Post } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/createCompany.dto';

@Controller('company')
export class CompanyController {
  constructor(private service: CompanyService) {}

  @Post()
  async postCompany(@Body() dto: CreateCompanyDto) {
    return await this.service.createCompany(dto);
  }
}
