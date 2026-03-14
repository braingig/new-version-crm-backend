import { ObjectType, Field, InputType, registerEnumType } from '@nestjs/graphql';
import { NotificationType } from '@prisma/client';
import { IsString, IsOptional, IsEnum } from 'class-validator';

registerEnumType(NotificationType, { name: 'NotificationType' });

@InputType()
export class CreateNotificationInput {
    @Field()
    @IsString()
    title: string;

    @Field()
    @IsString()
    message: string;

    @Field(() => NotificationType, { nullable: true })
    @IsOptional()
    @IsEnum(NotificationType)
    type?: NotificationType;

    @Field({ nullable: true })
    @IsOptional()
    @IsString()
    link?: string;
}

@ObjectType()
export class NotificationDto {
    @Field()
    id: string;

    @Field()
    userId: string;

    @Field()
    title: string;

    @Field()
    message: string;

    @Field(() => NotificationType)
    type: NotificationType;

    @Field()
    isRead: boolean;

    @Field({ nullable: true })
    link?: string;

    @Field()
    createdAt: Date;
}
