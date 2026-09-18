export class RegistryStore {
  constructor(storage = new Map()) {
    this.storage = storage;
  }

  register(profile) {
    if (!profile || !profile.name) {
      throw new Error('invalid project profile');
    }
    this.storage.set(profile.name, {
      ...profile,
      managed: true,
      updatedAt: new Date().toISOString()
    });
    return this.storage.get(profile.name);
  }

  get(name) {
    return this.storage.get(name) ?? null;
  }

  list() {
    return Array.from(this.storage.values());
  }
}
