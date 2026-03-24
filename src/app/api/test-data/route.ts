import { TestDataService } from "@/lib/services";
import { toErrorResponse } from "@/lib/utils/api-error";

export async function POST(request: Request) {
  try {
    const testDataService = new TestDataService();
    return Response.json(await testDataService.generate(await request.json()), { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
