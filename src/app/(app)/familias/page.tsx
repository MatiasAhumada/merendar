import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FamilyRegistry } from "@/components/families/FamilyRegistry";
import { familyService } from "@/server/services/family.service";
import { requireSession } from "@/server/services/auth-session";
import { hasEffectiveCapability } from "@/server/services/access-policy.service";

export default async function FamiliesPage() {
  const session = await requireSession();

  const canReadFamilies = await hasEffectiveCapability(session.user.role, "families.read");
  const canWriteFamilies = await hasEffectiveCapability(session.user.role, "families.write");

  if (!canReadFamilies) {
    return (
      <main className="mx-auto max-w-3xl p-4 sm:p-6">
        <Alert variant="destructive">
          <AlertTitle>Acceso no habilitado</AlertTitle>
          <AlertDescription>El padrón familiar está disponible para presidencia y secretaría.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const families = await familyService.findAll();

  return <FamilyRegistry
    initialFamilies={families}
    userId={session.user.id}
    sessionExpiresAt={session.expiresAt.toISOString()}
    canWrite={canWriteFamilies}
  />;
}
