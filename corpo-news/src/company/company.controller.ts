import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/createCompany.dto';

@Controller('company')
export class CompanyController {
  constructor(private service: CompanyService) {}

  @Post()
  async postCompany(@Body() dto: CreateCompanyDto) {
    return this.service.createCompany(dto);
  }

  @Get(':id')
  async getCompany(@Param('id') id: string) {
    return this.service.getCompany(id);
  }
}
