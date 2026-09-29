import httpStatus from "http-status";
import { NextRequest, NextResponse } from "next/server";
import { CONFIG } from "@/constants/config.constant";

interface ApiErrorOptions {
  status?: number;
  message?: string;
  isOperational?: boolean;
  stack?: string;
  internalCode?: string;
  details?: object | null;
}

const statusMessages: Record<number, string> = httpStatus;

export class ApiError extends Error {
  public readonly stack?: string;
  public readonly status: number;
  public readonly isOperational: boolean;
  public readonly internalCode?: string;
  public readonly details?: object | null;

  constructor({
    status = httpStatus.INTERNAL_SERVER_ERROR,
    message = "",
    isOperational = true,
    stack,
    internalCode,
    details = null,
  }: ApiErrorOptions) {
    super(message);

    this.status = status;
    this.isOperational = isOperational;
    this.internalCode = internalCode;
    this.details = details;

    if (stack) this.stack = stack;
    else Error.captureStackTrace(this);
  }
}

type ResponseError = {
  message: string;
  status: number;
  instance: string;
  method: string;
  stack?: string;
  internalCode?: string;
  details?: object | null;
};

export default function apiErrorHandler({
  error,
  request,
  fallbackMessage,
}: {
  error: ApiError;
  request: NextRequest;
  fallbackMessage?: string;
}) {
  let { status, message } = error;
  if (!error.isOperational) {
    status = httpStatus.INTERNAL_SERVER_ERROR;
    message = fallbackMessage ?? statusMessages[httpStatus.INTERNAL_SERVER_ERROR];
  }
  if (!message) message = fallbackMessage ?? statusMessages[status];

  const errorResponse: ResponseError = {
    message,
    status: status,
    instance: request?.nextUrl?.pathname,
    method: request?.method,
  };

  if (error?.internalCode) errorResponse.internalCode = error.internalCode;
  if (error?.details) errorResponse.details = error.details;
  if (error?.stack && CONFIG.NODE_ENV === "development") {
    errorResponse.stack = error.stack;
  }

  console.error({ ...errorResponse });
  return NextResponse.json({ error: errorResponse }, { status });
}
