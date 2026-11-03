import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { OFFLINE_SERVICE_WORKER } from "../src/constants/offline.constant";

async function generateServiceWorkerConfiguration() {
  const destination = join(process.cwd(), "public", "sw-config.js");
  const serializedConfiguration = JSON.stringify(OFFLINE_SERVICE_WORKER);
  const serviceWorkerConfiguration = `self.MERENDAR_SERVICE_WORKER_CONFIG = ${serializedConfiguration};\n`;

  await writeFile(destination, serviceWorkerConfiguration, "utf8");
}

void generateServiceWorkerConfiguration();
