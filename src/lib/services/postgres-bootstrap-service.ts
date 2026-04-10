import { requireAppUser } from "@/lib/auth/app-user";
import { PostgresProjectRepository } from "@/lib/repositories/postgres-project-repository";

type AppUserResolver = typeof requireAppUser;
type PostgresProjectRepositoryLike = Pick<PostgresProjectRepository, "listByOwner" | "ensureSystemProjects">;

export class PostgresBootstrapService {
  constructor(
    private readonly appUserResolver: AppUserResolver = requireAppUser,
    private readonly projectRepository: PostgresProjectRepositoryLike = new PostgresProjectRepository(),
  ) {}

  async execute() {
    const user = await this.appUserResolver();
    const existingProjects = await this.projectRepository.listByOwner(user.id);
    const existingSystemProjectNames = new Set(
      existingProjects.filter((project) => project.system).map((project) => project.name),
    );

    const ensuredProjects = await this.projectRepository.ensureSystemProjects(user.id);
    const created = ensuredProjects
      .filter((project) => !existingSystemProjectNames.has(project.name))
      .map((project) => project.name);

    return {
      success: true,
      created,
    };
  }
}
