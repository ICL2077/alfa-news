import { IsString, MaxLength } from 'class-validator';

export class MessageDto {
  @IsString()
  @MaxLength(2500)
  content: string;
}
