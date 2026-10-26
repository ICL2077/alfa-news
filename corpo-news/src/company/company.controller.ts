import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { ref } from '../openapi/schemas';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/createCompany.dto';

@ApiTags('Company')
@Controller('company')
export class CompanyController {
  constructor(private service: CompanyService) {}

  @ApiOperation({
    summary: 'Создать профиль',
    description:
      'Возвращает DRAFT. Обогащение идёт через Outbox/NATS; опрашивайте GET /company/{id} до READY.',
  })
  @ApiCreatedResponse({ schema: ref('Company') })
  @ApiBadRequestResponse({
    description: 'Неверный DTO или неизвестные поля',
    schema: ref('ApiError'),
  })
  @ApiConflictResponse({
    description: 'ИНН или bankClientId уже зарегистрирован',
    schema: ref('ApiError'),
  })
  @Post()
  async postCompany(@Body() dto: CreateCompanyDto) {
    return this.service.createCompany(dto);
  }

  @ApiOperation({ summary: 'Получить профиль и статус обогащения' })
  @ApiOkResponse({ schema: ref('Company') })
  @ApiNotFoundResponse({ schema: ref('ApiError') })
  @Get(':id')
  async getCompany(@Param('id') id: string) {
    return this.service.getCompany(id);
  }
}
