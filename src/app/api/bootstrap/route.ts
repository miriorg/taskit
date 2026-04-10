import { PostgresBootstrapService } from "@/lib/services";

export async function POST() {
  const bootstrapService = new PostgresBootstrapService();
  const result = await bootstrapService.execute();

  return Response.json(result);
}
