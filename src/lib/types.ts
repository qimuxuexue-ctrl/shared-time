export type Identity = {
  id: string;
  displayId: string;
};

export type EventType = "one_time" | "ongoing";

export type WorkspaceKind = "share_time" | "travel_plan";

export type EventTimeZone = "Asia/Bangkok" | "Asia/Shanghai" | "Asia/Tokyo";

export type EventUpdateType =
  | "participant"
  | "note"
  | "timeline"
  | "final_time"
  | "final_time_cancelled";

export type HomeNotificationType =
  | EventUpdateType
  | "event_deleted"
  | "event_expired";

export type HomeNotification = {
  id: string;
  sourceEventId: string;
  eventShareCode: string;
  eventName: string;
  type: HomeNotificationType;
  createdAt: string;
};

export type EventParticipantSummary = {
  id: string;
  tagName: string;
  tagColor: string;
};

export type EventFinalTime = {
  date: string;
  startHour: number;
  finalizedAt: string;
};

export type EventFinalPeriod = {
  id?: string;
  date: string;
  startHour: number;
  endHour: number;
};

export type EventSummary = {
  id: string;
  shareCode: string;
  name: string;
  startDate: string;
  endDate: string | null;
  weeksAhead: number;
  workspaceKind: WorkspaceKind;
  eventType: EventType;
  timeZone: EventTimeZone;
  finalTime: EventFinalTime | null;
  status: "active" | "closed" | "archived";
  createdAt: string;
  memberId: string;
  tagName: string;
  tagColor: string;
  isCreator: boolean;
  participantCount: number;
  participants: EventParticipantSummary[];
  unreadUpdates: EventUpdateType[];
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

export type EventNote = {
  id: string;
  memberId: string;
  authorTagName: string;
  authorTagColor: string;
  content: string;
  isCurrent: boolean;
  updatedAt: string;
};

export type TravelItineraryItem = {
  id: string;
  memberId: string;
  authorTagName: string;
  authorTagColor: string;
  date: string;
  startHour: number;
  endHour: number;
  title: string;
  note: string;
  placeName: string;
  address: string;
  latitude: number;
  longitude: number;
  transportMode: string | null;
  transportDurationMinutes: number | null;
  transportNote: string | null;
  createdAt: string;
};

export type TravelStay = {
  id: string;
  name: string;
  checkInDate: string;
  checkOutDate: string;
  address: string;
  hotelUrl: string;
  note: string;
};

export type TravelJourney = {
  id: string;
  direction: "outbound" | "return";
  mode: string;
  date: string;
  departureTime: string;
  arrivalTime: string;
  origin: string;
  destination: string;
  reference: string;
  note: string;
};

export type EventWorkspaceData = {
  event: {
    id: string;
    shareCode: string;
    name: string;
    startDate: string;
    endDate: string | null;
    weeksAhead: number;
    workspaceKind: WorkspaceKind;
    eventType: EventType;
    timeZone: EventTimeZone;
    finalTime: EventFinalTime | null;
    finalPeriods: EventFinalPeriod[];
    finalNote: string | null;
    status: "active" | "closed" | "archived";
    createdAt: string;
    isCreator: boolean;
  };
  currentMemberId: string;
  weekStart: string;
  members: EventMember[];
  notes: EventNote[];
  itinerary: TravelItineraryItem[];
  stays: TravelStay[];
  journeys: TravelJourney[];
  availability: AvailabilitySlot[];
};
