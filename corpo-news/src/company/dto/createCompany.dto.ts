import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCompanyDto {
  @IsOptional()
  @Matches(/^(\d{10}|\d{12})$/, {
    message: 'ИНН должен состоять из 10 (юрлицо) или 12 (ИП/физлицо) цифр',
  })
  inn?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankClientId?: string;
}
