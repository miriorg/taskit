import type { Revision } from "@/types";

export class ConflictDetectionService {
  assertRevision(expected?: Revision, actual?: Revision) {
    if (expected && actual && expected !== actual) {
      throw new Error("Revision conflict");
    }
  }
}
