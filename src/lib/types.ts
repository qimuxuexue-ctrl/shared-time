export type Identity = {
  id: string;
  displayId: string;
};

export type EventParticipantSummary = {
  id: string;
  tagName: string;
  tagColor: string;
};

export type EventSummary = {
  id: string;
  shareCode: string;
  name: string;
  startDate: string;
  weeksAhead: number;
  status: "active" | "closed" | "archived";
  createdAt: string;
  memberId: string;
  tagName: string;
  tagColor: string;
  isCreator: boolean;
  participantCount: number;
  participants: EventParticipantSummary[];
};

export type EventMember = {
  id: string;
  identityId: string;
  tagName: string;
  tagColor: string;
  isCurrent: boolean;
};

export type AvailabilitySlot = {
  memberId: string;
  date: string;
  startHour: number;
};

export type EventWorkspaceData = {
  event: {
    id: string;
    shareCode: string;
    name: string;
    startDate: string;
    weeksAhead: number;
    status: "active" | "closed" | "archived";
    createdAt: string;
    isCreator: boolean;
  };
  currentMemberId: string;
  weekStart: string;
  members: EventMember[];
  availability: AvailabilitySlot[];
};
