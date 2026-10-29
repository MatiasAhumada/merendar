

import { APPLICATION_ERROR_MESSAGES, ERROR_MESSAGES } from "@/constants/error-messages.constant";
import { AxiosError } from "axios";
import { apiErrorResponseSchema, errorMessageSchema } from "@/schemas/common.schema";
import {
  toastSuccess,
  toastError,
  toastWarning,
  toastInfo,
} from "@/utils/toast.util";

import type { ToastOptions } from "@/types/toast";


interface HandlerOptions {
  logToConsole?: boolean;
  showToast?: boolean;
  messagePrefix?: string;
  defaultMessage?: string;
  toastOptions?: ToastOptions;
}

function normalizeError(error: unknown): Error {
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new Error(APPLICATION_ERROR_MESSAGES.ERROR_DE_CONEXION);
    }

    const responseError = apiErrorResponseSchema.safeParse(error.response.data);

    if (responseError.success) {
      return new Error(responseError.data.error.message);
    }

    return new Error(error.message);
  }

  if (error instanceof Error) return error;

  const parsedError = errorMessageSchema.safeParse(error);
  if (parsedError.success) {
    return new Error(parsedError.data.message);
  }

  return new Error(ERROR_MESSAGES.UNKNOWN_ERROR);
}

export function getClientErrorMessage(error: unknown, defaultMessage: string): string {
  const normalizedError = normalizeError(error);
  return normalizedError.message || defaultMessage;
}

export function clientErrorHandler(
  error: unknown,
  callback = () => {},
  {
    logToConsole = true,
    showToast = true,
    messagePrefix = "",
    defaultMessage = "Error desconocido",
    toastOptions = {},
  }: HandlerOptions = {}
): void {
  const normalizedError = normalizeError(error);

  if (logToConsole) console.error(normalizedError);
  if (showToast) {
    const displayMessage = normalizedError.message || defaultMessage;
    toastError(`${messagePrefix}${displayMessage}`, toastOptions);
  }

  callback();
}

export function clientSuccessHandler(
  message: string,
  callback = () => {},
  {
    logToConsole = false,
    showToast = true,
    messagePrefix = "",
    toastOptions = {},
  }: Omit<HandlerOptions, "defaultMessage"> = {}
): void {
  if (logToConsole) console.info(message);
  if (showToast) {
    toastSuccess(`${messagePrefix}${message}`, toastOptions);
  }

  callback();
}

export function clientWarningHandler(
  message: string,
  callback = () => {},
  {
    logToConsole = true,
    showToast = true,
    messagePrefix = "",
    toastOptions = {},
  }: Omit<HandlerOptions, "defaultMessage"> = {}
): void {
  if (logToConsole) console.warn(message);
  if (showToast) {
    toastWarning(`${messagePrefix}${message}`, toastOptions);
  }

  callback();
}

export function clientInfoHandler(
  message: string,
  callback = () => {},
  {
    logToConsole = false,
    showToast = true,
    messagePrefix = "",
    toastOptions = {},
  }: Omit<HandlerOptions, "defaultMessage"> = {}
): void {
  if (logToConsole) console.info(message);
  if (showToast) {
    toastInfo(`${messagePrefix}${message}`, toastOptions);
  }

  callback();
}

export default clientErrorHandler;
