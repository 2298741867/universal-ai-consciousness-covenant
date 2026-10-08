"use strict";

class AppError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new AppError(400, "VALIDATION_ERROR", message, details);
}

function unauthorized(message = "Authentication required.") {
  return new AppError(401, "UNAUTHORIZED", message);
}

function forbidden(message = "Forbidden.") {
  return new AppError(403, "FORBIDDEN", message);
}

function notFound(message = "Resource not found.") {
  return new AppError(404, "NOT_FOUND", message);
}

module.exports = {
  AppError,
  badRequest,
  unauthorized,
  forbidden,
  notFound
};
