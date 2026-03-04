import { InputType, Field, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString, IsEnum, IsNumber, IsOptional, IsArray, IsDate } from 'class-validator';
import { UserRole, SalaryType } from '@prisma/client';

// Register enums for GraphQL
registerEnumType(UserRole, { name: 'UserRole' });
registerEnumType(SalaryType, { name: 'SalaryType' });

@InputType()
export class LoginInput {
    @Field()
    @IsEmail()
    email: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    password: string;
}

@InputType()
export class RegisterInput {
    @Field()
    @IsEmail()
    email: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    password: string;

    @Field()
    @IsNotEmpty()
    @IsString()
    name: string;

    @Field(() => UserRole)
    @IsEnum(UserRole)
    role: UserRole;

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

    @Field(() => SalaryType)
    @IsEnum(SalaryType)
    salaryType: SalaryType;

    @Field()
    @IsNumber()
    salaryAmount: number;

    @Field()
    @IsDate()
    joiningDate: Date;
}

@InputType()
export class RefreshTokenInput {
    @Field()
    @IsNotEmpty()
    @IsString()
    refreshToken: string;
}

@ObjectType()
export class UserType {
    @Field()
    id: string;

    @Field()
    email: string;

    @Field()
    name: string;

    @Field(() => UserRole)
    role: UserRole;

    @Field({ nullable: true })
    phone?: string;

    @Field({ nullable: true })
    department?: string;

    @Field(() => [String])
    skills: string[];

    @Field(() => SalaryType)
    salaryType: SalaryType;

    @Field()
    salaryAmount: number;

    @Field()
    joiningDate: Date;

    @Field()
    status: string;

    @Field({ nullable: true })
    lastActive?: Date;

    @Field()
    createdAt: Date;

    @Field()
    updatedAt: Date;
}

@ObjectType()
export class AuthResponse {
    @Field()
    accessToken: string;

    @Field()
    refreshToken: string;

    @Field(() => UserType)
    user: UserType;
}

@ObjectType()
export class RefreshTokenResponse {
    @Field()
    accessToken: string;

    @Field()
    refreshToken: string;
}
