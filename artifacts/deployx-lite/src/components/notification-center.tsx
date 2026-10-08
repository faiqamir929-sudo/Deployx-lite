/**
 * Notification Center — requirement #8
 * In-app notifications for deployment success/failure.
 */
import { useState } from "react";
import {
  Bell,
  Check,
  CheckCheck,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  useListNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  getListNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifications = [], isLoading } = useListNotifications({
    query: { enabled: true, queryKey: getListNotificationsQueryKey() },
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = notifications.filter((n) => !n.read).length;

  function handleMarkAll() {
    markAll.mutate(undefined, {
      onSuccess: () =>
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
    });
  }

  function handleMarkOne(id: string) {
    markRead.mutate(
      { id },
      {
        onSuccess: () =>
          qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }),
      },
    );
  }

  const toneIcon = (tone: string) => {
    if (tone === "success") return <Check size={13} className="text-accent" />;
    if (tone === "warning")
      return <TriangleAlert size={13} className="text-yellow-500" />;
    return <Bell size={13} className="text-primary" />;
  };

  const toneRing = (tone: string) => {
    if (tone === "success") return "bg-accent/10 ring-accent/20";
    if (tone === "warning") return "bg-yellow-500/10 ring-yellow-500/20";
    return "bg-primary/10 ring-primary/20";
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted transition-colors"
        data-testid="button-notifications"
        aria-label="Open notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-extrabold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-[340px] rounded-xl border border-border bg-background shadow-2xl"
            data-testid="panel-notifications"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Notifications</span>
                {unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-extrabold text-primary-foreground">
                    {unread}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unread > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    data-testid="button-mark-all-read"
                  >
                    <CheckCheck size={13} /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2
                    className="animate-spin text-muted-foreground"
                    size={20}
                  />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center">
                  <Bell className="mx-auto text-muted-foreground" size={24} />
                  <p className="mt-3 text-sm font-bold">No notifications yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Deploy success/failure alerts will appear here.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30 ${!n.read ? "bg-primary/5" : ""}`}
                      data-testid={`notification-${n.id}`}
                    >
                      <div
                        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ring-1 ${toneRing(n.tone)}`}
                      >
                        {toneIcon(n.tone)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-semibold leading-snug ${!n.read ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">
                          {n.detail}
                        </p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground/60">
                          {new Date(n.createdAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      {!n.read && (
                        <button
                          onClick={() => handleMarkOne(n.id)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          data-testid={`button-read-${n.id}`}
                          title="Mark as read"
                        >
                          <Check size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
