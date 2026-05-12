import express, { NextFunction, Request, Response } from "express";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { AppError } from "./application/errors.js";
import { ApiPlacasVehicleDataProvider } from "./infrastructure/apiplacasVehicleDataProvider.js";
import { CarsXeVehicleImageProvider } from "./infrastructure/carsXeVehicleImageProvider.js";
import { FirebaseAccountAuthStore } from "./infrastructure/firebaseAccountAuthStore.js";
import { FirebaseAccountDataStore } from "./infrastructure/firebaseAccountDataStore.js";
import { FirebaseGarageRepository } from "./infrastructure/firebaseGarageRepository.js";
import { FirebaseStorageDocumentAttachmentStore } from "./infrastructure/firebaseStorageDocumentAttachmentStore.js";
import { FirebaseUserRepository } from "./infrastructure/firebaseUserRepository.js";
import { GeminiInvoiceExtractionProvider } from "./infrastructure/geminiInvoiceExtractionProvider.js";
import { DeleteAccountUseCase } from "./application/accountDeletion.js";
import { createRouter } from "./interfaces/http/routes.js";

const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "cardocs-app";
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET ?? (projectId ? `${projectId}.firebasestorage.app` : undefined);
initializeApp(storageBucket ? { storageBucket } : undefined);

const app = express();
app.disable("x-powered-by");
app.use(cors);
app.use(express.json({ limit: "32mb" }));
const firestore = getFirestore();
const vehiclePlateProvider = ApiPlacasVehicleDataProvider.fromEnvironment();
const vehicleImageProvider = CarsXeVehicleImageProvider.fromEnvironment();
const invoiceExtractionProvider = GeminiInvoiceExtractionProvider.fromEnvironment();
const documentAttachmentStore = FirebaseStorageDocumentAttachmentStore.fromDefaultBucket();
app.use(createRouter(
  new FirebaseGarageRepository(firestore),
  new FirebaseUserRepository(firestore),
  new DeleteAccountUseCase(
    FirebaseAccountDataStore.fromDefaultBucket(firestore),
    new FirebaseAccountAuthStore()
  ),
  vehiclePlateProvider,
  vehicleImageProvider,
  invoiceExtractionProvider,
  invoiceExtractionProvider,
  documentAttachmentStore
));
app.use(errorHandler);

const port = Number(process.env.PORT ?? "8080");
app.listen(port, "0.0.0.0", () => {
  console.log(`cardocs-backend listening on ${port}`);
});

function cors(request: Request, response: Response, next: NextFunction): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
  response.setHeader("Access-Control-Max-Age", "3600");

  if (request.method === "OPTIONS") {
    response.status(204).send();
    return;
  }

  next();
}

function errorHandler(error: unknown, request: Request, response: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));

    console.warn("request_validation_failed", JSON.stringify({
      method: request.method,
      path: request.path,
      details
    }));

    response.status(400).json({
      error: "validation_error",
      message: "Requisicao invalida.",
      details
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
