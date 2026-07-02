import {Polar} from "@polar-sh/sdk";
import {WakeApiServerError} from "../errors.js";

/**
 * Shared Polar SDK client. `POLAR_SERVER=sandbox` selects the sandbox base;
 * anything else (default) uses production. Throws 503 when the access token
 * isn't configured so callers surface a clean "not configured" error.
 */
export function getPolarClient(): Polar {
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new WakeApiServerError(
      "SERVICE_UNAVAILABLE", 503, "Servicio de pago internacional no configurado"
    );
  }
  const server = process.env.POLAR_SERVER === "sandbox" ? "sandbox" : "production";
  return new Polar({accessToken, server});
}
