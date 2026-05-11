import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const backendDir = process.cwd();
const workspaceDir = path.resolve(backendDir, "..");
const roots = [
  backendDir,
  path.resolve(workspaceDir, "cardocs")
];

const ignoredDirectoryNames = new Set([
  ".git",
  ".gradle",
  ".swiftpm",
  ".xcworkspace",
  "DerivedData",
  "build",
  "lib",
  "node_modules"
]);
const ignoredFileNames = new Set([
  "check-no-sensitive-files.mjs"
]);

const forbiddenFileNamePatterns = [
  /firebase-adminsdk.*\.json$/i,
  /service-account.*\.json$/i,
  /AuthKey_.*\.p8$/i,
  /\.p8$/i,
  /\.p12$/i,
  /\.mobileprovision$/i
];

const forbiddenContentPatterns = [
  /-----BEGIN PRIVATE KEY-----/,
  /-----BEGIN ENCRYPTED PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /"client_email"\s*:\s*"[^"]+@[^"]+\.iam\.gserviceaccount\.com"/
];

let failed = false;

function report(name, status) {
  console.log(`${name}=${status}`);
  if (status !== "ok") failed = true;
}

function shouldSkipDirectory(directoryPath) {
  const name = path.basename(directoryPath);
  return ignoredDirectoryNames.has(name) || name.endsWith(".xcworkspace");
}

function isTextCandidate(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return [
    "",
    ".env",
    ".example",
    ".json",
    ".js",
    ".md",
    ".mjs",
    ".plist",
    ".sh",
    ".swift",
    ".ts",
    ".yaml",
    ".yml"
  ].includes(extension);
}

function inspectPath(currentPath) {
  const stat = statSync(currentPath);
  if (stat.isDirectory()) {
    if (shouldSkipDirectory(currentPath)) return;
    for (const entry of readdirSync(currentPath)) {
      inspectPath(path.join(currentPath, entry));
    }
    return;
  }

  if (!stat.isFile()) return;

  const relativePath = path.relative(workspaceDir, currentPath);
  if (ignoredFileNames.has(path.basename(currentPath))) return;
  if (forbiddenFileNamePatterns.some((pattern) => pattern.test(path.basename(currentPath)))) {
    report(`SENSITIVE_FILE_${relativePath}`, "found");
    return;
  }

  if (!isTextCandidate(currentPath) || stat.size > 2_000_000) return;

  const content = readFileSync(currentPath, "utf8");
  if (forbiddenContentPatterns.some((pattern) => pattern.test(content))) {
    report(`SENSITIVE_CONTENT_${relativePath}`, "found");
  }
}

for (const root of roots) {
  if (existsSync(root)) inspectPath(root);
}

if (!failed) report("SENSITIVE_FILES", "ok");
process.exit(failed ? 1 : 0);
