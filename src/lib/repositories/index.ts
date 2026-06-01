import { DexieCardRepository } from "./DexieCardRepository";
import { DexieUserRepository } from "./DexieUserRepository";
import { ApiUIDRemoteValidator } from "./ApiUIDRemoteValidator";
import { NavigatorOnlineStatusProvider } from "./NavigatorOnlineStatusProvider";

// Singleton instances - created once, injected at call sites
export const cardRepo = new DexieCardRepository();
export const userRepo = new DexieUserRepository();
export const uidRemoteValidator = new ApiUIDRemoteValidator();
export const onlineStatus = new NavigatorOnlineStatusProvider();
