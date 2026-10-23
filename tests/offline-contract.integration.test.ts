import assert from "node:assert/strict";
import test from "node:test";
import { isOfflineOperationEnabled } from "@/constants/offline-contract.constant";
import { OFFLINE_PREPARATION } from "@/constants/offline.constant";
import { normalizeStoredOfflinePreparation } from "@/services/offline-preparation.service";

test("offline write contract enables family and merchandise maintenance operations", () => {
  const resources = ["families", "remittances", "records", "renditions"] as const;

  for (const resource of resources) {
    assert.equal(isOfflineOperationEnabled(resource, "create"), true);
    assert.equal(isOfflineOperationEnabled(resource, "update"), resource === "families" || resource === "remittances");
    assert.equal(isOfflineOperationEnabled(resource, "delete"), resource === "remittances");
  }
});

test("legacy offline snapshots are migrated into the versioned account contract", () => {
  const preparedAt = "2026-10-22T12:00:00.000Z";
  const legacyPreparation = {
    userId: "account-1",
    userName: "Secretaría",
    roleLabel: "Secretaría",
    capabilities: ["families.read"],
    sessionExpiresAt: "2026-10-22T14:00:00.000Z",
    expiresAt: "2026-10-22T14:00:00.000Z",
    preparedAt,
    snapshots: { "/familias": { families: [{ id: "family-1", name: "Familia Sur" }] } },
  };

  const migration = normalizeStoredOfflinePreparation(legacyPreparation);

  assert.equal(migration.needsMigration, true);
  assert.equal(migration.preparation?.schemaVersion, OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION);
  assert.equal(migration.preparation?.snapshots["/familias"].schemaVersion, OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION);
  assert.equal(migration.preparation?.snapshots["/familias"].capturedAt, preparedAt);
  assert.deepEqual(migration.preparation?.snapshots["/familias"].data, legacyPreparation.snapshots["/familias"]);
});

test("versioned offline snapshots preserve account and capture metadata", () => {
  const versionedPreparation = {
    schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
    userId: "account-2",
    userName: "Presidencia",
    roleLabel: "Presidencia",
    capabilities: ["families.read"],
    sessionExpiresAt: "2026-10-22T14:00:00.000Z",
    expiresAt: "2026-10-22T14:00:00.000Z",
    preparedAt: "2026-10-22T12:00:00.000Z",
    snapshots: {
      "/familias": {
        schemaVersion: OFFLINE_PREPARATION.SNAPSHOT_SCHEMA_VERSION,
        capturedAt: "2026-10-22T12:00:00.000Z",
        data: { families: [] },
      },
    },
  };

  const migration = normalizeStoredOfflinePreparation(versionedPreparation);

  assert.equal(migration.needsMigration, false);
  assert.equal(migration.preparation?.userId, "account-2");
  assert.equal(migration.preparation?.snapshots["/familias"].capturedAt, versionedPreparation.preparedAt);
});
