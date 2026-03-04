import { InputType, Field } from '@nestjs/graphql';
import { IsString, IsOptional, IsArray, IsNumber, IsEnum, IsEmail } from 'class-validator';
import { UserRole, SalaryType } from '@prisma/client';

@InputType()
export class UpdateUserInput {
    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    name?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsEmail()
    email?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    phone?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    department?: string;

    @Field(() => [String], { nullable: true })
    @IsOptional()
    @IsArray()
    skills?: string[];

    @Field(() => SalaryType, { nullable: true })
    @IsOptional()
    @IsEnum(SalaryType)
    salaryType?: SalaryType;

    @Field({ nullable: true })
    @IsOptional()
    @IsNumber()
    salaryAmount?: number;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    status?: string;
}

@InputType()
export class UserFiltersInput {
    @Field(() => UserRole, { nullable: true })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    status?: string;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    department?: string;
}
