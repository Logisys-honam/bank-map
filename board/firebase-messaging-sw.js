/* 순천센터 업무보드 v2.47 - 백그라운드 푸시 수신 */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const data = payload.data || payload || {};
  const notification = payload.notification || {};
  const title = data.title || notification.title || "순천센터 업무 알림";
  const body = data.body || notification.body || "새 업무가 등록되었습니다.";
  const url = data.url || "./";
  const category = data.categoryCode || "";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag: data.tag || `bank-watch-${category || "work"}`,
    renotify: true,
    data: {url, category}
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "./", self.location.href).href;
  event.waitUntil((async () => {
    const list = await clients.matchAll({type:"window", includeUncontrolled:true});
    for (const client of list) {
      try {
        if (new URL(client.url).origin === new URL(target).origin) {
          if ("navigate" in client) await client.navigate(target);
          return client.focus();
        }
      } catch (_) {}
    }
    return clients.openWindow(target);
  })());
});
