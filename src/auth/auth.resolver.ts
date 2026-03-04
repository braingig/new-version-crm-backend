import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginInput, RegisterInput, AuthResponse } from './dto/auth.dto';
import { RefreshTokenInput, RefreshTokenResponse } from './dto/auth.dto';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard } from './guards/gql-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@Resolver()
export class AuthResolver {
    constructor(private authService: AuthService) { }

    @Mutation(() => AuthResponse)
    async login(@Args('input') input: LoginInput): Promise<AuthResponse> {
        return this.authService.login(input.email, input.password);
    }

    @Mutation(() => AuthResponse)
    async register(@Args('input') input: RegisterInput): Promise<AuthResponse> {
        return this.authService.register(input);
    }

    @Mutation(() => RefreshTokenResponse)
    async refreshToken(
        @Args('input') input: RefreshTokenInput,
    ): Promise<RefreshTokenResponse> {
        return this.authService.refreshToken(input.refreshToken);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async logout(@CurrentUser() user: any): Promise<boolean> {
        await this.authService.logout(user.userId);
        return true;
    }
}
