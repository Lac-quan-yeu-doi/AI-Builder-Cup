import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import { requestContext } from "../request/request-context.js";
import { v2ErrorBody } from "./api-error.js";

interface HttpResponse {
  status(status: number): { json(body: object): void };
}

interface HttpRequest {
  readonly method?: string;
  readonly originalUrl?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponse>();
    const request = http.getRequest<HttpRequest>();
    const context = requestContext(request);
    const send = (status: number, body: object): void => {
      if (status >= 400) {
        process.stderr.write(
          `${JSON.stringify({
            event: "http_exception",
            service: "celesnity-agent",
            occurredAt: new Date().toISOString(),
            requestId: context?.requestId,
            method: request.method,
            path: request.originalUrl?.split("?", 1)[0],
            status,
            error: status >= 500 ? "internal_error" : "client_error",
          })}\n`,
        );
      }
      response
        .status(status)
        .json(
          context?.apiVersion === "2"
            ? v2ErrorBody(body, context.requestId)
            : body,
        );
    };
    if (
      typeof exception === "object" &&
      exception !== null &&
      "status" in exception &&
      exception.status === 413
    ) {
      send(413, { error: "payload_too_large" });
      return;
    }
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (
        exception.getStatus() === 400 &&
        typeof body === "object" &&
        body !== null &&
        "message" in body &&
        typeof body.message === "string" &&
        /JSON/u.test(body.message)
      ) {
        send(exception.getStatus(), { error: "invalid_json" });
        return;
      }
      send(
        exception.getStatus(),
        typeof body === "string"
          ? { error: context?.apiVersion === "2" ? "internal_error" : body }
          : body,
      );
      return;
    }
    send(500, { error: "internal_error" });
  }
}
