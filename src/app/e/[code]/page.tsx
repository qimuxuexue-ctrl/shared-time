import { EventWorkspace } from "@/components/event-workspace";

export default async function EventPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <EventWorkspace code={code.toUpperCase()} />;
}

