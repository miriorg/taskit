import { PostgresTestDataService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

export async function POST(request: Request) {
  try {
    const testDataService = new PostgresTestDataService();
    return Response.json(await testDataService.generate(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
