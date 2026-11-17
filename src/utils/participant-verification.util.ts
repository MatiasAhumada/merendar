export interface ParticipantVerificationSource {
  family: { name: string };
  participants: Array<{
    familyMember: { person: { firstName: string; lastName: string } };
    paperSignatureChecked: boolean;
    physicalDniChecked: boolean;
  }>;
}

export interface ParticipantVerificationStatus {
  familyName: string;
  participantName: string;
  paperSignatureChecked: boolean;
  physicalDniChecked: boolean;
}

export function getPendingParticipantVerifications(deliveries: ParticipantVerificationSource[]) {
  return getPendingParticipantVerificationMessages(deliveries.flatMap((delivery) => delivery.participants.map((participant) => ({
    familyName: delivery.family.name,
    participantName: `${participant.familyMember.person.firstName} ${participant.familyMember.person.lastName}`,
    paperSignatureChecked: participant.paperSignatureChecked,
    physicalDniChecked: participant.physicalDniChecked,
  }))));
}

export function getPendingParticipantVerificationMessages(participants: ParticipantVerificationStatus[]) {
  return participants.flatMap((participant) => {
    const pendingChecks: string[] = [];
    if (!participant.paperSignatureChecked) {
      pendingChecks.push("firma manuscrita pendiente de cotejo");
    }
    if (!participant.physicalDniChecked) {
      pendingChecks.push("DNI físico pendiente de cotejo");
    }
    if (!pendingChecks.length) {
      return [];
    }
    return [`${participant.familyName} · ${participant.participantName}: ${pendingChecks.join(" y ")}`];
  });
}

export function hasPendingParticipantVerifications(deliveries: ParticipantVerificationSource[]) {
  return getPendingParticipantVerifications(deliveries).length > 0;
}
