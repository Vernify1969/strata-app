self.addEventListener("push", event => {
  let payload = { title: "TaskSpeck Strata", body: "You have an update." };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch (err) {
    payload.body = event.data ? event.data.text() : payload.body;
  }
  event.waitUntil(self.registration.showNotification(payload.title || "TaskSpeck Strata", { body: payload.body || "" }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
