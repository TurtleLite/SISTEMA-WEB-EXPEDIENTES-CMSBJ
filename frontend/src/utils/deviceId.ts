const KEY = 'sbj_device_id'

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      const rand = () => Math.random().toString(36).slice(2, 6).toUpperCase()
      id = `EQ-${rand()}-${rand()}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}