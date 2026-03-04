import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectType, CreateProjectInput, UpdateProjectInput, ProjectFiltersInput } from './dto/project.dto';

@Resolver(() => ProjectType)
export class ProjectsResolver {
    constructor(private projectsService: ProjectsService) { }

    @Query(() => [ProjectType])
    @UseGuards(GqlAuthGuard)
    async projects(@Args('filters', { nullable: true }) filters?: ProjectFiltersInput) {
        return this.projectsService.findAll(filters);
    }

    @Query(() => ProjectType)
    @UseGuards(GqlAuthGuard)
    async project(@Args('id') id: string) {
        return this.projectsService.findOne(id);
    }

    @Mutation(() => ProjectType)
    @UseGuards(GqlAuthGuard)
    async createProject(
        @CurrentUser() user: any,
        @Args('input') input: CreateProjectInput,
    ) {
        return this.projectsService.create(user.userId, input);
    }

    @Mutation(() => ProjectType)
    @UseGuards(GqlAuthGuard)
    async updateProject(
        @Args('id') id: string,
        @Args('input') input: UpdateProjectInput,
    ) {
        return this.projectsService.update(id, input);
    }

    @Mutation(() => Boolean)
    @UseGuards(GqlAuthGuard)
    async deleteProject(@Args('id') id: string) {
        return this.projectsService.delete(id);
    }
}
