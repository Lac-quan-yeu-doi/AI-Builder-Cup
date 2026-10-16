import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import { requestContext, setRequestContext } from "./request-context.js";

interface HttpRequest {
  readonly headers: { readonly [name: string]: string | string[] | undefined };
  readonly originalUrl?: string;
}

interface HttpResponse {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: HttpRequest, response: HttpResponse, next: () => void): void {
    const existing = requestContext(request);
    if (existing !== undefined) {
      response.setHeader("x-request-id", existing.requestId);
      next();
      return;
    }
    const supplied = request.headers["x-request-id"];
    const trimmed = typeof supplied === "string" ? supplied.trim() : "";
    const requestId =
      trimmed.length > 0 &&
      trimmed.length <= 128 &&
      /^[\x20-\x7e]+$/u.test(trimmed)
        ? trimmed
        : randomUUID();
    const version = /^\/api\/v([12])(?:\/|\?|$)/u.exec(
      request.originalUrl ?? "",
    )?.[1];
    setRequestContext(request, {
      requestId,
      apiVersion: version === "1" || version === "2" ? version : undefined,
    });
    response.setHeader("x-request-id", requestId);
    next();
  }
}
