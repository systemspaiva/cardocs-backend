import express, { NextFunction, Request, Response } from "express";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { AppError } from "./application/errors.js";
import { FirebaseGarageRepository } from "./infrastructure/firebaseGarageRepository.js";
import { FirebaseUserRepository } from "./infrastructure/firebaseUserRepository.js";
import { createRouter } from "./interfaces/http/routes.js";

initializeApp();

const app = express();
app.disable("x-powered-by");
app.use(cors);
app.use(express.json({ limit: "1mb" }));
const firestore = getFirestore();
app.use(createRouter(new FirebaseGarageRepository(firestore), new FirebaseUserRepository(firestore)));
app.use(errorHandler);

const port = Number(process.env.PORT ?? "8080");
app.listen(port, "0.0.0.0", () => {
  console.log(`cardocs-backend listening on ${port}`);
});

function cors(request: Request, response: Response, next: NextFunction): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  response.setHeader("Access-Control-Max-Age", "3600");

  if (request.method === "OPTIONS") {
    response.status(204).send();
    return;
  }

  next();
}

function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: "validation_error",
      message: "Requisicao invalida.",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: error.code,
      message: error.message
    });
    return;
  }

  response.status(500).json({
    error: "internal_error",
    message: "Erro interno ao processar a requisicao."
  });
}
