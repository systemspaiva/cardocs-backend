import { NextFunction, Request, Response, Router } from "express";
import { getAuth, type DecodedIdToken, type UserRecord } from "firebase-admin/auth";
import {
  assertRealVehicleData,
  assertValidBrazilianPlate,
  generateResaleDossier,
  toVehicleProfile
} from "../../domain/factories.js";
import { ResaleDossier } from "../../domain/models.js";
import { FirebaseGarageRepository } from "../../infrastructure/firebaseGarageRepository.js";
import { FirebaseUserRepository } from "../../infrastructure/firebaseUserRepository.js";
import { ProviderNotConfiguredError, UnauthorizedError } from "../../application/errors.js";
import {
  invoiceDocumentInputSchema,
  plateLookupSchema,
  resaleDossierRequestSchema,
  saveInvoiceSchema,
  vehicleImageLookupSchema,
  vehicleRegistrationSchema
} from "./schemas.js";

interface AuthenticatedRequest extends Request {
  ownerId?: string;
  authToken?: DecodedIdToken;
}

export function createRouter(
  repository: FirebaseGarageRepository,
  userRepository: FirebaseUserRepository
): Router {
  const router = Router();

  router.get("/v1/health", (_request, response) => {
    response.json({ status: "UP", runtime: "node" });
  });

  router.get("/v1/public/reports/:slug", asyncHandler(async (request, response) => {
    response.json(await repository.findPublicDossier(String(request.params.slug)));
  }));

  router.get("/r/:slug", asyncHandler(async (request, response) => {
    const dossier = await repository.findPublicDossier(String(request.params.slug));
    response.type("html").send(renderPublicDossierPage(dossier));
  }));

  router.use("/v1", asyncHandler(authenticateFirebaseToken));

  router.post("/v1/me", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const authToken = requireAuthToken(request);
    const userRecord = await getAuth().getUser(authToken.uid);
    response.json(await userRepository.upsertFromAuth(toUserProfile(authToken, userRecord)));
  }));

  router.get("/v1/dashboard", asyncHandler(async (request: AuthenticatedRequest, response) => {
    response.json(await repository.loadDashboard(requireOwnerId(request)));
  }));

  router.post("/v1/vehicles/plate-lookup", asyncHandler(async (request, _response) => {
    const body = plateLookupSchema.parse(request.body);
    assertValidBrazilianPlate(body.plate);
    throw new ProviderNotConfiguredError("Provider real de consulta por placa ainda nao esta configurado.");
  }));

  router.post("/v1/vehicles/image", asyncHandler(async (request, response) => {
    const body = vehicleImageLookupSchema.parse(request.body);
    assertRealVehicleData(body);
    response.status(404).send();
  }));

  router.post("/v1/vehicles", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = vehicleRegistrationSchema.parse(request.body);
    const vehicle = toVehicleProfile(requireOwnerId(request), body.candidate, body.initialMileage);
    response.status(201).json(await repository.saveVehicle(requireOwnerId(request), vehicle));
  }));

  router.post("/v1/invoices/analyze", asyncHandler(async (request, _response) => {
    invoiceDocumentInputSchema.parse(request.body);
    throw new ProviderNotConfiguredError("Provider real de OCR/IA ainda nao esta configurado.");
  }));

  router.post("/v1/invoices", asyncHandler(async (request: AuthenticatedRequest, _response) => {
    saveInvoiceSchema.parse(request.body);
    throw new ProviderNotConfiguredError("Provider real de OCR/IA ainda nao esta configurado para salvar documentos.");
  }));

  router.post("/v1/resale-dossiers", asyncHandler(async (request: AuthenticatedRequest, response) => {
    const body = resaleDossierRequestSchema.parse(request.body);
    const garage = await repository.findGarage(requireOwnerId(request), body.vehicleID);
    const dossier = generateResaleDossier(garage.vehicle, garage);
    response.json(await repository.upsertResaleDossier(requireOwnerId(request), body.vehicleID, dossier));
  }));

  return router;
}

async function authenticateFirebaseToken(request: AuthenticatedRequest, _response: Response, next: NextFunction): Promise<void> {
  const authorization = request.header("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new UnauthorizedError();
  }

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await getAuth().verifyIdToken(match[1]);
  } catch {
    throw new UnauthorizedError("Firebase ID token invalido ou expirado.");
  }

  request.ownerId = decodedToken.uid;
  request.authToken = decodedToken;
  next();
}

function requireOwnerId(request: AuthenticatedRequest): string {
  if (!request.ownerId) {
    throw new UnauthorizedError();
  }
  return request.ownerId;
}

function requireAuthToken(request: AuthenticatedRequest): DecodedIdToken {
  if (!request.authToken) {
    throw new UnauthorizedError();
  }
  return request.authToken;
}

function toUserProfile(decodedToken: DecodedIdToken, userRecord: UserRecord) {
  const identities = decodedToken.firebase.identities ?? {};
  return {
    id: decodedToken.uid,
    email: userRecord.email ?? decodedToken.email ?? null,
    displayName: userRecord.displayName ?? decodedToken.name ?? null,
    photoURL: userRecord.photoURL ?? decodedToken.picture ?? null,
    emailVerified: userRecord.emailVerified === true || decodedToken.email_verified === true,
    signInProvider: decodedToken.firebase.sign_in_provider ?? null,
    providerIds: [
      ...new Set([
        ...userRecord.providerData.map((provider) => provider.providerId),
        ...Object.keys(identities)
      ])
    ].sort()
  };
}

function renderPublicDossierPage(dossier: ResaleDossier): string {
  const highlights = dossier.highlights
    .map((highlight) => `<li><strong>${escapeHtml(highlight.title)}</strong><span>${escapeHtml(highlight.value)}</span></li>`)
    .join("");
  const checks = dossier.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join("");
  const sections = dossier.reportSections
    .map((section) => `
      <article>
        <header>
          <strong>${escapeHtml(section.title)}</strong>
          <span>${escapeHtml(section.status)}</span>
        </header>
        <p>${escapeHtml(section.detail)}</p>
      </article>`)
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(dossier.title)} | CarDocs</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172026; background: #f5f7f8; }
    body { margin: 0; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0; }
    h1 { margin: 0 0 12px; font-size: clamp(2rem, 6vw, 4rem); line-height: 1; letter-spacing: 0; }
    p { color: #40515c; line-height: 1.55; }
    .score { display: inline-flex; gap: 10px; align-items: baseline; margin: 24px 0; padding: 14px 18px; border: 1px solid #d5dde2; background: white; border-radius: 8px; }
    .score strong { font-size: 2rem; }
    ul { padding: 0; list-style: none; display: grid; gap: 10px; }
    li, article { border: 1px solid #d5dde2; background: white; border-radius: 8px; padding: 14px 16px; }
    li { display: flex; justify-content: space-between; gap: 16px; }
    article header { display: flex; justify-content: space-between; gap: 16px; color: #172026; }
    section { margin-top: 28px; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(dossier.title)}</h1>
    <p>${escapeHtml(dossier.summary)}</p>
    <div class="score"><strong>${escapeHtml(String(dossier.score))}</strong><span>score CarDocs</span></div>
    <section><h2>Destaques</h2><ul>${highlights}</ul></section>
    <section><h2>Checklist</h2><ul>${checks}</ul></section>
    <section><h2>Relatorio</h2>${sections}</section>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function asyncHandler<T extends Request = Request>(
  handler: (request: T, response: Response, next: NextFunction) => Promise<void> | void
) {
  return (request: Request, response: Response, next: NextFunction): void => {
    Promise.resolve(handler(request as T, response, next)).catch(next);
  };
}
