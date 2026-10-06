export type StudioUpdateHealthStatus = "none" | "pending" | "rolled-back";

export interface StudioUpdateHealthRuntime {
  beginUpdateHealthCheck?: (
    installDir: string,
  ) => Promise<StudioUpdateHealthStatus>;
  acknowledgeUpdateHealthy?: (installDir: string) => Promise<boolean>;
}

const HEALTH_STATUSES: readonly StudioUpdateHealthStatus[] = [
  "none",
  "pending",
  "rolled-back",
];

function isHealthStatus(value: unknown): value is StudioUpdateHealthStatus {
  return (
    typeof value === "string" &&
    (HEALTH_STATUSES as readonly string[]).includes(value)
  );
}

export function resolveUpdateInstallDir(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const raw = env.BUNIUM_UPDATE_INSTALL_DIR;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function runStudioUpdateHealthCheck(
  runtime: StudioUpdateHealthRuntime,
  installDir: string | null,
): Promise<StudioUpdateHealthStatus> {
  if (installDir === null) return "none";
  if (typeof runtime.beginUpdateHealthCheck !== "function") return "none";
  try {
    const status = await runtime.beginUpdateHealthCheck(installDir);
    return isHealthStatus(status) ? status : "none";
  } catch {
    return "none";
  }
}

export async function acknowledgeStudioUpdateHealthy(
  runtime: StudioUpdateHealthRuntime,
  installDir: string | null,
  status: StudioUpdateHealthStatus,
  productHealthy: boolean,
): Promise<boolean> {
  if (installDir === null) return false;
  if (status !== "pending") return false;
  if (!productHealthy) return false;
  if (typeof runtime.acknowledgeUpdateHealthy !== "function") return false;
  try {
    return await runtime.acknowledgeUpdateHealthy(installDir);
  } catch {
    return false;
  }
}
