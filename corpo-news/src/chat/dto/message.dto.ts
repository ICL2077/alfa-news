import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class MessageDto {
  @IsString()
  @MaxLength(2500)
  @ApiProperty({
    maxLength: 2500,
    example: 'Как новость повлияет на закупки стали?',
    description: 'Пустой текст и текст только из пробелов отклоняются.',
  })
  content: string;
}
