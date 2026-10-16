import { ApiError } from "@presentation/http/common/errors/api-error.js";
import { requestContext } from "@presentation/http/common/request/request-context.js";

export function requireV2Pagination(
  request: object,
  query: Record<string, unknown>,
): void {
  if (
    requestContext(request)?.apiVersion === "2" &&
    Object.keys(query).some((key) => key !== "cursor" && key !== "limit")
  )
    throw new ApiError(400, { error: "invalid_pagination" });
}
