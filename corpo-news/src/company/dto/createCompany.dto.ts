import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCompanyDto {
  @ApiPropertyOptional({
    nullable: true,
    pattern: '^([0-9]{10}|[0-9]{12})$',
    example: '0000000000',
    description:
      'Необязательный ИНН: проверяется только формат, без проверки контрольной суммы.',
  })
  @IsOptional()
  @Matches(/^(\d{10}|\d{12})$/, {
    message: 'ИНН должен состоять из 10 (юрлицо) или 12 (ИП/физлицо) цифр',
  })
  inn?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @ApiProperty({
    minLength: 2,
    maxLength: 255,
    example: 'Демо Металл',
    description: 'Пробелы по краям удаляются.',
  })
  name: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 5000,
    example:
      'Производство металлических изделий, закупки стали, кредит на оборудование.',
  })
  description?: string;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiPropertyOptional({
    nullable: true,
    maxLength: 64,
    example: 'DEMO_METAL',
    description:
      'Точное значение SYNTHETIC_U в CSV; пустая строка считается отсутствующим ID.',
  })
  bankClientId?: string;
}
