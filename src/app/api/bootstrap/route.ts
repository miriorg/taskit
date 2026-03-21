import { BootstrapService } from "@/lib/services";

export async function POST() {
  const bootstrapService = new BootstrapService();
  const result = await bootstrapService.execute();

  return Response.json(result);
}
