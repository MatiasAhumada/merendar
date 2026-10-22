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

  const records = await familyService.findAll();
  const families = records.map((family) => ({
    id: family.id,
    name: family.name,
    neighborhood: family.neighborhood,
    address: family.address,
    contactPhone: family.contactPhone,
    contactEmail: family.contactEmail,
    referencePersonId: family.referencePersonId,
    createdAt: family.createdAt.toISOString(),
    updatedAt: family.updatedAt.toISOString(),
    members: family.members.map((member) => ({
      id: member.person.id,
      firstName: member.person.firstName,
      lastName: member.person.lastName,
      dni: member.person.dni,
      email: member.person.email,
      phone: member.person.phone,
      relationship: member.relationship,
      missingDocuments: member.missingDocuments.map((document) => ({ id: document.id, documentType: document.documentType })),
    })),
  }));

  return <FamilyRegistry
    initialFamilies={families}
    userId={session.user.id}
    sessionExpiresAt={session.expiresAt.toISOString()}
    canWrite={canWriteFamilies}
  />;
}
