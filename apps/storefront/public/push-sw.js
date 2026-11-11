// The 64 Squares: shows notifications sent from the admin (Marketing → Notifications).
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: "The 64 Squares", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "The 64 Squares"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: data.icon || "/brand/logo-mark.png",
      badge: "/brand/logo-mark.png",
      image: data.image,
      data: { url: data.url || "/" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url === url && "focus" in w) return w.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
